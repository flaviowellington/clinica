// Cria (ou atualiza) um login por perfil, cada um com a sua senha do server/.env. Nenhum outro dado.
import { db } from './db'
import { gerarHash } from './auth'
import { normalizar } from '../../shared/regras'
import type { Perfil } from './generated/prisma/client'

const logins: { login: string; nome: string; perfil: Perfil; env: string }[] = [
  { login: 'admin', nome: 'Administrador', perfil: 'ADMINISTRADOR', env: 'SEED_SENHA_ADMIN' },
  { login: 'recepcao', nome: 'Recepção', perfil: 'RECEPCAO', env: 'SEED_SENHA_RECEPCAO' },
  { login: 'financeiro', nome: 'Financeiro', perfil: 'FINANCEIRO', env: 'SEED_SENHA_FINANCEIRO' },
  { login: 'profissional', nome: 'Profissional', perfil: 'PROFISSIONAL', env: 'SEED_SENHA_PROFISSIONAL' },
]

const faltando = logins.filter((l) => !process.env[l.env]).map((l) => l.env)
if (faltando.length) throw new Error(`Defina em server/.env: ${faltando.join(', ')}`)

for (const l of logins) {
  // O perfil Profissional precisa de um cadastro de profissional para ter agenda.
  let pessoaId: number | undefined
  if (l.perfil === 'PROFISSIONAL') {
    const existente = await db.pessoa.findFirst({ where: { tipo: 'PROFISSIONAL', nome: l.nome } })
    pessoaId = (
      existente ??
      (await db.pessoa.create({
        data: { tipo: 'PROFISSIONAL', nome: l.nome, nomeBusca: normalizar(l.nome) },
      }))
    ).id
  }
  const senhaHash = await gerarHash(process.env[l.env]!)
  await db.usuario.upsert({
    where: { login: l.login },
    update: { senhaHash, perfis: [l.perfil], pessoaId, ativo: true },
    create: { login: l.login, nome: l.nome, perfis: [l.perfil], pessoaId, senhaHash },
  })
}
await db.$disconnect()
console.table(logins.map((l) => ({ login: l.login, perfil: l.perfil, senha: `${l.env} do server/.env` })))
