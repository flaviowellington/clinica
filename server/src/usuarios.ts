// Usuários e Permissões (S-012): só o administrador gerencia; cada um troca a própria senha.
import { Router, type Request } from 'express'
import { db } from './db'
import { conferirSenha, exigir, gerarHash, usuarioDe } from './auth'
import { PERFIS, type Perfil } from '../../shared/permissoes'

export const SENHA_MINIMA = 8
const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const id = (req: Request) => Number(req.params.id) || 0

const campos = {
  id: true,
  login: true,
  nome: true,
  perfis: true,
  ativo: true,
  criadoEm: true,
  pessoa: { select: { id: true, nome: true } },
} as const

function lerPerfis(v: unknown): Perfil[] | null {
  if (!Array.isArray(v)) return null
  const perfis = [...new Set(v.filter((p): p is Perfil => typeof p === 'string' && p in PERFIS))]
  return perfis.length ? perfis : null
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
  const b = req.body ?? {}
  const erros: Record<string, string> = {}
  const nome = texto(b.nome)
  const login = texto(b.login)?.toLowerCase()
  const senha = typeof b.senha === 'string' ? b.senha : ''
  const perfis = lerPerfis(b.perfis)
  const pessoaId = Number(b.pessoaId) || null
  if (!nome) erros.nome = 'Informe o nome.'
  if (!login || !/^[a-z0-9._-]{3,40}$/.test(login))
    erros.login = 'Use de 3 a 40 letras, números, ponto, hífen ou sublinhado.'
  if (senha.length < SENHA_MINIMA)
    erros.senha = `A senha precisa de ${SENHA_MINIMA} caracteres ou mais.`
  if (!perfis) erros.perfis = 'Escolha pelo menos um perfil.'
  const prof = await erroProfissional(pessoaId)
  if (prof) erros.pessoaId = prof
  if (Object.keys(erros).length) return res.status(400).json({ erro: 'Confira os campos.', erros })
  if (await db.usuario.findUnique({ where: { login: login! } }))
    return res
      .status(409)
      .json({ erro: 'Já existe um usuário com este login.', erros: { login: 'Login em uso.' } })
  const u = await db.usuario.create({
    data: {
      nome: nome!,
      login: login!,
      senhaHash: await gerarHash(senha),
      perfis: perfis!,
      pessoaId,
    },
    select: campos,
  })
  res.status(201).json(u)
})

/** Edita nome, perfis, profissional e situação. Nunca deixa a clínica sem administrador ativo. */
rotasUsuarios.put('/:id', exigir('usuario.gerenciar'), async (req, res) => {
  const u = await db.usuario.findUnique({ where: { id: id(req) } })
  if (!u) return res.status(404).json({ erro: 'Usuário não encontrado.' })
  const b = req.body ?? {}
  const nome = texto(b.nome)
  const perfis = lerPerfis(b.perfis)
  const ativo = b.ativo !== false
  const pessoaId = b.pessoa?.id ?? (Number(b.pessoaId) || null)
  const erros: Record<string, string> = {}
  if (!nome) erros.nome = 'Informe o nome.'
  if (!perfis) erros.perfis = 'Escolha pelo menos um perfil.'
  const prof = await erroProfissional(pessoaId, u.id)
  if (prof) erros.pessoaId = prof
  if (Object.keys(erros).length) return res.status(400).json({ erro: 'Confira os campos.', erros })

  const eu = usuarioDe(res)
  const continuaAdmin = ativo && perfis!.includes('ADMINISTRADOR')
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
    data: { nome: nome!, perfis: perfis!, ativo, pessoaId },
    select: campos,
  })
  res.json(novo)
})

rotasUsuarios.post('/:id/senha', exigir('usuario.gerenciar'), async (req, res) => {
  const u = await db.usuario.findUnique({ where: { id: id(req) } })
  if (!u) return res.status(404).json({ erro: 'Usuário não encontrado.' })
  const senha = typeof req.body?.senha === 'string' ? req.body.senha : ''
  if (senha.length < SENHA_MINIMA)
    return res.status(400).json({ erro: `A senha precisa de ${SENHA_MINIMA} caracteres ou mais.` })
  await db.usuario.update({ where: { id: u.id }, data: { senhaHash: await gerarHash(senha) } })
  res.json({ mensagem: 'Senha alterada.' })
})

/** Qualquer usuário troca a própria senha, informando a atual. Montada em /api/eu. */
export const rotasEu = Router()

rotasEu.post('/senha', async (req, res) => {
  const eu = usuarioDe(res)
  const nova = typeof req.body?.nova === 'string' ? req.body.nova : ''
  if (!(await conferirSenha(eu.login, String(req.body?.atual ?? ''))))
    return res.status(400).json({ erro: 'A senha atual está incorreta.' })
  if (nova.length < SENHA_MINIMA)
    return res
      .status(400)
      .json({ erro: `A nova senha precisa de ${SENHA_MINIMA} caracteres ou mais.` })
  await db.usuario.update({ where: { id: eu.id }, data: { senhaHash: await gerarHash(nova) } })
  res.json({ mensagem: 'Senha alterada.' })
})
