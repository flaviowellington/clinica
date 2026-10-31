// Contas a pagar e receber, fluxo de caixa, extrato, conciliação e os relatórios que dependem deles.
import { Router, type Request } from 'express'
import { db } from './db'
import { exigir, usuarioDe } from './auth'
import { pode } from '../../shared/permissoes'
import {
  CATEGORIAS,
  CATEGORIA_PADRAO_ENTRADA,
  PLANO_DE_CONTAS,
  grupoDe,
} from '../../shared/financeiro'
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

// ── Contas a pagar e a receber ──────────────────────────────────────────────
const comPaciente = { paciente: { select: { id: true, nome: true } } } as const
type ContaComPaciente = Prisma.ContaFinanceiraGetPayload<{ include: typeof comPaciente }>
const contaParaTela = (c: ContaComPaciente) => ({
  ...c,
  vencimento: isoDe(c.vencimento),
  pagoEm: c.pagoEm ? isoDe(c.pagoEm) : null,
})

rotasFinanceiroContas.get('/contas', exigir('financeiro.ver'), async (req, res) => {
  const tipo = req.query.tipo === 'PAGAR' ? 'PAGAR' : 'RECEBER'
  const status = String(req.query.status ?? '')
  const formas = String(req.query.formas ?? '')
    .split(',')
    .filter(Boolean)
  const data = periodo(req)
  const lista = await db.contaFinanceira.findMany({
    where: {
      tipo,
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
  const categoria = b.categoria ?? (tipo === 'RECEBER' ? CATEGORIA_PADRAO_ENTRADA : null)
  const erros: Record<string, string> = {}
  // R-054: a conta precisa estar no plano de contas.
  if (!categoria) erros.categoria = 'Escolha a conta do plano de contas.'
  else if (!CATEGORIAS.includes(categoria)) erros.categoria = 'Conta do plano de contas inválida.'
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

/**
 * Baixa: registra o pagamento ou recebimento e lança na conta corrente.
 * Receber pode ser feito pela Recepção.
 */
rotasFinanceiroContas.post('/contas/:id/baixar', async (req, res) => {
  const c = await db.contaFinanceira.findUnique({ where: { id: id(req) } })
  if (!c) return res.status(404).json({ erro: 'Conta não encontrada.' })
  const u = usuarioDe(res)
  const acao = c.tipo === 'RECEBER' ? 'financeiro.receber' : 'financeiro.editar'
  if (!pode(u.perfis, acao))
    return res.status(403).json({ erro: 'Você não tem permissão para esta ação.' })
  if (c.status !== 'ABERTA') return res.status(409).json({ erro: 'Esta conta não está em aberto.' })
  const b = lerCorpo(BaixarContaDto, req.body, res, null)
  if (!b) return
  const data = b.data ?? hojeNaClinica()
  const forma = b.forma ?? c.forma
  const novo = await db.$transaction(async (tx) => {
    const l = await tx.lancamento.create({
      data: {
        data: dia(data),
        tipo: c.tipo === 'PAGAR' ? 'SAIDA' : 'ENTRADA',
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

// ── Fluxo de caixa e extrato (R-052) ────────────────────────────────────────
/** Entradas menos saídas realizadas antes da data. */
async function saldoAntes(antes: Date, contaBancariaId?: number) {
  const g = await db.lancamento.groupBy({
    by: ['tipo'],
    where: {
      excluidoEm: null,
      data: { lt: antes },
      tipo: { in: ['ENTRADA', 'SAIDA'] },
      ...(contaBancariaId && { contaBancariaId }),
    },
    _sum: { valorCentavos: true },
  })
  const soma = (t: string) => g.find((x) => x.tipo === t)?._sum.valorCentavos ?? 0
  return soma('ENTRADA') - soma('SAIDA')
}

rotasFinanceiroContas.get('/fluxo', exigir('financeiro.ver'), async (req, res) => {
  const data = periodo(req)
  if (!data) return res.status(400).json({ erro: 'Período inválido.' })
  if (data.lte.getTime() - data.gte.getTime() > 400 * DIA_MS)
    return res.status(400).json({ erro: 'Escolha um período de até 13 meses.' })
  const [lancs, previstas, saldoAnterior] = await Promise.all([
    db.lancamento.findMany({
      where: { excluidoEm: null, data, tipo: { in: ['ENTRADA', 'SAIDA'] } },
    }),
    db.contaFinanceira.findMany({ where: { status: 'ABERTA', vencimento: data } }),
    saldoAntes(data.gte),
  ])
  let acumulado = saldoAnterior
  const dias = []
  for (let t = data.gte.getTime(); t <= data.lte.getTime(); t += DIA_MS) {
    const d = isoDe(new Date(t))
    const realizado = (tipo: string) =>
      lancs
        .filter((l) => l.tipo === tipo && isoDe(l.data) === d)
        .reduce((s, l) => s + l.valorCentavos, 0)
    const previsto = (tipo: string) =>
      previstas
        .filter((c) => c.tipo === tipo && isoDe(c.vencimento) === d)
        .reduce((s, c) => s + c.valorCentavos, 0)
    const linha = {
      data: d,
      entradas: realizado('ENTRADA'),
      saidas: realizado('SAIDA'),
      entradasPrevistas: previsto('RECEBER'),
      saidasPrevistas: previsto('PAGAR'),
      saldo: 0,
      acumulado: 0,
    }
    linha.saldo = linha.entradas - linha.saidas + linha.entradasPrevistas - linha.saidasPrevistas
    acumulado += linha.saldo
    linha.acumulado = acumulado
    dias.push(linha)
  }
  res.json({ saldoAnterior, dias })
})

/** Extrato: entradas e saídas realizadas em ordem, com o saldo depois de cada uma. */
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
      tipo: { in: ['ENTRADA', 'SAIDA'] },
      ...(contaBancariaId && { contaBancariaId }),
    },
    include: comPaciente,
    orderBy: [{ data: 'asc' }, { id: 'asc' }],
  })
  let saldo = saldoAnterior
  const itens = lista.map(({ excluidoPorId: _e, ...l }) => {
    saldo += l.tipo === 'ENTRADA' ? l.valorCentavos : -l.valorCentavos
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
        tipo: { in: ['ENTRADA', 'SAIDA'] },
        OR: [{ contaBancariaId: banco.id }, { contaBancariaId: null }],
      },
      include: comPaciente,
      orderBy: [{ data: 'asc' }, { id: 'asc' }],
    }),
    db.lancamento.groupBy({
      by: ['tipo'],
      where: { excluidoEm: null, contaBancariaId: banco.id, data: { lte: data.lte } },
      _sum: { valorCentavos: true },
    }),
  ])
  const soma = (t: string) => conferidos.find((x) => x.tipo === t)?._sum.valorCentavos ?? 0
  res.json({
    banco,
    saldoConciliado: banco.saldoInicialCentavos + soma('ENTRADA') - soma('SAIDA'),
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
type Linhas = (string | number)[][]
type Gerador = (p: { gte: Date; lte: Date }) => Promise<{ colunas: string[]; linhas: Linhas }>

const reais = (centavos: number) =>
  (centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dataBR = (d: Date) => isoDe(d).split('-').reverse().join('/')
/** Período em instantes (criadoEm, aprovadoEm…): inclui o dia final inteiro. */
const instantes = (p: { gte: Date; lte: Date }) => ({
  gte: p.gte,
  lt: new Date(p.lte.getTime() + DIA_MS),
})

export const GERADORES_FINANCEIRO: Record<string, Gerador> = {
  'agenda-retorno': async (data) => {
    const l = await db.alertaRetorno.findMany({
      where: { excluidoEm: null, data },
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
  'agenda-desmarcacoes': async (data) => {
    const l = await db.agendamento.findMany({
      where: { excluidoEm: null, desmarcadoEm: { not: null }, data },
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
  'pacientes-orcamentos': async (data) => {
    const l = await db.orcamento.findMany({
      where: { criadoEm: instantes(data), excluidoEm: null },
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
      where: { excluidoEm: null, data, tipo: { in: ['ENTRADA', 'SAIDA'] } },
      orderBy: { data: 'asc' },
    })
    const m = new Map<string, { entradas: number; saidas: number }>()
    for (const x of l) {
      const k = `${dataBR(x.data)}|${x.forma ?? 'Não informada'}`
      const g = m.get(k) ?? { entradas: 0, saidas: 0 }
      if (x.tipo === 'ENTRADA') g.entradas += x.valorCentavos
      else g.saidas += x.valorCentavos
      m.set(k, g)
    }
    return {
      colunas: ['Dia', 'Forma', 'Entradas (R$)', 'Saídas (R$)', 'Saldo (R$)'],
      linhas: [...m].map(([k, g]) => [
        ...k.split('|'),
        reais(g.entradas),
        reais(g.saidas),
        reais(g.entradas - g.saidas),
      ]),
    }
  },
  // R-043: DRE pelos grupos do plano de contas. Sem conta: entrada é receita, saída é despesa operacional.
  // ponytail: sem IR/CSLL; incluir as alíquotas quando a clínica informar o regime tributário.
  'financeiro-dre': async (data) => {
    const l = await db.lancamento.findMany({
      where: { excluidoEm: null, data, tipo: { in: ['ENTRADA', 'SAIDA'] } },
    })
    const g = Object.fromEntries(Object.keys(PLANO_DE_CONTAS).map((k) => [k, 0])) as Record<
      keyof typeof PLANO_DE_CONTAS,
      number
    >
    for (const x of l) {
      const grupo =
        grupoDe(x.categoria) ??
        (x.tipo === 'ENTRADA' ? 'Receita operacional bruta' : 'Despesas operacionais')
      g[grupo] += x.tipo === 'ENTRADA' ? x.valorCentavos : -x.valorCentavos
    }
    const receita = g['Receita operacional bruta']
    const liquida = receita + g['Deduções']
    const bruto = liquida + g['Custos']
    const operacional = bruto + g['Despesas operacionais']
    const resultado = operacional + g['Receitas não operacionais'] + g['Despesas não operacionais']
    return {
      colunas: ['Linha', 'Valor (R$)'],
      linhas: [
        ['Receita operacional bruta', reais(receita)],
        ['(-) Deduções', reais(g['Deduções'])],
        ['(=) Receita líquida', reais(liquida)],
        ['(-) Custos', reais(g['Custos'])],
        ['(=) Lucro bruto', reais(bruto)],
        ['(-) Despesas operacionais', reais(g['Despesas operacionais'])],
        ['(=) Resultado operacional', reais(operacional)],
        ['(+) Receitas não operacionais', reais(g['Receitas não operacionais'])],
        ['(-) Despesas não operacionais', reais(g['Despesas não operacionais'])],
        ['(=) Resultado do período', reais(resultado)],
      ],
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
  'tratamentos-abertos': async (data) => {
    const l = await db.orcamento.findMany({
      where: { status: 'APROVADO', aprovadoEm: instantes(data) },
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
  'tratamentos-executados': async (data) => {
    const l = await db.itemOrcamento.findMany({
      where: { executadoEm: instantes(data) },
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
