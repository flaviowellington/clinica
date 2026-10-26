// Confirmação e Alertas (F-002): lista do dia, envio por e-mail e confirmação pelo link.
import { createHmac, timingSafeEqual } from 'node:crypto'
import { Router, type Request } from 'express'
import { db } from './db'
import { exigir, usuarioDe } from './auth'
import { enviar, ErroEnvio } from './mensagens'
import { lerConfig } from './configuracoes'
import { preencherModelo } from '../../shared/prontuario'

const dia = (iso: string) => new Date(`${iso}T00:00:00Z`)
const isoDe = (d: Date) => d.toISOString().slice(0, 10)
const dataBR = (d: Date) => isoDe(d).split('-').reverse().join('/')
const dataIso = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v))

// ── Link de confirmação ─────────────────────────────────────────────────────
// O link leva o número da consulta e uma assinatura: ninguém confirma a consulta de outro
// trocando o número, e o link não expõe dado do paciente.
const assinatura = (id: number) =>
  createHmac('sha256', process.env.JWT_SEGREDO ?? '')
    .update(`confirmacao:${id}`)
    .digest('base64url')
    .slice(0, 24)

export const tokenConfirmacao = (id: number) => `${id}.${assinatura(id)}`

function idDoToken(token: string) {
  const [n, a = ''] = token.split('.')
  const id = Number(n)
  if (!Number.isInteger(id) || id <= 0) return null
  const certa = Buffer.from(assinatura(id))
  const recebida = Buffer.from(a)
  return certa.length === recebida.length && timingSafeEqual(certa, recebida) ? id : null
}

/** Endereço público do sistema, para o link do e-mail (URL_PUBLICA no server/.env). */
const linkConfirmacao = (id: number) =>
  `${(process.env.URL_PUBLICA ?? process.env.ORIGEM_WEB ?? 'http://localhost:5173').replace(/\/$/, '')}/confirmar/${tokenConfirmacao(id)}`

const incluir = {
  paciente: { select: { id: true, nome: true, celular: true, email: true } },
  profissional: { select: { id: true, nome: true } },
  mensagens: { orderBy: { id: 'desc' }, take: 3 },
} as const

const acharConsulta = (req: Request) =>
  db.agendamento.findFirst({
    where: {
      id: Number(req.params.id) || 0,
      tipo: 'CONSULTA',
      excluidoEm: null,
      desmarcadoEm: null,
    },
    include: incluir,
  })

export const rotasConfirmacoes = Router()

rotasConfirmacoes.get('/', exigir('agenda.ver'), async (req, res) => {
  if (!dataIso(req.query.data)) return res.status(400).json({ erro: 'Data inválida.' })
  const lista = await db.agendamento.findMany({
    where: { tipo: 'CONSULTA', excluidoEm: null, desmarcadoEm: null, data: dia(req.query.data) },
    include: incluir,
    orderBy: [{ inicio: 'asc' }, { id: 'asc' }],
  })
  res.json(lista.map(({ excluidoPorId: _e, ...a }) => ({ ...a, data: isoDe(a.data) })))
})

rotasConfirmacoes.post('/:id/enviar', exigir('agenda.editar'), async (req, res) => {
  const a = await acharConsulta(req)
  if (!a?.paciente) return res.status(404).json({ erro: 'Consulta não encontrada.' })
  const canal = ['EMAIL', 'WHATSAPP', 'SMS'].includes(req.body?.canal) ? req.body.canal : 'EMAIL'
  const destino = canal === 'EMAIL' ? a.paciente.email : a.paciente.celular
  if (canal === 'EMAIL' && !destino)
    return res.status(400).json({ erro: 'O paciente não tem e-mail no cadastro.' })
  const [clinica, mensagens] = await Promise.all([lerConfig('clinica'), lerConfig('mensagens')])
  const texto = preencherModelo(mensagens.confirmacao, {
    paciente: a.paciente.nome.split(' ')[0],
    clinica: clinica.nome,
    data: dataBR(a.data),
    horario: a.inicio,
    profissional: a.profissional.nome,
    link: linkConfirmacao(a.id),
  })
  try {
    const m = await enviar({
      canal,
      tipo: 'CONFIRMACAO',
      destino: destino ?? '',
      assunto: `Confirme sua consulta – ${clinica.nome}`,
      texto,
      agendamentoId: a.id,
      usuarioId: usuarioDe(res).id,
    })
    res.json(m)
  } catch (e) {
    res.status(e instanceof ErroEnvio ? e.status : 502).json({ erro: (e as Error).message })
  }
})

/** Confirmação à mão (paciente confirmou por telefone, por exemplo). */
rotasConfirmacoes.post('/:id/confirmar', exigir('agenda.editar'), async (req, res) => {
  const a = await acharConsulta(req)
  if (!a) return res.status(404).json({ erro: 'Consulta não encontrada.' })
  const u = usuarioDe(res)
  await db.agendamento.update({
    where: { id: a.id },
    data: {
      // Só sai de "Agendado": não volta uma consulta já em atendimento para "Confirmado".
      ...(a.status === 'AGENDADO' && { status: 'CONFIRMADO' }),
      confirmadoEm: new Date(),
      confirmadoPor: u.nome,
      alteradoPorId: u.id,
    },
  })
  res.json({ ok: true })
})

// ── Rotas públicas (sem login): a página que o paciente abre pelo link ──────
export const rotasPublicas = Router()

async function consultaDoToken(token: string) {
  const id = idDoToken(token)
  if (!id) return null
  return db.agendamento.findFirst({
    where: { id, tipo: 'CONSULTA', excluidoEm: null, desmarcadoEm: null },
    include: { paciente: { select: { nome: true } }, profissional: { select: { nome: true } } },
  })
}
const LINK_INVALIDO = { erro: 'Link inválido ou consulta desmarcada.' }

/** Mostra só o mínimo: primeiro nome, data, horário, profissional e a clínica. */
rotasPublicas.get('/confirmacao/:token', async (req, res) => {
  const a = await consultaDoToken(req.params.token)
  if (!a) return res.status(404).json(LINK_INVALIDO)
  const clinica = await lerConfig('clinica')
  res.json({
    paciente: a.paciente?.nome.split(' ')[0] ?? '',
    data: isoDe(a.data),
    horario: a.inicio,
    profissional: a.profissional.nome,
    clinica: clinica.nome,
    confirmado: !!a.confirmadoEm,
  })
})

rotasPublicas.post('/confirmacao/:token', async (req, res) => {
  const a = await consultaDoToken(req.params.token)
  if (!a) return res.status(404).json(LINK_INVALIDO)
  if (!a.confirmadoEm)
    await db.agendamento.update({
      where: { id: a.id },
      data: {
        ...(a.status === 'AGENDADO' && { status: 'CONFIRMADO' }),
        confirmadoEm: new Date(),
        confirmadoPor: 'Paciente',
      },
    })
  res.json({ mensagem: 'Presença confirmada. Obrigado!' })
})
