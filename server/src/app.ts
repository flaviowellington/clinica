import express, { type NextFunction, type Request, type Response } from 'express'
import { rotasAutorizacaoPublica, rotasAutorizacoes } from './autorizacoes'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { rateLimit } from 'express-rate-limit'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  abrirSessao,
  conferirSenha,
  COOKIE,
  derrubarSessoes,
  exigirLogin,
  usuarioDe,
  usuarioDoToken,
} from './auth'
import { db } from './db'
import { rotasPacientes } from './pacientes'
import { rotasLixeira } from './lixeira'
import { rotasAgenda } from './agenda'
import { rotasFinanceiro, rotasProfissionais, rotasRelatorios } from './gestao'
import { rotasFinanceiroContas } from './financeiro'
import { rotasOrcamentos, rotasProcedimentos, rotasRetornos } from './tratamentos'
import { rotasIntegracao } from './integracao'
import { abrirEventos, atualizarConectado, avisarAoMudar } from './tempoReal'
import { rotasFichaPaciente, rotasProntuario } from './prontuario'
import { dadosDoEu, rotasEu, rotasRecuperarSenha, rotasUsuarios } from './usuarios'
import { rotasConfiguracoes, rotasTabelaProcedimentos } from './configuracoes'
import { rotasProtetico } from './protetico'
import { rotasConfirmacoes, rotasPublicas } from './confirmacoes'
import { rotasPainel } from './painel'
import { rotasMensagens } from './mensagens'
import { rotasImportacao } from './importacao'
import { registrarAtividade, rotasLogs } from './logs'
import { lerCorpo } from './dto'
import { EntrarDto } from '../../shared/dtos'

