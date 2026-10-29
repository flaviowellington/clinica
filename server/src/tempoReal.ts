// Atualização em tempo real: cada navegador logado mantém uma conexão aberta (Server-Sent
// Events) e recebe um aviso quando alguém muda a agenda. O aviso só diz O QUE mudou
// ("agenda", "retornos"...), nunca dados do paciente; o navegador busca de novo pela API.
import type { NextFunction, Request, Response } from 'express'

// ponytail: conexões na memória de um processo; com mais de uma instância da API,
// trocar por Postgres LISTEN/NOTIFY.
const conectados = new Set<Response>()

/** GET /api/eventos: mantém a conexão aberta e manda um "ping" para ela não cair. */
export function abrirEventos(req: Request, res: Response) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // proxy (nginx) não segura os avisos
  })
  res.write('retry: 3000\n\n')
  conectados.add(res)
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000)
  req.on('close', () => {
    clearInterval(ping)
    conectados.delete(res)
  })
}

export function avisarTodos(assunto: string) {
  for (const res of conectados) res.write(`data: ${JSON.stringify({ assunto })}\n\n`)
}

/** Depois de qualquer alteração que deu certo, avisa todos com o assunto informado. */
export const avisarAoMudar =
  (assunto: string) => (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET')
      res.on('finish', () => res.statusCode < 400 && avisarTodos(assunto))
    next()
  }
