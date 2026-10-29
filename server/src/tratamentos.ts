// Alerta de retorno, tabela de procedimentos e orçamentos (rules/orcamentos.md).
import { Router, type Request } from 'express'
import { db } from './db'
import { conferirSenha, exigir, usuarioDe } from './auth'
import { hojeNaClinica, normalizar } from '../../shared/regras'
import { CATEGORIA_PADRAO_ENTRADA, FORMAS } from '../../shared/financeiro'
import { dividirParcelas, totalOrcamento, umMesDepois, vencimentos } from '../../shared/orcamentos'
import type { Prisma } from './generated/prisma/client'

const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const dia = (iso: string) => new Date(`${iso}T00:00:00Z`)
const isoDe = (d: Date) => d.toISOString().slice(0, 10)
const id = (req: Request) => Number(req.params.id) || 0
const dataIso = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v))
const hojeIso = () => hojeNaClinica()

// ── Alerta de retorno (E-008) ───────────────────────────────────────────────
export const rotasRetornos = Router()

const comPessoas = {
  paciente: { select: { id: true, nome: true, celular: true, telefone: true, email: true } },
  profissional: { select: { id: true, nome: true } },
} as const

// ponytail: antecedência fixa; vira configuração se a clínica pedir.
/** O aviso automático do retorno sai esta quantidade de dias antes da data. */
export const ANTECEDENCIA_RETORNO = 7
/** Dia (aaaa-mm-dd) em que o aviso deve sair. */
export const envioPrevisto = (data: Date) =>
  isoDe(new Date(data.getTime() - ANTECEDENCIA_RETORNO * 86_400_000))

/**
 * Abertos até a data final (padrão: daqui a 60 dias). Sem "de", inclui os atrasados:
 * o alerta só sai da lista quando o paciente confirma ou desmarca.
 */
rotasRetornos.get('/', exigir('agenda.ver'), async (req, res) => {
  const ate = dataIso(req.query.ate) ? req.query.ate : isoDe(new Date(Date.now() + 60 * 86_400_000))
  const lista = await db.alertaRetorno.findMany({
    where: {
      excluidoEm: null,
      concluidoEm: null,
      data: { gte: dataIso(req.query.de) ? dia(req.query.de) : undefined, lte: dia(ate) },
    },
    include: { ...comPessoas, mensagens: { orderBy: { id: 'desc' }, take: 20 } },
    orderBy: { data: 'asc' },
  })
  res.json(lista.map((r) => ({ ...r, data: isoDe(r.data), envioPrevisto: envioPrevisto(r.data) })))
})

rotasRetornos.post('/', exigir('agenda.editar'), async (req, res) => {
  const b = req.body ?? {}
  const erros: Record<string, string> = {}
  const pacienteId = Number(b.pacienteId) || 0
  const profissionalId = Number(b.profissionalId) || 0
  if (
    !(await db.pessoa.findFirst({ where: { id: pacienteId, tipo: 'PACIENTE', excluidoEm: null } }))
  )
    erros.pacienteId = 'Escolha o paciente.'
  if (
    !(await db.pessoa.findFirst({
      where: { id: profissionalId, tipo: 'PROFISSIONAL', excluidoEm: null },
    }))
  )
    erros.profissionalId = 'Escolha o profissional.'
  if (!dataIso(b.data)) erros.data = 'Informe a data do retorno.'
  if (Object.keys(erros).length) return res.status(400).json({ erro: 'Confira os campos.', erros })
  const r = await db.alertaRetorno.create({
    data: {
      pacienteId,
      profissionalId,
      data: dia(b.data),
      motivo: texto(b.motivo),
      criadoPorId: usuarioDe(res).id,
    },
    include: comPessoas,
  })
  res.status(201).json({ ...r, data: isoDe(r.data) })
})

rotasRetornos.delete('/:id', exigir('agenda.editar'), async (req, res) => {
  const r = await db.alertaRetorno.findFirst({ where: { id: id(req), excluidoEm: null } })
  if (!r) return res.status(404).json({ erro: 'Alerta não encontrado.' })
  await db.alertaRetorno.update({ where: { id: r.id }, data: { excluidoEm: new Date() } })
  res.json({ ok: true })
})

// ── Tabela de procedimentos (E-009) ─────────────────────────────────────────
export const rotasProcedimentos = Router()

