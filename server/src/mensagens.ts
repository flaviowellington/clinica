// Envio de mensagens ao paciente: e-mail (Nodemailer) e WhatsApp (pronto, liga pelo .env). SMS em espera.
//
// ── Como ligar o e-mail da clínica ──────────────────────────────────────────
// Preencha no server/.env (veja server/.env.example):
//   SMTP_HOST, SMTP_PORTA, SMTP_USUARIO (o e-mail da clínica), SMTP_SENHA, EMAIL_REMETENTE
// No Gmail, SMTP_SENHA é uma "senha de app" (Conta Google > Segurança > Verificação em duas
// etapas > Senhas de app), não a senha normal da conta.
// SMTP_HOST="json" é o modo de teste: monta a mensagem e não envia a lugar nenhum.
import nodemailer, { type Transporter } from 'nodemailer'
import { Router, type Response } from 'express'
import { db } from './db'
import { exigir, usuarioDe } from './auth'
import { lerConfig } from './configuracoes'
import { lerCorpo } from './dto'
import { MensagemLivreDto } from '../../shared/dtos'
import type { Canal } from './generated/prisma/client'

export const emailConfigurado = () =>
  process.env.SMTP_HOST === 'json' ||
  !!(process.env.SMTP_HOST && process.env.SMTP_USUARIO && process.env.SMTP_SENHA)

let transporte: { chave: string; t: Transporter } | null = null

/** Cria o transporte uma vez (e de novo se o .env mudar). */
function transportador() {
  const e = process.env
  const chave = [e.SMTP_HOST, e.SMTP_PORTA, e.SMTP_USUARIO, e.SMTP_SENHA].join('|')
  if (transporte?.chave !== chave) {
    const porta = Number(e.SMTP_PORTA) || 587
    transporte = {
      chave,
      t:
        e.SMTP_HOST === 'json'
          ? nodemailer.createTransport({ jsonTransport: true })
          : nodemailer.createTransport({
              host: e.SMTP_HOST,
              port: porta,
              secure: porta === 465, // 465 usa TLS direto; 587 começa simples e sobe para TLS
              auth: { user: e.SMTP_USUARIO, pass: e.SMTP_SENHA },
            }),
    }
  }
  return transporte.t
}

export async function enviarEmail(m: { para: string; assunto: string; texto: string }) {
  if (!emailConfigurado())
    throw new ErroEnvio('O e-mail da clínica ainda não foi configurado (server/.env).', 503)
  // Engano comum: pôr o e-mail no lugar do servidor.
  if (process.env.SMTP_HOST?.includes('@'))
    throw new ErroEnvio(
      'No server/.env, SMTP_HOST é o servidor (ex.: smtp.gmail.com), não o e-mail. O e-mail vai em SMTP_USUARIO.',
      503,
    )
  await transportador().sendMail({
    from: process.env.EMAIL_REMETENTE || process.env.SMTP_USUARIO,
    to: m.para,
    subject: m.assunto,
    text: m.texto,
  })
}

// ── WhatsApp (pronto; liga sozinho quando o .env tiver os dados) ─────────────
// Para ligar:
//   1. Contrate a API oficial do WhatsApp Business (Meta Cloud API) ou um parceiro autorizado.
//   2. Ponha no server/.env: WHATSAPP_TOKEN e WHATSAPP_NUMERO_ID.
// Desligado, o envio responde 501 com o link do WhatsApp Web já com o texto (whatsappWeb).
// ponytail: manda texto livre, que a Meta só aceita dentro de 24 h da última mensagem do
// paciente; fora disso exige um modelo ("template") aprovado. Trocar por template se recusar.
export const whatsappConfigurado = () =>
  !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_NUMERO_ID)

/** Celular do cadastro no formato do WhatsApp: só dígitos, com 55 quando falta o DDI. */
export const numeroWhatsApp = (celular: string) => {
  const n = celular.replace(/\D/g, '')
  return n.length <= 11 ? `55${n}` : n
}
export const linkWhatsAppWeb = (celular: string, texto: string) =>
  `https://wa.me/${numeroWhatsApp(celular)}?text=${encodeURIComponent(texto)}`

