// Contas a receber, fluxo de caixa, extrato, conciliação e os relatórios que dependem deles.
import { Router, type Request } from 'express'
import { db } from './db'
import { exigir, usuarioDe } from './auth'
import { CATEGORIAS, CATEGORIA_PADRAO_ENTRADA } from '../../shared/financeiro'
import {
  STATUS_ORCAMENTO,
  dividirParcelas,
  totalOrcamento,
  vencimentos,
} from '../../shared/orcamentos'
import { hojeNaClinica } from '../../shared/regras'
import type { Prisma } from './generated/prisma/client'
import {
  BaixarContaDto,
  ConciliarDto,
  ContaBancariaDto,
  ContaFinanceiraDto,
} from '../../shared/dtos'
import { lerCorpo } from './dto'
import { doProfissional, naAgenda, type Gerador } from './relatorios'

const dia = (iso: string) => new Date(`${iso}T00:00:00Z`)
const isoDe = (d: Date) => d.toISOString().slice(0, 10)
const id = (req: Request) => Number(req.params.id) || 0
const DIA_MS = 86_400_000

export function periodo(req: Request) {
  const de = String(req.query.de ?? '')
  const ate = String(req.query.ate ?? de)
  if (isNaN(Date.parse(de)) || isNaN(Date.parse(ate))) return null
  return { gte: dia(de), lte: dia(ate) }
}

export const rotasFinanceiroContas = Router()

/** Um lançamento, para o recibo. */
rotasFinanceiroContas.get('/lancamentos/:id', exigir('financeiro.receber'), async (req, res) => {
  const l = await db.lancamento.findFirst({
    where: { id: id(req), excluidoEm: null },
    include: {
      paciente: { select: { id: true, nome: true, cpf: true } },
      criadoPor: { select: { nome: true } },
    },
  })
  if (!l) return res.status(404).json({ erro: 'Lançamento não encontrado.' })
  res.json({ ...l, data: isoDe(l.data) })
})

/** Marca o lançamento como conferido no extrato de uma conta bancária (null desmarca). */
rotasFinanceiroContas.patch(
  '/lancamentos/:id/conciliar',
  exigir('financeiro.editar'),
  async (req, res) => {
    const l = await db.lancamento.findFirst({ where: { id: id(req), excluidoEm: null } })
    if (!l) return res.status(404).json({ erro: 'Lançamento não encontrado.' })
    const b = lerCorpo(ConciliarDto, req.body, res)
    if (!b) return
    const { contaBancariaId } = b
    if (contaBancariaId && !(await db.contaBancaria.findUnique({ where: { id: contaBancariaId } })))
      return res.status(400).json({ erro: 'Conta bancária não encontrada.' })
    const novo = await db.lancamento.update({
      where: { id: l.id },
      data: { contaBancariaId, conciliadoEm: contaBancariaId ? new Date() : null },
    })
    res.json({ ...novo, data: isoDe(novo.data) })
  },
)

// ── Contas a receber ──────────────────────────────────────────────────────
const comPaciente = { paciente: { select: { id: true, nome: true } } } as const
type ContaComPaciente = Prisma.ContaFinanceiraGetPayload<{ include: typeof comPaciente }>
const contaParaTela = (c: ContaComPaciente) => ({
  ...c,
  vencimento: isoDe(c.vencimento),
  pagoEm: c.pagoEm ? isoDe(c.pagoEm) : null,
})

rotasFinanceiroContas.get('/contas', exigir('financeiro.ver'), async (req, res) => {
  const status = String(req.query.status ?? '')
  const formas = String(req.query.formas ?? '')
    .split(',')
    .filter(Boolean)
  const data = periodo(req)
  const lista = await db.contaFinanceira.findMany({
    where: {
      ...((status === 'ABERTA' || status === 'PAGA' || status === 'CANCELADA') && { status }),
      ...(formas.length && { forma: { in: formas } }),
      ...(data && { vencimento: data }),
    },
    include: comPaciente,
    orderBy: [{ vencimento: 'asc' }, { id: 'asc' }],
  })
  res.json(lista.map(contaParaTela))
})

