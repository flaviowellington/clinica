// Alerta de retorno, tabela de procedimentos e orçamentos (rules/orcamentos.md).
import { Router, type Request } from 'express'
import type { z } from 'zod'
import { db } from './db'
import { conferirSenha, exigir, usuarioDe } from './auth'
import { hojeNaClinica, normalizar } from '../../shared/regras'
import { CATEGORIA_PADRAO_ENTRADA } from '../../shared/financeiro'
import { totalOrcamento } from '../../shared/orcamentos'
import { normalizarFaces } from '../../shared/prontuario'
import type { Prisma } from './generated/prisma/client'
import {
  CancelarOrcamentoDto,
  DesaprovarOrcamentoDto,
  OrcamentoDto,
  RetornoDto,
} from '../../shared/dtos'
import { lerCorpo } from './dto'

const dia = (iso: string) => new Date(`${iso}T00:00:00Z`)
const isoDe = (d: Date) => d.toISOString().slice(0, 10)
const id = (req: Request) => Number(req.params.id) || 0
const dataIso = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v))
const hojeIso = () => hojeNaClinica()
const existe = (id: number, tipo: 'PACIENTE' | 'PROFISSIONAL') =>
  db.pessoa.findFirst({ where: { id, tipo, excluidoEm: null } })

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
  const b = lerCorpo(RetornoDto, req.body, res)
  if (!b) return
  const erros: Record<string, string> = {}
  if (!(await existe(b.pacienteId, 'PACIENTE'))) erros.pacienteId = 'Escolha o paciente.'
  if (!(await existe(b.profissionalId, 'PROFISSIONAL')))
    erros.profissionalId = 'Escolha o profissional.'
  if (Object.keys(erros).length) return res.status(400).json({ erro: 'Confira os campos.', erros })
  const r = await db.alertaRetorno.create({
    data: {
      ...b,
      data: dia(b.data),
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
  db.orcamento.findFirst({ where: { id: id(req), excluidoEm: null }, include: incluir })

/** Orçamento lido pelo DTO; os itens ganham nome e valor da tabela (R-012: o valor pode ser editado). */
async function lerOrcamento(b: z.output<typeof OrcamentoDto>) {
  const erros: Record<string, string> = {}
  const tabela = await db.procedimento.findMany({
    where: { id: { in: b.itens.map((i) => i.procedimentoId) } },
  })
  const itens = b.itens.map((i) => {
    const p = tabela.find((t) => t.id === i.procedimentoId)
    if (!p) erros.itens = 'Procedimento não encontrado.'
    return {
      procedimentoId: i.procedimentoId,
      nome: p?.nome ?? '',
      dente: i.dente,
      faces: i.dente ? normalizarFaces(i.faces) || null : null,
      valorCentavos: i.valorCentavos ?? p?.valorCentavos ?? 0,
    }
  })
  if (b.descontoCentavos > itens.reduce((s, i) => s + i.valorCentavos, 0))
    erros.descontoCentavos = 'O desconto passa do total.'
  return {
    erros,
    itens,
    dados: {
      observacoes: b.observacoes,
      descontoCentavos: b.descontoCentavos,
    },
  }
}

rotasOrcamentos.get('/', exigir('orcamento.ver'), async (req, res) => {
  const pacienteId = Number(req.query.pacienteId) || 0
  const lista = await db.orcamento.findMany({
    where: { pacienteId, excluidoEm: null },
    include: incluir,
    orderBy: { id: 'desc' },
  })
  res.json(lista.map(paraTela))
})

rotasOrcamentos.post('/', exigir('orcamento.editar'), async (req, res) => {
  const b = lerCorpo(OrcamentoDto, req.body, res)
  if (!b) return
  const { erros, itens, dados } = await lerOrcamento(b)
  const pacienteId = b.pacienteId ?? 0
  const profissionalId = b.profissionalId ?? 0
  if (!(await existe(pacienteId, 'PACIENTE'))) erros.pacienteId = 'Paciente não encontrado.'
  if (!(await existe(profissionalId, 'PROFISSIONAL')))
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
  // Editar recria os itens: apagaria o que já foi executado.
  if (o.itens.some((i) => i.executadoEm))
    return res.status(409).json({ erro: 'Já há procedimento executado: desfaça a execução antes.' })
  const b = lerCorpo(OrcamentoDto, req.body, res)
  if (!b) return
  const { erros, itens, dados } = await lerOrcamento(b)
  const profissionalId = b.profissionalId ?? o.profissionalId
  if (Object.keys(erros).length) return res.status(400).json({ erro: 'Confira os campos.', erros })
  const novo = await db.orcamento.update({
    where: { id: o.id },
    data: { ...dados, profissionalId, itens: { deleteMany: {}, create: itens } },
    include: incluir,
  })
  res.json(paraTela(novo))
})

/** R-018 e R-019: aprovar lança a venda e uma conta à vista; a forma se escolhe ao receber. */
rotasOrcamentos.post('/:id/aprovar', exigir('orcamento.aprovar'), async (req, res) => {
  const o = await acharOrcamento(req)
  if (!o) return res.status(404).json({ erro: 'Orçamento não encontrado.' })
  if (o.status !== 'ABERTO')
    return res.status(409).json({ erro: 'Este orçamento não está em aberto.' })
  const total = totalOrcamento(o.itens, o.descontoCentavos)
  const u = usuarioDe(res)
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
    db.contaFinanceira.create({
      data: {
        tipo: 'RECEBER',
        descricao: `Orçamento nº ${o.id}`,
        valorCentavos: total,
        vencimento: dia(hojeIso()),
        categoria: CATEGORIA_PADRAO_ENTRADA,
        pacienteId: o.pacienteId,
        orcamentoId: o.id,
        parcela: 1,
        totalParcelas: 1,
        criadoPorId: u.id,
      },
    }),
  ])
  res.json(paraTela((await acharOrcamento(req))!))
})

/** Exclusão lógica: só orçamento em aberto, que não gerou venda nem parcelas. */
rotasOrcamentos.delete('/:id', exigir('orcamento.editar'), async (req, res) => {
  const o = await acharOrcamento(req)
  if (!o) return res.status(404).json({ erro: 'Orçamento não encontrado.' })
  if (o.status !== 'ABERTO')
    return res
      .status(409)
      .json({ erro: 'Orçamento aprovado não pode ser excluído: desaprove ou cancele.' })
  if (o.itens.some((i) => i.executadoEm))
    return res.status(409).json({ erro: 'Já há procedimento executado: desfaça a execução antes.' })
  await db.orcamento.update({
    where: { id: o.id },
    data: { excluidoEm: new Date(), excluidoPorId: usuarioDe(res).id },
  })
  res.json({ ok: true })
})

/** R-037: desaprovar pede a senha de quem está logado e desfaz venda e parcelas. */
rotasOrcamentos.post('/:id/desaprovar', exigir('orcamento.aprovar'), async (req, res) => {
  const o = await acharOrcamento(req)
  if (!o) return res.status(404).json({ erro: 'Orçamento não encontrado.' })
  if (o.status !== 'APROVADO')
    return res.status(409).json({ erro: 'Este orçamento não está aprovado.' })
  const u = usuarioDe(res)
  const b = lerCorpo(DesaprovarOrcamentoDto, req.body, res)
  if (!b) return
  if (!(await conferirSenha(u.login, b.senha)))
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
  if (!lerCorpo(CancelarOrcamentoDto, req.body, res, null)) return
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
/**
 * Tira um procedimento de orçamento em aberto (pelo odontograma). A cópia fica no histórico de
 * alterações; sem itens, o orçamento é excluído (ele precisa de pelo menos um, R-010).
 */
rotasOrcamentos.delete('/itens/:id', exigir('orcamento.editar'), async (req, res) => {
  const item = await db.itemOrcamento.findUnique({
    where: { id: id(req) },
    include: { orcamento: { include: { _count: { select: { itens: true } } } } },
  })
  if (!item || item.orcamento.excluidoEm)
    return res.status(404).json({ erro: 'Procedimento não encontrado.' })
  if (item.orcamento.status !== 'ABERTO')
    return res.status(409).json({
      erro: 'Orçamento aprovado não muda: desaprove ou cancele em Orçamentos.',
    })
  const u = usuarioDe(res)
  const { orcamento, ...antes } = item
  await db.$transaction([
    db.alteracao.create({
      data: { tabela: 'ItemOrcamento', registroId: item.id, antes, usuarioId: u.id },
    }),
    db.itemOrcamento.delete({ where: { id: item.id } }),
    ...(orcamento._count.itens === 1
      ? [
          db.orcamento.update({
            where: { id: orcamento.id },
            data: { excluidoEm: new Date(), excluidoPorId: u.id },
          }),
        ]
      : []),
  ])
  res.json({ ok: true })
})

rotasOrcamentos.post('/itens/:id/executar', exigir('procedimento.executar'), async (req, res) => {
  const item = await db.itemOrcamento.findUnique({
    where: { id: id(req) },
    include: { orcamento: true },
  })
  if (!item) return res.status(404).json({ erro: 'Procedimento não encontrado.' })
  // Em aberto também executa: a clínica pode atender antes de aprovar ou receber.
  if (item.orcamento.excluidoEm || !['ABERTO', 'APROVADO'].includes(item.orcamento.status))
    return res
      .status(409)
      .json({ erro: 'Procedimento de orçamento cancelado ou excluído não pode ser executado.' })
  const novo = await db.itemOrcamento.update({
    where: { id: item.id },
    data: item.executadoEm
      ? { executadoEm: null, executadoPorId: null }
      : { executadoEm: new Date(), executadoPorId: usuarioDe(res).id },
  })
  res.json(novo)
})
