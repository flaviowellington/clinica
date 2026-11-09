// Usuários e Permissões (S-012): só o administrador gerencia; cada um troca a própria senha.
import { randomInt } from 'node:crypto'
import bcrypt from 'bcrypt'
import { Router, type Request, type Response } from 'express'
import { db } from './db'
import { abrirSessao, conferirSenha, exigir, gerarHash, usuarioDe } from './auth'
import { emailConfigurado, enviarEmail } from './mensagens'
import {
  MinhaSenhaDto,
  PedirCodigoDto,
  PreferenciasDto,
  RedefinirSenhaDto,
  SenhaDto,
  UsuarioEdicaoDto,
  UsuarioNovoDto,
  type Preferencias,
} from '../../shared/dtos'
import { lerCorpo } from './dto'
import { normalizar } from '../../shared/regras'

const id = (req: Request) => Number(req.params.id) || 0

const campos = {
  id: true,
  login: true,
  nome: true,
  email: true,
  perfis: true,
  ativo: true,
  criadoEm: true,
  pessoa: { select: { id: true, nome: true } },
} as const

/** E-mail já usado por outro usuário: responde 409 e devolve true. */
async function emailEmUso(email: string, res: Response, usuarioId?: number) {
  const outro = await db.usuario.findUnique({ where: { email } })
  if (!outro || outro.id === usuarioId) return false
  res
    .status(409)
    .json({ erro: 'Já existe um usuário com este e-mail.', erros: { email: 'E-mail em uso.' } })
  return true
}

/** Profissional (pessoa) que pode ser ligado ao usuário: existe e não está ligado a outro. */
async function erroProfissional(pessoaId: number | null, usuarioId?: number) {
  if (!pessoaId) return null
  const p = await db.pessoa.findFirst({
    where: { id: pessoaId, tipo: 'PROFISSIONAL', excluidoEm: null },
    include: { usuario: true },
  })
  if (!p) return 'Profissional não encontrado.'
  if (p.usuario && p.usuario.id !== usuarioId) return 'Este profissional já tem um usuário.'
  return null
}

export const rotasUsuarios = Router()

rotasUsuarios.get('/', exigir('usuario.gerenciar'), async (_req, res) => {
  res.json(await db.usuario.findMany({ select: campos, orderBy: { nome: 'asc' } }))
})

rotasUsuarios.post('/', exigir('usuario.gerenciar'), async (req, res) => {
  const b = lerCorpo(UsuarioNovoDto, req.body, res)
  if (!b) return
  const { nome, login, senha, email, perfis, pessoaId, profissional } = b
  const novoProfissional = !pessoaId && perfis.includes('PROFISSIONAL') ? profissional : undefined
  const prof =
    perfis.includes('PROFISSIONAL') && !pessoaId && !profissional
      ? 'Escolha o profissional ou preencha os dados dele.'
      : await erroProfissional(pessoaId)
  if (prof) return res.status(400).json({ erro: 'Confira os campos.', erros: { pessoaId: prof } })
  if (await db.usuario.findUnique({ where: { login } }))
    return res
      .status(409)
      .json({ erro: 'Já existe um usuário com este login.', erros: { login: 'Login em uso.' } })
  if (await emailEmUso(email, res)) return
  const u = await db.usuario.create({
    data: {
      nome,
      login,
      email,
      senhaHash: await gerarHash(senha),
      perfis,
      // Profissional novo nasce junto com o usuário, na mesma gravação.
      ...(novoProfissional
        ? {
            pessoa: {
              create: {
                ...novoProfissional,
                nome,
                nomeBusca: normalizar(nome),
                tipo: 'PROFISSIONAL',
                criadoPorId: usuarioDe(res).id,
                alteradoPorId: usuarioDe(res).id,
              },
            },
          }
        : { pessoaId }),
    },
    select: campos,
  })
  res.status(201).json(u)
})

/** Edita nome, perfis, profissional e situação. Nunca deixa a clínica sem administrador ativo. */
rotasUsuarios.put('/:id', exigir('usuario.gerenciar'), async (req, res) => {
  const u = await db.usuario.findUnique({ where: { id: id(req) } })
  if (!u) return res.status(404).json({ erro: 'Usuário não encontrado.' })
  const b = lerCorpo(UsuarioEdicaoDto, req.body, res)
  if (!b) return
  const { nome, email, perfis, ativo, pessoaId } = b
  const prof = await erroProfissional(pessoaId, u.id)
  if (prof) return res.status(400).json({ erro: 'Confira os campos.', erros: { pessoaId: prof } })
  if (await emailEmUso(email, res, u.id)) return

  const eu = usuarioDe(res)
  const continuaAdmin = ativo && perfis.includes('ADMINISTRADOR')
  if (u.id === eu.id && !ativo)
    return res.status(409).json({ erro: 'Você não pode inativar o próprio usuário.' })
  if (u.perfis.includes('ADMINISTRADOR') && u.ativo && !continuaAdmin) {
    const outros = await db.usuario.count({
      where: { id: { not: u.id }, ativo: true, perfis: { has: 'ADMINISTRADOR' } },
    })
    if (!outros)
      return res
        .status(409)
        .json({ erro: 'A clínica precisa de pelo menos um administrador ativo.' })
  }
  const novo = await db.usuario.update({
    where: { id: u.id },
    data: { nome, email, perfis, ativo, pessoaId },
    select: campos,
  })
  res.json(novo)
})