/** Cria a conta; com "parcelas" > 1 divide o valor (R-015) e vence todo mês. */
rotasFinanceiroContas.post('/contas', exigir('financeiro.editar'), async (req, res) => {
  const b = lerCorpo(ContaFinanceiraDto, req.body, res)
  if (!b) return
  const { tipo, valorCentavos: valor, vencimento, descricao, forma, parcelas, pacienteId } = b
  const categoria = b.categoria ?? CATEGORIA_PADRAO_ENTRADA
  const erros: Record<string, string> = {}
  if (!CATEGORIAS.includes(categoria)) erros.categoria = 'Conta do plano de contas inválida.'
  if (pacienteId && !(await db.pessoa.findFirst({ where: { id: pacienteId, tipo: 'PACIENTE' } })))
    erros.pacienteId = 'Paciente não encontrado.'
  if (Object.keys(erros).length) return res.status(400).json({ erro: 'Confira os campos.', erros })

  const datas = vencimentos(vencimento, parcelas)
  const u = usuarioDe(res)
  const criadas = await db.$transaction(
    dividirParcelas(valor, parcelas).map((v, i) =>
      db.contaFinanceira.create({
        data: {
          tipo,
          descricao: parcelas > 1 ? `${descricao} – parcela ${i + 1}/${parcelas}` : descricao,
          valorCentavos: v,
          vencimento: dia(datas[i]),
          forma,
          categoria,
          detalhes: b.detalhes,
          pacienteId,
          parcela: parcelas > 1 ? i + 1 : null,
          totalParcelas: parcelas > 1 ? parcelas : null,
          criadoPorId: u.id,
        },
        include: comPaciente,
      }),
    ),
  )
  res.status(201).json(criadas.map(contaParaTela))
})

/** Baixa: registra o recebimento e lança na conta corrente. Pode ser feito pela Recepção. */
rotasFinanceiroContas.post('/contas/:id/baixar', exigir('financeiro.receber'), async (req, res) => {
  const c = await db.contaFinanceira.findUnique({ where: { id: id(req) } })
  if (!c) return res.status(404).json({ erro: 'Conta não encontrada.' })
  const u = usuarioDe(res)
  if (c.status !== 'ABERTA') return res.status(409).json({ erro: 'Esta conta não está em aberto.' })
  const b = lerCorpo(BaixarContaDto, req.body, res, null)
  if (!b) return
  const data = b.data ?? hojeNaClinica()
  const forma = b.forma ?? c.forma
  const novo = await db.$transaction(async (tx) => {
    const l = await tx.lancamento.create({
      data: {
        data: dia(data),
        tipo: 'ENTRADA',
        valorCentavos: c.valorCentavos,
        descricao: c.descricao,
        forma,
        categoria: c.categoria,
        pacienteId: c.pacienteId,
        orcamentoId: c.orcamentoId,
        criadoPorId: u.id,
      },
    })
    return tx.contaFinanceira.update({
      where: { id: c.id },
      data: { status: 'PAGA', pagoEm: dia(data), forma, lancamentoId: l.id },
      include: comPaciente,
    })
  })
  res.json(contaParaTela(novo))
})

rotasFinanceiroContas.post(
  '/contas/:id/cancelar',
  exigir('financeiro.editar'),
  async (req, res) => {
    const c = await db.contaFinanceira.findUnique({ where: { id: id(req) } })
    if (!c) return res.status(404).json({ erro: 'Conta não encontrada.' })
    if (c.status !== 'ABERTA')
      return res.status(409).json({ erro: 'Esta conta não está em aberto.' })
    const novo = await db.contaFinanceira.update({
      where: { id: c.id },
      data: { status: 'CANCELADA' },
      include: comPaciente,
    })
    res.json(contaParaTela(novo))
  },
)

