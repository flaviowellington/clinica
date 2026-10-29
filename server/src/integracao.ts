// Integração com automações externas (n8n) para o aviso de retorno por WhatsApp/e-mail.
//
// ── Como ligar ──────────────────────────────────────────────────────────────
// 1. Ponha no server/.env um segredo longo: INTEGRACAO_TOKEN="...". Sem ele, estas rotas
//    respondem 503 (desligado).
// 2. No n8n, toda chamada leva o cabeçalho  Authorization: Bearer <INTEGRACAO_TOKEN>.
// 3. Fluxo de envio (ex.: gatilho "Schedule" toda manhã):
//      GET  /api/integracao/retornos/pendentes   → lista do que já está na hora de avisar
//      (envia a mensagem pelo WhatsApp)
//      POST /api/integracao/retornos/:id/eventos  { "tipo": "ENVIADO" }
//                                                 { "tipo": "FALHOU", "erro": "..." }
// 4. Fluxo de resposta (gatilho do WhatsApp quando o paciente responde):
//      POST /api/integracao/retornos/:id/eventos
//        { "tipo": "RESPOSTA", "texto": "...", "situacao": "CONFIRMADO" | "DESMARCADO" }
//      Sem "situacao", fica como "Respondeu" e a recepção decide.
//    "canal" (WHATSAPP, EMAIL, SMS) é opcional em todos; o padrão é WHATSAPP.
import { createHash, timingSafeEqual } from 'node:crypto'
import { Router, type NextFunction, type Request, type Response } from 'express'
import { db } from './db'
import { hojeNaClinica } from '../../shared/regras'
import { ANTECEDENCIA_RETORNO } from './tratamentos'
import type { SituacaoRetorno } from './generated/prisma/client'
import { EventoRetornoDto } from '../../shared/dtos'
import { lerCorpo } from './dto'

const resumo = (v: string) => createHash('sha256').update(v).digest()

function exigirToken(req: Request, res: Response, next: NextFunction) {
  const certo = process.env.INTEGRACAO_TOKEN
  if (!certo) return res.status(503).json({ erro: 'Integração desligada (INTEGRACAO_TOKEN).' })
  const recebido = (req.headers.authorization ?? '').replace(/^Bearer /, '')
  if (!timingSafeEqual(resumo(recebido), resumo(certo)))
    return res.status(401).json({ erro: 'Token inválido.' })
  next()
}

export const rotasIntegracao = Router()
rotasIntegracao.use(exigirToken)

const dia = (iso: string) => new Date(`${iso}T00:00:00Z`)
const isoDe = (d: Date) => d.toISOString().slice(0, 10)

/** Alertas abertos que ainda não foram avisados e cuja data de envio já chegou. */
rotasIntegracao.get('/retornos/pendentes', async (_req, res) => {
  const limite = new Date(dia(hojeNaClinica()).getTime() + ANTECEDENCIA_RETORNO * 86_400_000)
  const lista = await db.alertaRetorno.findMany({
    where: {
      excluidoEm: null,
      concluidoEm: null,
      situacao: 'AGUARDANDO_ENVIO',
      data: { lte: limite },
    },
    include: {
      paciente: { select: { nome: true, celular: true, email: true } },
      profissional: { select: { nome: true } },
    },
    orderBy: { data: 'asc' },
  })
  res.json(
    lista.map((r) => ({
      id: r.id,
      data: isoDe(r.data),
      motivo: r.motivo,
      paciente: r.paciente,
      profissional: r.profissional.nome,
    })),
  )
})

const FINAIS: SituacaoRetorno[] = ['CONFIRMADO', 'DESMARCADO']

rotasIntegracao.post('/retornos/:id/eventos', async (req, res) => {
  const b = lerCorpo(EventoRetornoDto, req.body, res, null)
  if (!b) return
  const r = await db.alertaRetorno.findFirst({
    where: { id: Number(req.params.id) || 0, excluidoEm: null },
    include: { paciente: { select: { celular: true, email: true } } },
  })
  if (!r) return res.status(404).json({ erro: 'Alerta não encontrado.' })

  const { canal } = b
  const situacao: SituacaoRetorno =
    b.tipo === 'ENVIADO' ? 'ENVIADO' : b.tipo === 'FALHOU' ? 'FALHOU' : (b.situacao ?? 'RESPONDEU')
  await db.$transaction([
    db.mensagem.create({
      data: {
        retornoId: r.id,
        canal,
        tipo: 'retorno',
        destino: (canal === 'EMAIL' ? r.paciente.email : r.paciente.celular) ?? '',
        status: b.tipo === 'ENVIADO' ? 'ENVIADA' : b.tipo === 'FALHOU' ? 'FALHOU' : 'RECEBIDA',
        texto: b.tipo === 'RESPOSTA' ? b.texto : null,
        erro: b.tipo === 'FALHOU' ? (b.erro ?? 'Falha sem detalhe.') : null,
      },
    }),
    db.alertaRetorno.update({
      where: { id: r.id },
      data: { situacao, concluidoEm: FINAIS.includes(situacao) ? new Date() : undefined },
    }),
  ])
  res.json({ ok: true, situacao })
})
