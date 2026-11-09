// Cria (ou atualiza) só o usuário "admin" com a senha SEED_SENHA do server/.env. Nenhum outro dado.
import { db } from './db'
import { gerarHash } from './auth'

const senha = process.env.SEED_SENHA
if (!senha) throw new Error('Defina SEED_SENHA em server/.env')
const senhaHash = await gerarHash(senha)
// E-mail do administrador, para ele poder usar "esqueci a senha".
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase() || null

await db.usuario.upsert({
  where: { login: 'admin' },
  update: { senhaHash, ativo: true, ...(email && { email }) },
  create: { login: 'admin', nome: 'Administrador', perfis: ['ADMINISTRADOR'], senhaHash, email },
})
await db.$disconnect()
console.log('Usuário "admin" pronto (senha = SEED_SENHA do server/.env).')