// ── Análise: orçamentos aprovados (faturamento) e o que entrou ─────────────
/**
 * Orçamentos aprovados no período (data da aprovação na clínica) e as entradas recebidas
 * no período que vieram de orçamentos. ?profissionalId filtra os dois.
 * O front agrega tudo (cartões e gráficos).
 */
rotasFinanceiroContas.get('/analise', exigir('financeiro.ver'), async (req, res) => {
  const de = String(req.query.de ?? '')
  const ate = String(req.query.ate ?? de)
  if (isNaN(Date.parse(de)) || isNaN(Date.parse(ate)))
    return res.status(400).json({ erro: 'Período inválido.' })
  const profissionalId = Number(req.query.profissionalId) || undefined
  // Janela larga em UTC; o dia certo sai do fuso da clínica logo abaixo.
  const janela = {
    gte: new Date(dia(de).getTime() - DIA_MS),
    lt: new Date(dia(ate).getTime() + 2 * DIA_MS),
  }
  const [orcs, entradas] = await Promise.all([
    db.orcamento.findMany({
      where: { status: 'APROVADO', excluidoEm: null, aprovadoEm: janela, profissionalId },
      include: {
        paciente: { select: { id: true, nome: true } },
        profissional: { select: { id: true, nome: true } },
        itens: {
          select: {
            nome: true,
            valorCentavos: true,
            procedimento: { select: { especialidade: true } },
          },
        },
        lancamentos: {
          where: { tipo: 'ENTRADA', excluidoEm: null },
          select: { valorCentavos: true },
        },
      },
      orderBy: { aprovadoEm: 'desc' },
    }),
    db.lancamento.findMany({
      where: {
        tipo: 'ENTRADA',
        excluidoEm: null,
        data: { gte: dia(de), lte: dia(ate) },
        orcamento: { is: { profissionalId } },
        orcamentoId: { not: null },
      },
      select: {
        id: true,
        data: true,
        valorCentavos: true,
        forma: true,
        orcamento: { select: { profissional: { select: { id: true, nome: true } } } },
      },
      orderBy: { data: 'asc' },
    }),
  ])
  const orcamentos = orcs
    .map((o) => ({ ...o, aprovadoEm: hojeNaClinica(o.aprovadoEm!) }))
    .filter((o) => o.aprovadoEm >= de && o.aprovadoEm <= ate)
    .map(({ lancamentos, itens, ...o }) => ({
      id: o.id,
      aprovadoEm: o.aprovadoEm,
      paciente: o.paciente,
      profissional: o.profissional,
      descontoCentavos: o.descontoCentavos,
      totalCentavos: totalOrcamento(itens, o.descontoCentavos),
      recebidoCentavos: lancamentos.reduce((s, l) => s + l.valorCentavos, 0),
      itens: itens.map(({ procedimento, ...i }) => ({
        ...i,
        especialidade: procedimento.especialidade,
      })),
    }))
  res.json({
    orcamentos,
    entradas: entradas.map(({ orcamento, ...l }) => ({
      ...l,
      data: isoDe(l.data),
      profissional: orcamento!.profissional,
    })),
  })
})

/**
 * Orçamentos em aberto para aprovar quando o paciente pagar. ?de&ate filtram pela data em
 * que o orçamento foi feito (fuso da clínica); sem eles, todos. ?profissionalId filtra.
 */
