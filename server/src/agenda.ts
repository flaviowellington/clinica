import { Router, type Request } from 'express'
import { db } from './db'
import { exigir, usuarioDe } from './auth'
import {
  COM_CHECKIN,
  fimPadrao,
  paraHora,
  paraMinutos,
  validarAgendamento,
} from '../../shared/agenda'
import {
  AgendamentoDto,
  CategoriaAgendaDto,
  DesmarcarDto,
  HorarioAgendaDto,
  StatusAgendaDto,
} from '../../shared/dtos'
import { lerCorpo } from './dto'
import type { Prisma } from './generated/prisma/client'
import { lerConfig } from './configuracoes'
import { validarConfig } from '../../shared/configuracoes'

const comDados = {
  paciente: { select: { id: true, nome: true, celular: true } },
  profissional: { select: { id: true, nome: true } },
  criadoPor: { select: { nome: true } },
} satisfies Prisma.AgendamentoInclude

type ComDados = Prisma.AgendamentoGetPayload<{ include: typeof comDados }>

const paraTela = ({ excluidoPorId: _e, ...a }: ComDados) => ({
  ...a,
  data: a.data.toISOString().slice(0, 10),
})

const dia = (iso: string) => new Date(`${iso}T00:00:00Z`)

const acharAgendamento = (req: Request) =>
  db.agendamento.findFirst({
    where: { id: Number(req.params.id) || 0, excluidoEm: null, desmarcadoEm: null },
  })

const NAO_ACHOU = { erro: 'Agendamento não encontrado.' }

const ehProfissional = async (id: number) =>
  !!(await db.pessoa.findFirst({ where: { id, tipo: 'PROFISSIONAL', excluidoEm: null } }))

export const rotasAgenda = Router()

/** Profissionais para o filtro e o do usuário logado (B-013: usar quem está logado). */
rotasAgenda.get('/profissionais', exigir('agenda.ver'), async (_req, res) => {
  const profissionais = await db.pessoa.findMany({
    where: { tipo: 'PROFISSIONAL', excluidoEm: null, ativo: true },
    select: { id: true, nome: true, corAgenda: true },
    orderBy: { nomeBusca: 'asc' },
  })
  res.json({ profissionais, meuId: usuarioDe(res).pessoaId })
})

rotasAgenda.get('/', exigir('agenda.ver'), async (req, res) => {
  const de = String(req.query.de ?? '')
  const ate = String(req.query.ate ?? de)
  if (isNaN(Date.parse(de)) || isNaN(Date.parse(ate)))
    return res.status(400).json({ erro: 'Período inválido.' })
  const ids = String(req.query.profissionais ?? '')
    .split(',')
    .map(Number)
    .filter(Boolean)
  const lista = await db.agendamento.findMany({
    where: {
      excluidoEm: null,
      desmarcadoEm: null,
      data: { gte: dia(de), lte: dia(ate) },
      ...(ids.length && { profissionalId: { in: ids } }),
    },
    include: comDados,
    orderBy: [{ data: 'asc' }, { inicio: 'asc' }],
  })
  res.json(lista.map(paraTela))
})

rotasAgenda.post('/', exigir('agenda.editar'), async (req, res) => {
  const b = lerCorpo(AgendamentoDto, req.body, res)
  if (!b) return
  const compromisso = b.tipo === 'COMPROMISSO'
  const d = {
    tipo: b.tipo,
    data: b.data,
    inicio: b.inicio,
    fim: b.fim,
    profissionalId: b.profissionalId,
    pacienteId: compromisso ? null : b.pacienteId,
    titulo: compromisso ? b.titulo : null,
  }
  const erros = validarAgendamento(d)
  if (d.profissionalId && !(await ehProfissional(d.profissionalId)))
    erros.profissionalId = 'Profissional não encontrado.'
  if (d.pacienteId) {
    const p = await db.pessoa.findFirst({
      where: { id: d.pacienteId, tipo: 'PACIENTE', excluidoEm: null },
    })
    if (!p) erros.pacienteId = 'Paciente não encontrado.'
    else if (!p.ativo) erros.pacienteId = 'Paciente inativo não pode ter consulta marcada.'
  }
  if (Object.keys(erros).length) return res.status(400).json({ erro: 'Confira os campos.', erros })

  const categoria = b.categoria
  const criado = await db.agendamento.create({
    data: {
      ...d,
      data: dia(d.data!),
      inicio: d.inicio!,
      fim: d.fim ?? fimPadrao(d.inicio!),
      profissionalId: d.profissionalId!,
      categoria: categoria && categoria in (await lerConfig('categorias')) ? categoria : null,
      observacoes: b.observacoes,
      primeiraConsulta: b.primeiraConsulta,
      confirmacao: b.confirmacao,
      alerta: b.alerta,
      criadoPorId: usuarioDe(res).id,
    },
    include: comDados,
  })
  res.status(201).json(paraTela(criado))
})

