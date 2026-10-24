// Antes dos testes: aplica as migrações no banco de TESTE (sem apagar o banco).
// Cada teste limpa as tabelas no beforeEach (test/ajuda.ts).
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { exigirBancoDeTeste } from '../src/limpar-teste'

export default function () {
  const url = process.env.DATABASE_URL_TESTE!
  exigirBancoDeTeste(url)
  execSync('npx prisma migrate deploy', {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  })
}
