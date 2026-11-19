import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import type { NextFunction, Request, Response } from 'express'
import { db } from './db'
import { definirMatriz, pode, type Acao, type Matriz } from '../../shared/permissoes'
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

/** O token leva a versão da sessão: quando ela sobe (sair, trocar senha), os antigos caem. */
export function abrirSessao(res: Response, u: Pick<Usuario, 'id' | 'sessaoVersao'>) {
  const token = jwt.sign({ sub: String(u.id), v: u.sessaoVersao }, SEGREDO, {
    expiresIn: `${DURACAO_H}h`,
  })
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
  const usuario = await usuarioDoToken(req)
  if (!usuario) return res.status(401).json({ erro: 'Faça login para continuar.' })
  res.locals.usuario = usuario
  await carregarPermissoes()
  next()
}

/** Usuário ativo dono do cookie, ou null (token ausente, vencido, adulterado ou de sessão derrubada). */
export async function usuarioDoToken(req: Request) {
  try {
    const { sub, v = 0 } = jwt.verify(req.cookies?.[COOKIE] ?? '', SEGREDO) as {
      sub: string
      v?: number
    }
    const usuario = await db.usuario.findUnique({ where: { id: Number(sub) } })
    return usuario?.ativo && usuario.sessaoVersao === v ? usuario : null
  } catch {
    return null
  }
}

/** Para pôr no `data` de um update: derruba todos os logins abertos do usuário. */
export const derrubarSessoes = { sessaoVersao: { increment: 1 } } as const

/** Relida a cada pedido: mudar a tela de permissões vale na hora, em qualquer servidor. */
export async function carregarPermissoes() {
  const c = await db.configuracao.findUnique({ where: { chave: 'permissoes' } })
  definirMatriz((c?.valor ?? {}) as Partial<Matriz>)
}

export const exigir = (acao: Acao) => (_req: Request, res: Response, next: NextFunction) => {
  if (pode(usuarioDe(res).perfis, acao)) return next()
  res.status(403).json({ erro: 'Você não tem permissão para esta ação.' })
}
