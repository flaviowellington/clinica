// Atualização em tempo real: cada navegador logado mantém uma conexão aberta (Server-Sent
// Events) e recebe um aviso quando alguém muda a agenda. O aviso só diz O QUE mudou
// ("agenda", "retornos"...), nunca dados do paciente; o navegador busca de novo pela API.
// Exceção: o "chamado" (o profissional chamou o paciente) leva os nomes, e só para a recepção.
import type { NextFunction, Request, Response } from 'express'
import type { Perfil } from '../../shared/permissoes'
import { usuarioDe } from './auth'

// ponytail: conexões na memória de um processo; com mais de uma instância da API,
// trocar por Postgres LISTEN/NOTIFY. Os perfis são lidos ao conectar e trocados por
// atualizarConectado quando o administrador edita o usuário.
const conectados = new Map<Response, { usuarioId: number; perfis: Perfil[] }>()

/** GET /api/eventos: mantém a conexão aberta e manda um "ping" para ela não cair. */
export function abrirEventos(req: Request, res: Response) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // proxy (nginx) não segura os avisos
  })
  res.write('retry: 3000\n\n')
  const u = usuarioDe(res)
  conectados.set(res, { usuarioId: u.id, perfis: u.perfis as Perfil[] })
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000)
  req.on('close', () => {
    clearInterval(ping)
    conectados.delete(res)
  })
}

export function avisarTodos(assunto: string) {
  for (const res of conectados.keys()) res.write(`data: ${JSON.stringify({ assunto })}\n\n`)
}

/** Avisa só quem tem o perfil (ex.: toda a recepção). */
export function avisarPerfil(perfil: Perfil, aviso: { assunto: string } & Record<string, unknown>) {
  for (const [res, c] of conectados)
    if (c.perfis.includes(perfil)) res.write(`data: ${JSON.stringify(aviso)}\n\n`)
}

/** Usuário editado: troca os perfis das conexões dele; inativado, fecha (o navegador cai no 401). */
export function atualizarConectado(usuarioId: number, perfis: Perfil[], ativo: boolean) {
  for (const [res, c] of conectados) {
    if (c.usuarioId !== usuarioId) continue
    if (ativo) c.perfis = perfis
    else {
      conectados.delete(res)
      res.end()
    }
  }
}

/** Depois de qualquer alteração que deu certo, avisa todos com o assunto informado. */
export const avisarAoMudar =
  (assunto: string) => (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') res.on('finish', () => res.statusCode < 400 && avisarTodos(assunto))
    next()
  }
