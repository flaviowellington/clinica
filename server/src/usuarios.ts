// Usuários e Permissões (S-012): só o administrador gerencia; cada um troca a própria senha.
import { Router, type Request } from 'express'
import { db } from './db'
import { conferirSenha, exigir, gerarHash, usuarioDe } from './auth'
import { MinhaSenhaDto, SenhaDto, UsuarioEdicaoDto, UsuarioNovoDto } from '../../shared/dtos'
import { lerCorpo } from './dto'

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
  const { nome, login, senha, perfis, pessoaId } = b
  const prof = await erroProfissional(pessoaId)
  if (prof) return res.status(400).json({ erro: 'Confira os campos.', erros: { pessoaId: prof } })
  if (await db.usuario.findUnique({ where: { login } }))
    return res
      .status(409)
      .json({ erro: 'Já existe um usuário com este login.', erros: { login: 'Login em uso.' } })
  const u = await db.usuario.create({
    data: {
      nome,
      login,
      senhaHash: await gerarHash(senha),
      perfis,
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
  const b = lerCorpo(UsuarioEdicaoDto, req.body, res)
  if (!b) return
  const { nome, perfis, ativo, pessoaId } = b
  const prof = await erroProfissional(pessoaId, u.id)
  if (prof) return res.status(400).json({ erro: 'Confira os campos.', erros: { pessoaId: prof } })

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
    data: { nome, perfis, ativo, pessoaId },
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