rotasFinanceiroContas.get('/orcamentos-abertos', exigir('orcamento.ver'), async (req, res) => {
  const de = typeof req.query.de === 'string' ? req.query.de : ''
  const ate = typeof req.query.ate === 'string' ? req.query.ate : de
  const comPeriodo = !isNaN(Date.parse(de)) && !isNaN(Date.parse(ate))
  const lista = await db.orcamento.findMany({
    where: {
      status: 'ABERTO',
      excluidoEm: null,
      profissionalId: Number(req.query.profissionalId) || undefined,
      ...(comPeriodo && {
        criadoEm: {
          gte: new Date(dia(de).getTime() - DIA_MS),
          lt: new Date(dia(ate).getTime() + 2 * DIA_MS),
        },
      }),
    },
    include: {
      paciente: { select: { id: true, nome: true, celular: true } },
      profissional: { select: { id: true, nome: true, corAgenda: true } },
      itens: {
        orderBy: { id: 'asc' },
        select: {
          nome: true,
          dente: true,
          valorCentavos: true,
          procedimento: { select: { especialidade: true } },
        },
      },
    },
    orderBy: { criadoEm: 'desc' },
  })
  res.json(
    lista
      .map((o) => ({ ...o, criadoEm: hojeNaClinica(o.criadoEm) }))
      .filter((o) => !comPeriodo || (o.criadoEm >= de && o.criadoEm <= ate))
      .map((o) => ({
        id: o.id,
        criadoEm: o.criadoEm,
        observacoes: o.observacoes,
        paciente: o.paciente,
        profissional: o.profissional,
        descontoCentavos: o.descontoCentavos,
        totalCentavos: totalOrcamento(o.itens, o.descontoCentavos),
        itens: o.itens.map(({ procedimento, ...i }) => ({
          ...i,
          especialidade: procedimento.especialidade,
        })),
      })),
  )
})

// ── Fluxo de caixa e extrato (R-052) ────────────────────────────────────────
/** Entradas realizadas antes da data. */
async function saldoAntes(antes: Date, contaBancariaId?: number) {
  const g = await db.lancamento.aggregate({
    where: {
      excluidoEm: null,
      data: { lt: antes },
      tipo: 'ENTRADA',
      ...(contaBancariaId && { contaBancariaId }),
    },
    _sum: { valorCentavos: true },
  })
  return g._sum.valorCentavos ?? 0
}

rotasFinanceiroContas.get('/fluxo', exigir('financeiro.ver'), async (req, res) => {
  const data = periodo(req)
  if (!data) return res.status(400).json({ erro: 'Período inválido.' })
  if (data.lte.getTime() - data.gte.getTime() > 400 * DIA_MS)
    return res.status(400).json({ erro: 'Escolha um período de até 13 meses.' })
  const [lancs, previstas, saldoAnterior] = await Promise.all([
    db.lancamento.findMany({
      where: { excluidoEm: null, data, tipo: 'ENTRADA' },
    }),
    db.contaFinanceira.findMany({ where: { status: 'ABERTA', vencimento: data } }),
    saldoAntes(data.gte),
  ])
  let acumulado = saldoAnterior
  const dias = []
  for (let t = data.gte.getTime(); t <= data.lte.getTime(); t += DIA_MS) {
    const d = isoDe(new Date(t))
    const entradas = lancs
      .filter((l) => isoDe(l.data) === d)
      .reduce((s, l) => s + l.valorCentavos, 0)
    const entradasPrevistas = previstas
      .filter((c) => isoDe(c.vencimento) === d)
      .reduce((s, c) => s + c.valorCentavos, 0)
    const saldo = entradas + entradasPrevistas
    acumulado += saldo
    dias.push({ data: d, entradas, entradasPrevistas, saldo, acumulado })
  }
  res.json({ saldoAnterior, dias })
})

/** Extrato: entradas realizadas em ordem, com o saldo depois de cada uma. */
rotasFinanceiroContas.get('/extrato', exigir('financeiro.ver'), async (req, res) => {
  const data = periodo(req)
  if (!data) return res.status(400).json({ erro: 'Período inválido.' })
  const contaBancariaId = Number(req.query.contaBancariaId) || undefined
  const banco = contaBancariaId
    ? await db.contaBancaria.findUnique({ where: { id: contaBancariaId } })
    : null
  const saldoAnterior =
    (banco?.saldoInicialCentavos ?? 0) + (await saldoAntes(data.gte, contaBancariaId))
  const lista = await db.lancamento.findMany({
    where: {
      excluidoEm: null,
      data,
      tipo: 'ENTRADA',
      ...(contaBancariaId && { contaBancariaId }),
    },
    include: comPaciente,
    orderBy: [{ data: 'asc' }, { id: 'asc' }],
  })
  let saldo = saldoAnterior
  const itens = lista.map(({ excluidoPorId: _e, ...l }) => {
    saldo += l.valorCentavos
    return { ...l, data: isoDe(l.data), saldo }
  })
  res.json({ saldoAnterior, saldoFinal: saldo, itens })
})

