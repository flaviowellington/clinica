// Cria (ou atualiza) só o usuário "admin" com a senha SEED_SENHA do server/.env. Nenhum outro dado.
import { db } from './db'
import { gerarHash } from './auth'

const senha = process.env.SEED_SENHA
if (!senha) throw new Error('Defina SEED_SENHA em server/.env')
const senhaHash = await gerarHash(senha)

await db.usuario.upsert({
  where: { login: 'admin' },
  update: { senhaHash, ativo: true },
  create: { login: 'admin', nome: 'Administrador', perfis: ['ADMINISTRADOR'], senhaHash },
})
await db.$disconnect()
console.log('Usuário "admin" pronto (senha = SEED_SENHA do server/.env).')
