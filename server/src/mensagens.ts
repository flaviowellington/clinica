// Envio de mensagens ao paciente. Hoje: e-mail (Nodemailer). WhatsApp e SMS: prontos, em espera.
//
// ── Como ligar o e-mail da clínica ──────────────────────────────────────────
// Preencha no server/.env (veja server/.env.example):
//   SMTP_HOST, SMTP_PORTA, SMTP_USUARIO (o e-mail da clínica), SMTP_SENHA, EMAIL_REMETENTE
// No Gmail, SMTP_SENHA é uma "senha de app" (Conta Google > Segurança > Verificação em duas
// etapas > Senhas de app), não a senha normal da conta.
// SMTP_HOST="json" é o modo de teste: monta a mensagem e não envia a lugar nenhum.
import nodemailer, { type Transporter } from 'nodemailer'
import { db } from './db'
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
  await transportador().sendMail({
    from: process.env.EMAIL_REMETENTE || process.env.SMTP_USUARIO,
    to: m.para,
    subject: m.assunto,
    text: m.texto,
  })
}

// ── WhatsApp (EM ESPERA) ────────────────────────────────────────────────────
// Para ligar:
//   1. Contrate a API oficial do WhatsApp Business (Meta Cloud API) ou um parceiro autorizado.
//   2. Aprove um modelo de mensagem ("template") de confirmação de consulta na Meta.
//   3. Ponha no server/.env: WHATSAPP_TOKEN e WHATSAPP_NUMERO_ID.
//   4. Descomente a função abaixo e o caso 'WHATSAPP' em enviar().
//
// async function enviarWhatsApp(numero: string, texto: string) {
//   const r = await fetch(
//     `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_NUMERO_ID}/messages`,
//     {
//       method: 'POST',
//       headers: {
//         Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
//         'Content-Type': 'application/json',
//       },
//       body: JSON.stringify({
//         messaging_product: 'whatsapp',
//         to: numero.replace(/\D/g, ''), // com DDI: 5511999990000
//         type: 'text',
//         text: { body: texto },
//       }),
//     },
//   )
//   if (!r.ok) throw new ErroEnvio(`WhatsApp recusou: ${await r.text()}`, 502)
// }

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
    agendamentoId: m.agendamentoId,
    enviadoPorId: m.usuarioId,
  }
  try {
    switch (m.canal) {
      case 'EMAIL':
        await enviarEmail({ para: m.destino, assunto: m.assunto, texto: m.texto })
        break
      // case 'WHATSAPP':
      //   await enviarWhatsApp(m.destino, m.texto)
      //   break
      // case 'SMS':
      //   await enviarSms(m.destino, m.texto)
      //   break
      default:
        // Em espera: não registra, porque nada foi tentado.
        throw new ErroEnvio('Envio por WhatsApp e SMS ainda não está ligado. Use o e-mail.', 501)
    }
  } catch (e) {
    if (e instanceof ErroEnvio && e.status === 501) throw e
    const erro = e instanceof Error ? e.message : String(e)
    await db.mensagem.create({ data: { ...registro, status: 'FALHOU', erro: erro.slice(0, 500) } })
    throw e instanceof ErroEnvio ? e : new ErroEnvio(`Não foi possível enviar: ${erro}`, 502)
  }
  return db.mensagem.create({ data: { ...registro, status: 'ENVIADA' } })
}