// ── Contas bancárias e conciliação ──────────────────────────────────────────
rotasFinanceiroContas.get('/bancos', exigir('financeiro.ver'), async (_req, res) => {
  res.json(await db.contaBancaria.findMany({ where: { ativa: true }, orderBy: { nome: 'asc' } }))
})

rotasFinanceiroContas.post('/bancos', exigir('financeiro.editar'), async (req, res) => {
  const b = lerCorpo(ContaBancariaDto, req.body, res)
  if (!b) return
  const c = await db.contaBancaria.create({ data: b })
  res.status(201).json(c)
})

/** Lançamentos do período (desta conta ou ainda sem conta) e o saldo já conferido até o fim do período. */
rotasFinanceiroContas.get('/conciliacao', exigir('financeiro.ver'), async (req, res) => {
  const data = periodo(req)
  const banco = await db.contaBancaria.findUnique({
    where: { id: Number(req.query.contaBancariaId) || 0 },
  })
  if (!data || !banco)
    return res.status(400).json({ erro: 'Escolha a conta bancária e o período.' })
  const [lista, conferidos] = await Promise.all([
    db.lancamento.findMany({
      where: {
        excluidoEm: null,
        data,
        tipo: 'ENTRADA',
        OR: [{ contaBancariaId: banco.id }, { contaBancariaId: null }],
      },
      include: comPaciente,
      orderBy: [{ data: 'asc' }, { id: 'asc' }],
    }),
    db.lancamento.aggregate({
      where: {
        excluidoEm: null,
        tipo: 'ENTRADA',
        contaBancariaId: banco.id,
        data: { lte: data.lte },
      },
      _sum: { valorCentavos: true },
    }),
  ])
  res.json({
    banco,
    saldoConciliado: banco.saldoInicialCentavos + (conferidos._sum.valorCentavos ?? 0),
    lancamentos: lista.map((l) => ({
      id: l.id,
      data: isoDe(l.data),
      tipo: l.tipo,
      descricao: l.descricao,
      forma: l.forma,
      paciente: l.paciente,
      valorCentavos: l.valorCentavos,
      conciliado: l.contaBancariaId === banco.id,
    })),
  })
})

// ── Relatórios que dependem de retorno, desmarcação, orçamento e plano de contas ──