/** Nova categoria (nome e cor) direto do agendamento; quem marca consulta pode criar. */
rotasAgenda.post('/categorias', exigir('agenda.editar'), async (req, res) => {
  const b = lerCorpo(CategoriaAgendaDto, req.body, res)
  if (!b) return
  const atuais = await lerConfig('categorias')
  const nome = b.nome ?? ''
  const v = validarConfig('categorias', { ...atuais, [nome]: b.cor })
  if (v.erro !== undefined) return res.status(400).json({ erro: v.erro })
  // Repetida com o mesmo nome exato: o objeto não cresce, então recusa aqui.
  if (nome in atuais) return res.status(400).json({ erro: `Já existe a categoria "${nome}".` })
  const valor = v.valor as Record<string, string>
  const alteradoPorId = usuarioDe(res).id
  await db.configuracao.upsert({
    where: { chave: 'categorias' },
    create: { chave: 'categorias', valor, alteradoPorId },
    update: { valor, alteradoPorId },
  })
  res.status(201).json(valor)
})

/** Troca o status; "Em espera" grava o check-in (R-031). Voltar antes da chegada limpa. */
rotasAgenda.patch('/:id/status', exigir('agenda.editar'), async (req, res) => {
  const a = await acharAgendamento(req)
  if (!a) return res.status(404).json(NAO_ACHOU)
  const b = lerCorpo(StatusAgendaDto, req.body, res, null)
  if (!b) return
  const { status } = b

  const agora = new Date()
  const chegou = COM_CHECKIN.includes(status)
  const atualizado = await db.agendamento.update({
    where: { id: a.id },
    data: {
      status,
      checkinEm: chegou ? (a.checkinEm ?? agora) : null,
      esperaInicio: chegou ? (a.esperaInicio ?? agora) : null,
      alteradoPorId: usuarioDe(res).id,
    },
    include: comDados,
  })
  res.json(paraTela(atualizado))
})

/** Move a consulta (arrastar, R-085), mantendo a duração. */
rotasAgenda.put('/:id/horario', exigir('agenda.editar'), async (req, res) => {
  const a = await acharAgendamento(req)
  if (!a) return res.status(404).json(NAO_ACHOU)
  const b = lerCorpo(HorarioAgendaDto, req.body, res)
  if (!b) return
  const d = {
    tipo: a.tipo,
    data: b.data,
    inicio: b.inicio,
    profissionalId: b.profissionalId ?? a.profissionalId,
    pacienteId: a.pacienteId,
    titulo: a.titulo,
  }
  const erros = validarAgendamento(d)
  if (!(await ehProfissional(d.profissionalId)))
    erros.profissionalId = 'Profissional não encontrado.'
  if (Object.keys(erros).length) return res.status(400).json({ erro: 'Confira os campos.', erros })

  const duracao = paraMinutos(a.fim) - paraMinutos(a.inicio)
  const atualizado = await db.agendamento.update({
    where: { id: a.id },
    data: {
      data: dia(d.data!),
      inicio: d.inicio!,
      fim: paraHora(paraMinutos(d.inicio!) + duracao),
      profissionalId: d.profissionalId,
      alteradoPorId: usuarioDe(res).id,
    },
    include: comDados,
  })
  res.json(paraTela(atualizado))
})

/** Exclusão lógica; recusada depois do check-in (R-034). DELETE, não GET (B-016). */
rotasAgenda.delete('/:id', exigir('agenda.editar'), async (req, res) => {
  const a = await acharAgendamento(req)
  if (!a) return res.status(404).json(NAO_ACHOU)
  if (COM_CHECKIN.includes(a.status))
    return res
      .status(409)
      .json({ erro: 'O paciente já chegou: volte o status para "Agendado" antes de excluir.' })
  await db.agendamento.update({
    where: { id: a.id },
    data: { excluidoEm: new Date(), excluidoPorId: usuarioDe(res).id },
  })
  res.json({ ok: true })
})

/** Desmarcar libera o horário e guarda o motivo; não vale depois da chegada (R-034). */
rotasAgenda.post('/:id/desmarcar', exigir('agenda.editar'), async (req, res) => {
  const a = await acharAgendamento(req)
  if (!a) return res.status(404).json(NAO_ACHOU)
  if (COM_CHECKIN.includes(a.status))
    return res
      .status(409)
      .json({ erro: 'O paciente já chegou: volte o status para "Agendado" antes de desmarcar.' })
  const b = lerCorpo(DesmarcarDto, req.body, res)
  if (!b) return
  const u = usuarioDe(res)
  const atualizado = await db.agendamento.update({
    where: { id: a.id },
    data: {
      desmarcadoEm: new Date(),
      desmarcadoPorId: u.id,
      motivoDesmarcacao: b.motivo,
      alteradoPorId: u.id,
    },
    include: comDados,
  })
  res.json(paraTela(atualizado))
})