export function criarApp() {
  const app = express()
  app.disable('x-powered-by')
  // Atrás de nginx/Cloudflare: quantos proxies confiar (ex.: 1) para ler o IP real do
  // X-Forwarded-For. Sem isso, todos chegam com o IP do proxy e um atacante bloqueia o login
  // de todos. Vazio (sem proxy): o cabeçalho é ignorado, para ninguém fingir outro IP.
  const proxy = process.env.PROXY_CONFIAVEL
  if (proxy) app.set('trust proxy', /^\d+$/.test(proxy) ? Number(proxy) : proxy)
  // CSP do helmet, sem o curinga "https:" (o front não carrega nada de fora) e com blob: nas
  // imagens (prévia do recorte de foto). Estilo inline fica: o bundle injeta <style>.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'font-src': ["'self'", 'data:'],
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:', 'blob:'],
        },
      },
    }),
  )
  // Recursos do navegador: só a câmera (foto de perfil), e só nesta origem.
  app.use((_req, res, next) => {
    res.set(
      'Permissions-Policy',
      'camera=(self), microphone=(), geolocation=(), payment=(), usb=()',
    )
    next()
  })
  app.use(cors({ origin: process.env.ORIGEM_WEB ?? false, credentials: true }))
  app.use(cookieParser())
  // inflate: false recusa corpo compactado (415) sem descompactar: navegador nunca manda, e
  // descompactar abria o CVE-2026-111497 (node2shell, Brotli do Node) e "bombas" de gzip.
  app.use(express.json({ limit: '200kb', inflate: false }))
  app.use(express.urlencoded({ extended: false, limit: '200kb', inflate: false }))
  // LIMITE_API_POR_MINUTO: só o e2e e o teste de carga sobem; em produção fica o padrão.
  app.use(
    '/api',
    rateLimit({ windowMs: 60_000, limit: Number(process.env.LIMITE_API_POR_MINUTO) || 600 }),
  )

  app.use('/api', registrarAtividade) // toda alteração vai para Configurações → Logs

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
      res.locals.usuario = usuario // o log do login leva quem entrou
      abrirSessao(res, usuario)
      res.json(await dadosDoEu(usuario))
    },
  )

  // Pedir código sempre responde 200 (não revela quem tem conta), então conta todo pedido:
  // senão dá para lotar o e-mail de alguém e zerar as tentativas com códigos novos.
  app.use('/api/senha/codigo', rateLimit({ windowMs: 15 * 60_000, limit: 5 }))
  // Esqueci a senha: poucas tentativas por IP, para não adivinharem o código nem lotarem o e-mail.
  app.use(
    '/api/senha',
    rateLimit({ windowMs: 15 * 60_000, limit: 10, skipSuccessfulRequests: true }),
    rotasRecuperarSenha,
  )

  // Sair derruba o token (em todos os aparelhos desse usuário): cookie copiado não serve mais.
  app.post('/api/sair', async (req, res) => {
    const u = await usuarioDoToken(req)
    if (u) {
      await db.usuario.update({ where: { id: u.id }, data: derrubarSessoes })
      atualizarConectado(u.id, [], false)
    }
    res.clearCookie(COOKIE)
    res.json({ ok: true })
  })

  // Sem login: a página em que o paciente confirma a consulta pelo link do e-mail.
  // Paciente assinou o plano pelo celular: o dentista vê na hora.
  app.use('/api/publico/autorizacao', avisarAoMudar('assinatura'), rotasAutorizacaoPublica)
  app.use('/api/publico', avisarAoMudar('agenda'), rotasPublicas)
  app.use('/api/integracao', avisarAoMudar('retornos'), rotasIntegracao) // n8n: entra por token, não por login

  app.get('/api/eu', exigirLogin, async (_req, res) => {
    res.json(await dadosDoEu(usuarioDe(res)))
  })

  // Tempo real: o navegador fica ouvindo; alterações com avisarAoMudar avisam todos (tempoReal.ts).
  app.get('/api/eventos', exigirLogin, abrirEventos)
  const pacientes = avisarAoMudar('pacientes')
  app.use('/api/pacientes', exigirLogin, pacientes, rotasPacientes, rotasFichaPaciente)
  app.use('/api/prontuario', exigirLogin, pacientes, rotasProntuario)
  app.use('/api/lixeira', exigirLogin, rotasLixeira)
  app.use('/api/agenda', exigirLogin, avisarAoMudar('agenda'), rotasAgenda)
  app.use('/api/profissionais', exigirLogin, avisarAoMudar('agenda'), rotasProfissionais)
  const financeiro = avisarAoMudar('financeiro')
  app.use('/api/financeiro', exigirLogin, financeiro, rotasFinanceiro, rotasFinanceiroContas)
  app.use('/api/retornos', exigirLogin, avisarAoMudar('retornos'), rotasRetornos)
  app.use(
    '/api/procedimentos',
    exigirLogin,
    avisarAoMudar('procedimentos'),
    rotasProcedimentos,
    rotasTabelaProcedimentos,
  )
  app.use('/api/orcamentos', exigirLogin, financeiro, rotasOrcamentos)
  app.use('/api/autorizacoes', exigirLogin, avisarAoMudar('autorizacoes'), rotasAutorizacoes)
  app.use('/api/relatorios', exigirLogin, rotasRelatorios)
  app.use('/api/eu', exigirLogin, rotasEu)
  app.use('/api/usuarios', exigirLogin, rotasUsuarios)
  app.use('/api/configuracoes', exigirLogin, avisarAoMudar('config'), rotasConfiguracoes)
  app.use('/api/protetico', exigirLogin, avisarAoMudar('protetico'), rotasProtetico)
  app.use('/api/confirmacoes', exigirLogin, avisarAoMudar('agenda'), rotasConfirmacoes)
  app.use('/api/mensagens', exigirLogin, rotasMensagens)
  app.use('/api/painel', exigirLogin, rotasPainel)
  app.use('/api/importacao', exigirLogin, avisarAoMudar('pacientes'), rotasImportacao)
  app.use('/api/logs', exigirLogin, rotasLogs)
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
    if (erro.type === 'entity.too.large')
      return res.status(413).json({ erro: 'O envio passou do tamanho máximo.' })
    if (erro.type === 'encoding.unsupported')
      return res.status(415).json({ erro: 'Envio compactado não é aceito.' })
    console.error(erro)
    res.status(500).json({ erro: 'Erro inesperado. Tente de novo.' })
  })

  return app
}
