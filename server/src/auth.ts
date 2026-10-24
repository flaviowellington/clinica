import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import type { NextFunction, Request, Response } from 'express'
import { db } from './db'
import { pode, type Acao } from '../../shared/permissoes'
import type { Usuario } from './generated/prisma/client'

const SEGREDO = process.env.JWT_SEGREDO ?? ''
if (SEGREDO.length < 32) throw new Error('Defina JWT_SEGREDO (32+ caracteres) em server/.env')

export const COOKIE = 'sessao'
const DURACAO_H = 10 // um dia de trabalho

// Hash usado quando o login não existe, para a resposta levar o mesmo tempo.
const HASH_FALSO = bcrypt.hashSync('senha-que-nao-existe', 10)

export const gerarHash = (senha: string) => bcrypt.hash(senha, 12)

export async function conferirSenha(login: string, senha: string) {
  const usuario = await db.usuario.findUnique({ where: { login } })
  const ok = await bcrypt.compare(senha, usuario?.senhaHash ?? HASH_FALSO)
  return ok && usuario?.ativo ? usuario : null
}

export function abrirSessao(res: Response, usuarioId: number) {
  const token = jwt.sign({ sub: String(usuarioId) }, SEGREDO, { expiresIn: `${DURACAO_H}h` })
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: DURACAO_H * 3600_000,
  })
}

export function usuarioDe(res: Response): Usuario {
  return res.locals.usuario
}

/** Exige login. Relê o usuário a cada pedido, para que inativar ou mudar perfil valha na hora. */
export async function exigirLogin(req: Request, res: Response, next: NextFunction) {
  try {
    const { sub } = jwt.verify(req.cookies?.[COOKIE] ?? '', SEGREDO) as { sub: string }
    const usuario = await db.usuario.findUnique({ where: { id: Number(sub) } })
    if (usuario?.ativo) {
      res.locals.usuario = usuario
      return next()
    }
  } catch {
    // token ausente, vencido ou adulterado
  }
  res.status(401).json({ erro: 'Faça login para continuar.' })
}

export const exigir = (acao: Acao) => (_req: Request, res: Response, next: NextFunction) => {
  if (pode(usuarioDe(res).perfis, acao)) return next()
  res.status(403).json({ erro: 'Você não tem permissão para esta ação.' })
}