rotasUsuarios.post('/:id/senha', exigir('usuario.gerenciar'), async (req, res) => {
  const u = await db.usuario.findUnique({ where: { id: id(req) } })
  if (!u) return res.status(404).json({ erro: 'Usuário não encontrado.' })
  const b = lerCorpo(SenhaDto, req.body, res, null)
  if (!b) return
  await db.usuario.update({ where: { id: u.id }, data: { senhaHash: await gerarHash(b.senha) } })
  res.json({ mensagem: 'Senha alterada.' })
})

/** Qualquer usuário troca a própria senha, informando a atual. Montada em /api/eu. */
export const rotasEu = Router()

rotasEu.post('/senha', async (req, res) => {
  const eu = usuarioDe(res)
  const b = lerCorpo(MinhaSenhaDto, req.body, res, null)
  if (!b) return
  if (!(await conferirSenha(eu.login, b.atual)))
    return res.status(400).json({ erro: 'A senha atual está incorreta.' })
  await db.usuario.update({ where: { id: eu.id }, data: { senhaHash: await gerarHash(b.nova) } })
  res.json({ mensagem: 'Senha alterada.' })
})

/** Cada conta guarda seus filtros de profissionais (agenda e confirmações). Só troca o que vier. */
rotasEu.put('/preferencias', async (req, res) => {
  const eu = usuarioDe(res)
  const b = lerCorpo(PreferenciasDto, req.body, res, null)
  if (!b) return
  const preferencias = { ...(eu.preferencias as Preferencias | null), ...b }
  await db.usuario.update({ where: { id: eu.id }, data: { preferencias } })
  res.json(preferencias)
})

// ── Esqueci a senha (sem login): código de 6 dígitos por e-mail ─────────────
const VALIDADE_MIN = 15
const MAX_TENTATIVAS = 5

export const rotasRecuperarSenha = Router()

/** Sempre responde igual, exista ou não o e-mail, para não revelar quem tem conta. */
rotasRecuperarSenha.post('/codigo', async (req, res) => {
  const b = lerCorpo(PedirCodigoDto, req.body, res, null)
  if (!b) return
  if (!emailConfigurado())
    return res.status(503).json({ erro: 'O e-mail da clínica ainda não foi configurado.' })
  const u = await db.usuario.findUnique({ where: { email: b.email } })
  // Sem await: a resposta leva o mesmo tempo com ou sem conta.
  if (u?.ativo)
    enviarCodigo(u.id, u.nome, b.email).catch((e) => console.error('Código de senha:', e))
  res.json({ mensagem: 'Se o e-mail estiver cadastrado, enviamos um código para ele.' })
})

async function enviarCodigo(id: number, nome: string, email: string) {
  const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0')
  await db.usuario.update({
    where: { id },
    data: {
      codigoHash: await gerarHash(codigo),
      codigoExpira: new Date(Date.now() + VALIDADE_MIN * 60_000),
      codigoTentativas: 0,
    },
  })
  await enviarEmail({
    para: email,
    assunto: 'Código para trocar sua senha',
    texto:
      `Olá, ${nome}.

Seu código para trocar a senha é: ${codigo}
` +
      `Ele vale por ${VALIDADE_MIN} minutos.

` +
      'Se não foi você que pediu, ignore este e-mail: sua senha continua a mesma.',
  })
}

/** Código certo e no prazo: troca a senha, apaga o código e já entra. */
rotasRecuperarSenha.post('/redefinir', async (req, res) => {
  const b = lerCorpo(RedefinirSenhaDto, req.body, res, null)
  if (!b) return
  const u = await db.usuario.findUnique({ where: { email: b.email } })
  const valido =
    u?.ativo &&
    u.codigoHash &&
    u.codigoExpira &&
    u.codigoExpira > new Date() &&
    u.codigoTentativas < MAX_TENTATIVAS
  if (!valido || !(await bcrypt.compare(b.codigo, u.codigoHash!))) {
    if (valido)
      await db.usuario.update({ where: { id: u.id }, data: { codigoTentativas: { increment: 1 } } })
    return res.status(400).json({ erro: 'Código incorreto ou vencido. Confira ou peça um novo.' })
  }
  await db.usuario.update({
    where: { id: u.id },
    data: {
      senhaHash: await gerarHash(b.senha),
      codigoHash: null,
      codigoExpira: null,
      codigoTentativas: 0,
    },
  })
  abrirSessao(res, u.id)
  res.json({ id: u.id, nome: u.nome, login: u.login, perfis: u.perfis })
})
