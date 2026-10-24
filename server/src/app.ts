import express, { type NextFunction, type Request, type Response } from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { rateLimit } from 'express-rate-limit'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { abrirSessao, conferirSenha, COOKIE, exigirLogin, usuarioDe } from './auth'
import { rotasLixeira, rotasPacientes } from './pacientes'
import { rotasAgenda } from './agenda'
import { rotasContas, rotasFinanceiro, rotasProfissionais, rotasRelatorios } from './gestao'
import { rotasFinanceiroContas } from './financeiro'
import { rotasOrcamentos, rotasProcedimentos, rotasRetornos } from './tratamentos'

export function criarApp() {
  const app = express()
  app.disable('x-powered-by')
  app.use(helmet())
  app.use(cors({ origin: process.env.ORIGEM_WEB ?? false, credentials: true }))
  app.use(cookieParser())
  app.use(express.json({ limit: '200kb' }))
  app.use(express.urlencoded({ extended: false, limit: '200kb' }))
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 600 }))

  app.get('/api/saude', (_req, res) => res.json({ ok: true }))

  app.post(
    '/api/entrar',
    // ponytail: contagem por IP na memória; com mais de um servidor, guardar no banco
    rateLimit({ windowMs: 15 * 60_000, limit: 10, skipSuccessfulRequests: true }),
    async (req, res) => {
      const login = String(req.body?.login ?? '')
      const senha = String(req.body?.senha ?? '')
      const usuario = await conferirSenha(login, senha)
      if (!usuario) return res.status(401).json({ erro: 'Usuário ou senha incorretos.' })
      abrirSessao(res, usuario.id)
      res.json({ id: usuario.id, nome: usuario.nome, login: usuario.login, perfis: usuario.perfis })
    },
  )

  app.post('/api/sair', (_req, res) => {
    res.clearCookie(COOKIE)
    res.json({ ok: true })
  })

  app.get('/api/eu', exigirLogin, (_req, res) => {
    const { id, nome, login, perfis } = usuarioDe(res)
    res.json({ id, nome, login, perfis })
  })

  app.use('/api/pacientes', exigirLogin, rotasPacientes)
  app.use('/api/lixeira', exigirLogin, rotasLixeira)
  app.use('/api/agenda', exigirLogin, rotasAgenda)
  app.use('/api/profissionais', exigirLogin, rotasProfissionais)
  app.use('/api/financeiro', exigirLogin, rotasFinanceiro, rotasFinanceiroContas)
  app.use('/api/retornos', exigirLogin, rotasRetornos)
  app.use('/api/procedimentos', exigirLogin, rotasProcedimentos)
  app.use('/api/orcamentos', exigirLogin, rotasOrcamentos)
  app.use('/api/contas', exigirLogin, rotasContas)
  app.use('/api/relatorios', exigirLogin, rotasRelatorios)
  app.use('/api', (_req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }))

  // Em produção, o próprio servidor entrega o front já compilado (web/dist).
  const front = fileURLToPath(new URL('../../web/dist', import.meta.url))
  if (existsSync(front)) {
    app.use(express.static(front))
    app.get('/{*caminho}', (_req, res) => res.sendFile('index.html', { root: front }))
  }

  app.use((erro: Error & { type?: string }, _req: Request, res: Response, _next: NextFunction) => {
    if (erro.type === 'entity.parse.failed')
      return res.status(400).json({ erro: 'Dados inválidos.' })
    console.error(erro)
    res.status(500).json({ erro: 'Erro inesperado. Tente de novo.' })
  })

  return app
}