/** R-013: acha o texto em qualquer parte do nome, sem acento nem maiúsculas. */
rotasProcedimentos.get('/', exigir('orcamento.ver'), async (req, res) => {
  const termo = normalizar(String(req.query.busca ?? ''))
  // ?todos=1: a tabela inteira, com os inativos (tela de Configurações).
  const todos = req.query.todos === '1'
  res.json(
    await db.procedimento.findMany({
      where: { ...(!todos && { ativo: true }), ...(termo && { nomeBusca: { contains: termo } }) },
      select: { id: true, nome: true, especialidade: true, valorCentavos: true, ativo: true },
      orderBy: { nomeBusca: 'asc' },
      take: todos ? 2000 : 50,
    }),
  )
})

// ── Orçamentos (E-003, E-004, E-005) ────────────────────────────────────────
export const rotasOrcamentos = Router()

const incluir = {
  itens: { orderBy: { id: 'asc' } },
  profissional: { select: { id: true, nome: true } },
  paciente: { select: { id: true, nome: true } },
  criadoPor: { select: { nome: true } },
  contas: {
    orderBy: { parcela: 'asc' },
    select: {
      id: true,
      parcela: true,
      valorCentavos: true,
      vencimento: true,
      forma: true,
      status: true,
    },
  },
} satisfies Prisma.OrcamentoInclude
type OrcamentoCompleto = Prisma.OrcamentoGetPayload<{ include: typeof incluir }>

const paraTela = (o: OrcamentoCompleto) => ({
  ...o,
  primeiroVencimento: o.primeiroVencimento ? isoDe(o.primeiroVencimento) : null,
  totalCentavos: totalOrcamento(o.itens, o.descontoCentavos),
  contas: o.contas.map((c) => ({ ...c, vencimento: isoDe(c.vencimento) })),
})

const acharOrcamento = (req: Request) =>
  db.orcamento.findUnique({ where: { id: id(req) }, include: incluir })

/** Lê e valida o corpo do orçamento; devolve os itens já com nome e valor da tabela. */
async function lerOrcamento(b: Record<string, unknown>) {
  const erros: Record<string, string> = {}
  const itensBrutos = Array.isArray(b.itens) ? (b.itens as Record<string, unknown>[]) : []
  if (!itensBrutos.length) erros.itens = 'Adicione pelo menos um procedimento.'
  const ids = itensBrutos.map((i) => Number(i.procedimentoId) || 0)
  const tabela = await db.procedimento.findMany({ where: { id: { in: ids } } })
  const itens = itensBrutos.map((i, n) => {
    const p = tabela.find((t) => t.id === ids[n])
    if (!p) erros.itens = 'Procedimento não encontrado.'
    // R-012: valor vem da tabela e pode ser editado.
    const valor =
      Number.isInteger(i.valorCentavos) && (i.valorCentavos as number) >= 0
        ? (i.valorCentavos as number)
        : (p?.valorCentavos ?? 0)
    return {
      procedimentoId: ids[n],
      nome: p?.nome ?? '',
      dente: texto(i.dente)?.slice(0, 40) ?? null,
      valorCentavos: valor,
    }
  })
  const desconto = Number.isInteger(b.descontoCentavos)
    ? Math.max(0, b.descontoCentavos as number)
    : 0
  if (desconto > itens.reduce((s, i) => s + i.valorCentavos, 0))
    erros.descontoCentavos = 'O desconto passa do total.'
  const forma = texto(b.forma)
  if (forma && !(FORMAS as readonly string[]).includes(forma))
    erros.forma = 'Forma de pagamento inválida.'
  const parcelas = Math.min(24, Math.max(1, Number(b.parcelas) || 1))
  const primeiro = dataIso(b.primeiroVencimento) ? b.primeiroVencimento : null
  return {
    erros,
    itens,
    dados: {
      observacoes: texto(b.observacoes),
      descontoCentavos: desconto,
      forma,
      parcelas,
      primeiroVencimento: primeiro ? dia(primeiro) : null,
    },
  }
}

rotasOrcamentos.get('/', exigir('orcamento.ver'), async (req, res) => {
  const pacienteId = Number(req.query.pacienteId) || 0
  const lista = await db.orcamento.findMany({
    where: { pacienteId },
    include: incluir,
    orderBy: { id: 'desc' },
  })
  res.json(lista.map(paraTela))
})

