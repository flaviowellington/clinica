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
import { rotasFinanceiro, rotasProfissionais, rotasRelatorios } from './gestao'
import { rotasFinanceiroContas } from './financeiro'
import { rotasOrcamentos, rotasProcedimentos, rotasRetornos } from './tratamentos'
import { rotasIntegracao } from './integracao'
import { abrirEventos, avisarAoMudar } from './tempoReal'
import { rotasFichaPaciente, rotasProntuario } from './prontuario'
import { rotasEu, rotasUsuarios } from './usuarios'
import { rotasConfiguracoes, rotasTabelaProcedimentos } from './configuracoes'
import { rotasProtetico } from './protetico'
import { rotasConfirmacoes, rotasPublicas } from './confirmacoes'
import { rotasPainel } from './painel'
import { rotasImportacao } from './importacao'
import { lerCorpo } from './dto'
import { EntrarDto } from '../../shared/dtos'

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
      const b = lerCorpo(EntrarDto, req.body, res)
      if (!b) return
      const usuario = await conferirSenha(b.login, b.senha)
      if (!usuario) return res.status(401).json({ erro: 'Usuário ou senha incorretos.' })
      abrirSessao(res, usuario.id)
      res.json({ id: usuario.id, nome: usuario.nome, login: usuario.login, perfis: usuario.perfis })
    },
  )

  app.post('/api/sair', (_req, res) => {
    res.clearCookie(COOKIE)
    res.json({ ok: true })
  })

  // Sem login: a página em que o paciente confirma a consulta pelo link do e-mail.
  app.use('/api/publico', avisarAoMudar('agenda'), rotasPublicas)
  app.use('/api/integracao', avisarAoMudar('retornos'), rotasIntegracao) // n8n: entra por token, não por login

  app.get('/api/eu', exigirLogin, (_req, res) => {
    const { id, nome, login, perfis } = usuarioDe(res)
    res.json({ id, nome, login, perfis })
  })

  app.use('/api/pacientes', exigirLogin, rotasPacientes, rotasFichaPaciente)
  app.use('/api/prontuario', exigirLogin, rotasProntuario)
  app.use('/api/lixeira', exigirLogin, rotasLixeira)
  // Tempo real: o navegador fica ouvindo; alterações abaixo avisam todos (tempoReal.ts).
  app.get('/api/eventos', exigirLogin, abrirEventos)
  app.use('/api/agenda', exigirLogin, avisarAoMudar('agenda'), rotasAgenda)
  app.use('/api/profissionais', exigirLogin, avisarAoMudar('agenda'), rotasProfissionais)
  app.use('/api/financeiro', exigirLogin, rotasFinanceiro, rotasFinanceiroContas)
  app.use('/api/retornos', exigirLogin, avisarAoMudar('retornos'), rotasRetornos)
  app.use('/api/procedimentos', exigirLogin, rotasProcedimentos, rotasTabelaProcedimentos)
  app.use('/api/orcamentos', exigirLogin, rotasOrcamentos)
  app.use('/api/relatorios', exigirLogin, rotasRelatorios)
  app.use('/api/eu', exigirLogin, rotasEu)
  app.use('/api/usuarios', exigirLogin, rotasUsuarios)
  app.use('/api/configuracoes', exigirLogin, rotasConfiguracoes)
  app.use('/api/protetico', exigirLogin, rotasProtetico)
  app.use('/api/confirmacoes', exigirLogin, avisarAoMudar('agenda'), rotasConfirmacoes)
  app.use('/api/painel', exigirLogin, rotasPainel)
  app.use('/api/importacao', exigirLogin, rotasImportacao)
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