const reais = (centavos: number) =>
  (centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dataBR = (d: Date) => isoDe(d).split('-').reverse().join('/')
/** Período em instantes (criadoEm, aprovadoEm…): inclui o dia final inteiro. */
const instantes = (p: { gte: Date; lte: Date }) => ({
  gte: p.gte,
  lt: new Date(p.lte.getTime() + DIA_MS),
})

export const GERADORES_FINANCEIRO: Record<string, Gerador> = {
  'agenda-retorno': async (data, f) => {
    const l = await db.alertaRetorno.findMany({
      where: { ...doProfissional(f), excluidoEm: null, data },
      include: { paciente: true, profissional: true },
      orderBy: { data: 'asc' },
    })
    return {
      colunas: ['Data', 'Paciente', 'Celular', 'Profissional', 'Motivo', 'Situação'],
      linhas: l.map((r) => [
        dataBR(r.data),
        r.paciente.nome,
        r.paciente.celular ?? '',
        r.profissional.nome,
        r.motivo ?? '',
        r.concluidoEm ? 'Concluído' : 'Em aberto',
      ]),
    }
  },
  'agenda-desmarcacoes': async (data, f) => {
    const l = await db.agendamento.findMany({
      where: { ...naAgenda(f), excluidoEm: null, desmarcadoEm: { not: null }, data },
      include: { paciente: true, profissional: true },
      orderBy: [{ data: 'asc' }, { inicio: 'asc' }],
    })
    return {
      colunas: ['Data', 'Horário', 'Paciente', 'Profissional', 'Motivo', 'Desmarcada em'],
      linhas: l.map((a) => [
        dataBR(a.data),
        a.inicio,
        a.paciente?.nome ?? a.titulo ?? '',
        a.profissional.nome,
        a.motivoDesmarcacao ?? '',
        dataBR(a.desmarcadoEm!),
      ]),
    }
  },
  'pacientes-orcamentos': async (data, f) => {
    const l = await db.orcamento.findMany({
      where: { ...doProfissional(f), criadoEm: instantes(data), excluidoEm: null },
      include: { paciente: true, profissional: true, itens: true },
      orderBy: { id: 'asc' },
    })
    return {
      colunas: ['Nº', 'Data', 'Paciente', 'Profissional', 'Situação', 'Total (R$)'],
      linhas: l.map((o) => [
        o.id,
        dataBR(o.criadoEm),
        o.paciente.nome,
        o.profissional.nome,
        STATUS_ORCAMENTO[o.status],
        reais(totalOrcamento(o.itens, o.descontoCentavos)),
      ]),
    }
  },
  'financeiro-caixa': async (data) => {
    const l = await db.lancamento.findMany({
      where: { excluidoEm: null, data, tipo: 'ENTRADA' },
      orderBy: { data: 'asc' },
    })
    const m = new Map<string, number>()
    for (const x of l) {
      const k = `${dataBR(x.data)}|${x.forma ?? 'Não informada'}`
      m.set(k, (m.get(k) ?? 0) + x.valorCentavos)
    }
    return {
      colunas: ['Dia', 'Forma', 'Faturamento (R$)'],
      linhas: [...m].map(([k, v]) => [...k.split('|'), reais(v)]),
    }
  },
  'financeiro-recibos': async (data) => {
    const l = await db.lancamento.findMany({
      where: { excluidoEm: null, data, tipo: 'ENTRADA', pacienteId: { not: null } },
      include: { paciente: true },
      orderBy: { data: 'asc' },
    })
    return {
      colunas: ['Recibo nº', 'Data', 'Paciente', 'Referente a', 'Forma', 'Valor (R$)'],
      linhas: l.map((x) => [
        x.id,
        dataBR(x.data),
        x.paciente!.nome,
        x.descricao,
        x.forma ?? '',
        reais(x.valorCentavos),
      ]),
    }
  },
  // Em aberto: todo aprovado com item a realizar, aprovado em qualquer data.
  'tratamentos-abertos': async (_, f) => {
    const l = await db.orcamento.findMany({
      where: { ...doProfissional(f), status: 'APROVADO' },
      include: {
        paciente: true,
        profissional: true,
        itens: { where: { executadoEm: null }, orderBy: { id: 'asc' } },
      },
      orderBy: { aprovadoEm: 'asc' },
    })
    return {
      colunas: ['Nº', 'Aprovado em', 'Paciente', 'Profissional', 'A realizar'],
      linhas: l
        .filter((o) => o.itens.length)
        .map((o) => [
          o.id,
          dataBR(o.aprovadoEm!),
          o.paciente.nome,
          o.profissional.nome,
          o.itens.map((i) => (i.dente ? `${i.nome} (${i.dente})` : i.nome)).join('; '),
        ]),
    }
  },
  'tratamentos-executados': async (data, f) => {
    const l = await db.itemOrcamento.findMany({
      where: { executadoEm: instantes(data), orcamento: doProfissional(f) },
      include: { orcamento: { include: { paciente: true, profissional: true } } },
      orderBy: { executadoEm: 'asc' },
    })
    return {
      colunas: ['Data', 'Paciente', 'Procedimento', 'Dente', 'Profissional', 'Valor (R$)'],
      linhas: l.map((i) => [
        dataBR(i.executadoEm!),
        i.orcamento.paciente.nome,
        i.nome,
        i.dente ?? '',
        i.orcamento.profissional.nome,
        reais(i.valorCentavos),
      ]),
    }
  },
}