rotasOrcamentos.post('/', exigir('orcamento.editar'), async (req, res) => {
  const b = req.body ?? {}
  const { erros, itens, dados } = await lerOrcamento(b)
  const pacienteId = Number(b.pacienteId) || 0
  const profissionalId = Number(b.profissionalId) || 0
  if (
    !(await db.pessoa.findFirst({ where: { id: pacienteId, tipo: 'PACIENTE', excluidoEm: null } }))
  )
    erros.pacienteId = 'Paciente não encontrado.'
  if (
    !(await db.pessoa.findFirst({
      where: { id: profissionalId, tipo: 'PROFISSIONAL', excluidoEm: null },
    }))
  )
    erros.profissionalId = 'Escolha o profissional.'
  if (Object.keys(erros).length) return res.status(400).json({ erro: 'Confira os campos.', erros })
  const o = await db.orcamento.create({
    data: {
      ...dados,
      pacienteId,
      profissionalId,
      criadoPorId: usuarioDe(res).id,
      itens: { create: itens },
    },
    include: incluir,
  })
  res.status(201).json(paraTela(o))
})

/** Só orçamento em aberto pode ser editado (R-038). */
rotasOrcamentos.put('/:id', exigir('orcamento.editar'), async (req, res) => {
  const o = await acharOrcamento(req)
  if (!o) return res.status(404).json({ erro: 'Orçamento não encontrado.' })
  if (o.status !== 'ABERTO')
    return res.status(409).json({ erro: 'Só dá para editar orçamento em aberto.' })
  const { erros, itens, dados } = await lerOrcamento(req.body ?? {})
  const profissionalId = Number(req.body?.profissionalId) || o.profissionalId
  if (Object.keys(erros).length) return res.status(400).json({ erro: 'Confira os campos.', erros })
  const novo = await db.orcamento.update({
    where: { id: o.id },
    data: { ...dados, profissionalId, itens: { deleteMany: {}, create: itens } },
    include: incluir,
  })
  res.json(paraTela(novo))
})

/** R-018 e R-019: aprovar lança a venda e cria as parcelas a receber. */
rotasOrcamentos.post('/:id/aprovar', exigir('orcamento.aprovar'), async (req, res) => {
  const o = await acharOrcamento(req)
  if (!o) return res.status(404).json({ erro: 'Orçamento não encontrado.' })
  if (o.status !== 'ABERTO')
    return res.status(409).json({ erro: 'Este orçamento não está em aberto.' })
  if (!o.forma)
    return res.status(400).json({ erro: 'Defina a forma de pagamento antes de aprovar.' })
  const total = totalOrcamento(o.itens, o.descontoCentavos)
  const u = usuarioDe(res)
  const primeiro = o.primeiroVencimento
    ? isoDe(o.primeiroVencimento)
    : o.parcelas > 1
      ? umMesDepois(hojeIso())
      : hojeIso()
  const datas = vencimentos(primeiro, o.parcelas)
  const valores = dividirParcelas(total, o.parcelas)
  await db.$transaction([
    db.orcamento.update({
      where: { id: o.id },
      data: { status: 'APROVADO', aprovadoEm: new Date(), aprovadoPorId: u.id },
    }),
    db.lancamento.create({
      data: {
        data: dia(hojeIso()),
        tipo: 'VENDA',
        valorCentavos: total,
        descricao: `Orçamento nº ${o.id} aprovado`,
        categoria: CATEGORIA_PADRAO_ENTRADA,
        pacienteId: o.pacienteId,
        orcamentoId: o.id,
        criadoPorId: u.id,
      },
    }),
    db.contaFinanceira.createMany({
      data: valores.map((v, i) => ({
        tipo: 'RECEBER' as const,
        descricao: `Orçamento nº ${o.id} – parcela ${i + 1}/${o.parcelas}`,
        valorCentavos: v,
        vencimento: dia(datas[i]),
        forma: o.forma,
        categoria: CATEGORIA_PADRAO_ENTRADA,
        pacienteId: o.pacienteId,
        orcamentoId: o.id,
        parcela: i + 1,
        totalParcelas: o.parcelas,
        criadoPorId: u.id,
      })),
    }),
  ])
  res.json(paraTela((await acharOrcamento(req))!))
})