async function enviarWhatsApp(numero: string, texto: string) {
  const r = await fetch(
    `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_NUMERO_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: numeroWhatsApp(numero),
        type: 'text',
        text: { body: texto },
      }),
    },
  )
  if (!r.ok) throw new ErroEnvio(`WhatsApp recusou: ${await r.text()}`, 502)
}

// ── SMS (EM ESPERA) ─────────────────────────────────────────────────────────
// Para ligar:
//   1. Contrate um provedor de SMS (ex.: Zenvia, Twilio).
//   2. Ponha no server/.env: SMS_URL, SMS_TOKEN e SMS_REMETENTE (conforme o provedor).
//   3. Ajuste o corpo do pedido ao formato do provedor, descomente a função e o caso 'SMS'.
//   SMS tem limite de tamanho (a referência fala em 255 caracteres): use um texto curto.
//
// async function enviarSms(numero: string, texto: string) {
//   const r = await fetch(process.env.SMS_URL!, {
//     method: 'POST',
//     headers: { Authorization: `Bearer ${process.env.SMS_TOKEN}`, 'Content-Type': 'application/json' },
//     body: JSON.stringify({ from: process.env.SMS_REMETENTE, to: numero.replace(/\D/g, ''), text: texto.slice(0, 255) }),
//   })
//   if (!r.ok) throw new ErroEnvio(`SMS recusado: ${await r.text()}`, 502)
// }

/** Erro de envio com o código HTTP que a API deve devolver. */
export class ErroEnvio extends Error {
  constructor(
    mensagem: string,
    public status: number,
    /** Vai junto na resposta (ex.: whatsappWeb). */
    public extra: Record<string, string> = {},
  ) {
    super(mensagem)
  }
}

/** Envia pelo canal e registra a tentativa (deu certo ou não) na tabela Mensagem. */
export async function enviar(m: {
  canal: Canal
  tipo: string
  destino: string
  assunto: string
  texto: string
  agendamentoId?: number
  usuarioId?: number
}) {
  const registro = {
    canal: m.canal,
    tipo: m.tipo,
    destino: m.destino,
    assunto: m.assunto,
    // O texto livre não sai de um modelo: guarda o que foi escrito.
    texto: m.tipo === 'TEXTO' ? m.texto : undefined,
    agendamentoId: m.agendamentoId,
    enviadoPorId: m.usuarioId,
  }
  try {
    switch (m.canal) {
      case 'EMAIL':
        await enviarEmail({ para: m.destino, assunto: m.assunto, texto: m.texto })
        break
      case 'WHATSAPP':
        if (!m.destino) throw new ErroEnvio('O paciente não tem celular no cadastro.', 400)
        if (!whatsappConfigurado())
          throw new ErroEnvio(
            'A API do WhatsApp ainda não está ligada. Abra o WhatsApp Web com a mensagem pronta.',
            501,
            { whatsappWeb: linkWhatsAppWeb(m.destino, m.texto) },
          )
        await enviarWhatsApp(m.destino, m.texto)
        break
      // case 'SMS':
      //   await enviarSms(m.destino, m.texto)
      //   break
      default:
        // Em espera: não registra, porque nada foi tentado.
        throw new ErroEnvio('Envio por SMS ainda não está ligado. Use o e-mail.', 501)
    }
  } catch (e) {
    // Nada foi tentado: não registra.
    if (e instanceof ErroEnvio && (e.status === 501 || e.status === 400)) throw e
    const erro = e instanceof Error ? e.message : String(e)
    await db.mensagem.create({ data: { ...registro, status: 'FALHOU', erro: erro.slice(0, 500) } })
    throw e instanceof ErroEnvio ? e : new ErroEnvio(`Não foi possível enviar: ${erro}`, 502)
  }
  return db.mensagem.create({ data: { ...registro, status: 'ENVIADA' } })
}

/** Responde o erro do envio com o código certo (e o whatsappWeb, quando houver). */
export function responderErroEnvio(res: Response, e: unknown) {
  if (e instanceof ErroEnvio) return res.status(e.status).json({ erro: e.message, ...e.extra })
  res.status(502).json({ erro: (e as Error).message })
}

// ── Módulo Mensagens: /api/mensagens ────────────────────────────────────────
export const rotasMensagens = Router()

const acharPaciente = (id: unknown) =>
  db.pessoa.findFirst({
    where: { id: Number(id) || 0, tipo: 'PACIENTE', excluidoEm: null },
    select: { id: true, nome: true, email: true, celular: true },
  })

/** O que dá para mandar a este paciente: consultas a partir de hoje e pedidos (para assinar ou o PDF assinado). */
rotasMensagens.get('/paciente/:id', exigir('agenda.editar'), async (req, res) => {
  const paciente = await acharPaciente(req.params.id)
  if (!paciente) return res.status(404).json({ erro: 'Paciente não encontrado.' })
  const hoje = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)
  // ponytail: a Mensagem não guarda o paciente; acha pelo e-mail/celular do cadastro.
  const destinos = [paciente.email, paciente.celular].filter((d): d is string => !!d)
  const [consultas, autorizacoes, historico] = await Promise.all([
    db.agendamento.findMany({
      where: {
        pacienteId: paciente.id,
        tipo: 'CONSULTA',
        excluidoEm: null,
        desmarcadoEm: null,
        data: { gte: hoje },
      },
      select: {
        id: true,
        data: true,
        inicio: true,
        status: true,
        confirmadoEm: true,
        profissional: { select: { nome: true } },
      },
      orderBy: [{ data: 'asc' }, { inicio: 'asc' }],
      take: 20,
    }),
    db.autorizacao.findMany({
      where: { pacienteId: paciente.id, canceladoEm: null },
      select: { id: true, conteudo: true, criadoEm: true, assinadoEm: true, fichaId: true },
      orderBy: { id: 'desc' },
    }),
    db.mensagem.findMany({
      where: { destino: { in: destinos } },
      select: {
        id: true,
        canal: true,
        tipo: true,
        assunto: true,
        texto: true,
        status: true,
        criadoEm: true,
      },
      orderBy: { id: 'desc' },
      take: 6,
    }),
  ])
  res.json({
    paciente,
    historico,
    consultas: consultas.map((c) => ({ ...c, data: c.data.toISOString().slice(0, 10) })),
    autorizacoes: autorizacoes.map(({ conteudo, fichaId, ...a }) => {
      const c = conteudo as { especialidade?: string; itens?: { nome: string }[] }
      const nomes = [...new Set((c.itens ?? []).map((i) => i.nome))].join(', ')
      return {
        ...a,
        // Com ficha: pedido de um planejamento; sem: procedimentos avulsos.
        planejamento: !!fichaId,
        titulo: c.especialidade ? `Planejamento: ${c.especialidade}` : `Procedimentos: ${nomes}`,
      }
    }),
  })
})

/** Texto livre para o paciente, por e-mail ou WhatsApp. */
rotasMensagens.post('/paciente/:id', exigir('agenda.editar'), async (req, res) => {
  const p = await acharPaciente(req.params.id)
  if (!p) return res.status(404).json({ erro: 'Paciente não encontrado.' })
  const b = lerCorpo(MensagemLivreDto, req.body, res, null)
  if (!b) return
  if (b.canal === 'EMAIL' && !p.email)
    return res.status(400).json({ erro: 'O paciente não tem e-mail no cadastro.' })
  const clinica = await lerConfig('clinica')
  try {
    res.json(
      await enviar({
        canal: b.canal,
        tipo: 'TEXTO',
        destino: (b.canal === 'EMAIL' ? p.email : p.celular) ?? '',
        assunto: b.assunto || `Mensagem – ${clinica.nome}`,
        texto: b.texto,
        usuarioId: usuarioDe(res).id,
      }),
    )
  } catch (e) {
    responderErroEnvio(res, e)
  }
})