rotasOrcamentos.post('/:id/reprovar', exigir('orcamento.editar'), async (req, res) => {
  const o = await acharOrcamento(req)
  if (!o) return res.status(404).json({ erro: 'Orçamento não encontrado.' })
  if (o.status !== 'ABERTO')
    return res.status(409).json({ erro: 'Só dá para reprovar orçamento em aberto.' })
  const novo = await db.orcamento.update({
    where: { id: o.id },
    data: { status: 'REPROVADO', motivoReprovacao: texto(req.body?.motivo) },
    include: incluir,
  })
  res.json(paraTela(novo))
})

/** R-037: desaprovar pede a senha de quem está logado e desfaz venda e parcelas. */
rotasOrcamentos.post('/:id/desaprovar', exigir('orcamento.aprovar'), async (req, res) => {
  const o = await acharOrcamento(req)
  if (!o) return res.status(404).json({ erro: 'Orçamento não encontrado.' })
  if (o.status !== 'APROVADO')
    return res.status(409).json({ erro: 'Este orçamento não está aprovado.' })
  const u = usuarioDe(res)
  if (!(await conferirSenha(u.login, String(req.body?.senha ?? ''))))
    return res.status(401).json({ erro: 'Senha incorreta.' })
  if (o.contas.some((c) => c.status === 'PAGA'))
    return res
      .status(409)
      .json({ erro: 'Já há parcela recebida: cancele o orçamento em vez de desaprovar.' })
  if (o.itens.some((i) => i.executadoEm))
    return res
      .status(409)
      .json({ erro: 'Já há procedimento executado: cancele o orçamento em vez de desaprovar.' })
  await db.$transaction([
    db.orcamento.update({
      where: { id: o.id },
      data: { status: 'ABERTO', aprovadoEm: null, aprovadoPorId: null },
    }),
    db.lancamento.updateMany({
      where: { orcamentoId: o.id, excluidoEm: null },
      data: { excluidoEm: new Date(), excluidoPorId: u.id },
    }),
    db.contaFinanceira.updateMany({
      where: { orcamentoId: o.id, status: 'ABERTA' },
      data: { status: 'CANCELADA' },
    }),
  ])
  res.json(paraTela((await acharOrcamento(req))!))
})

/** R-036: cancelar aprovado é irreversível; a venda fica e entra um lançamento de cancelamento. */
rotasOrcamentos.post('/:id/cancelar', exigir('orcamento.cancelar'), async (req, res) => {
  const o = await acharOrcamento(req)
  if (!o) return res.status(404).json({ erro: 'Orçamento não encontrado.' })
  if (o.status !== 'APROVADO')
    return res.status(409).json({ erro: 'Só dá para cancelar orçamento aprovado.' })
  if (req.body?.ciente !== true)
    return res.status(400).json({ erro: 'Confirme que está ciente de que a ação é irreversível.' })
  const u = usuarioDe(res)
  await db.$transaction([
    db.orcamento.update({
      where: { id: o.id },
      data: { status: 'CANCELADO', canceladoEm: new Date() },
    }),
    db.contaFinanceira.updateMany({
      where: { orcamentoId: o.id, status: 'ABERTA' },
      data: { status: 'CANCELADA' },
    }),
    db.lancamento.create({
      data: {
        data: dia(hojeIso()),
        tipo: 'CANCELAMENTO',
        valorCentavos: totalOrcamento(o.itens, o.descontoCentavos),
        descricao: `Orçamento nº ${o.id} cancelado`,
        pacienteId: o.pacienteId,
        orcamentoId: o.id,
        criadoPorId: u.id,
      },
    }),
  ])
  res.json(paraTela((await acharOrcamento(req))!))
})

/** Marca (ou desmarca) um procedimento de orçamento aprovado como executado. */
rotasOrcamentos.post('/itens/:id/executar', exigir('procedimento.executar'), async (req, res) => {
  const item = await db.itemOrcamento.findUnique({
    where: { id: id(req) },
    include: { orcamento: true },
  })
  if (!item) return res.status(404).json({ erro: 'Procedimento não encontrado.' })
  if (item.orcamento.status !== 'APROVADO')
    return res
      .status(409)
      .json({ erro: 'Só procedimento de orçamento aprovado pode ser executado.' })
  const novo = await db.itemOrcamento.update({
    where: { id: item.id },
    data: item.executadoEm
      ? { executadoEm: null, executadoPorId: null }
      : { executadoEm: new Date(), executadoPorId: usuarioDe(res).id },
  })
  res.json(novo)
})
