import { defineConfig } from '@playwright/test'
import dotenv from 'dotenv'

// O teste ponta a ponta usa o banco do e2e (DATABASE_URL_E2E), nunca o de desenvolvimento.
const env = dotenv.config({ path: 'server/.env', quiet: true }).parsed ?? {}
// Banco só do e2e: o npm test apaga o DATABASE_URL_TESTE a cada teste, e os dois rodam juntos.
if (!env.DATABASE_URL_E2E)
  throw new Error('Defina DATABASE_URL_E2E em server/.env (veja .env.example)')
if (env.DATABASE_URL_E2E === env.DATABASE_URL_TESTE)
  throw new Error('DATABASE_URL_E2E tem que ser outro banco, não o DATABASE_URL_TESTE')

export default defineConfig({
  testDir: 'e2e',
  // Falhou: guarda a captura da tela e o trace (cada passo com a tela do momento).
  use: {
    baseURL: 'http://localhost:5199',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  // O Playwright apaga esta pasta a cada rodada; os resultados do Vitest ficam em test-results/.
  outputDir: 'test-results/e2e',
  // Console: um teste por linha, com os passos (test.step). Erro, captura e trace no HTML:
  // npx playwright show-report
  reporter: [
    ['list', { printSteps: true }],
    ['html', { open: 'never' }],
  ],
  webServer: [
    {
      command: 'npm run e2e:servidor -w server',
      url: 'http://localhost:3101/api/saude',
      // Vários testes em paralelo do mesmo IP passam do limite de 600 pedidos/min.
      env: { DATABASE_URL: env.DATABASE_URL_E2E, PORTA: '3101', LIMITE_API_POR_MINUTO: '100000' },
      // Só os erros do servidor aparecem no console (o seed fala muito).
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: 'npm run dev -w web -- --port 5199 --strictPort',
      url: 'http://localhost:5199',
      env: { API_URL: 'http://localhost:3101' },
      // Porta só do e2e: o Vite de dev pula para 5174 quando a 5173 está ocupada, e reaproveitá-lo
      // mandaria a API para o servidor de dev. No Windows o Vite às vezes fica aberto depois do teste;
      // reaproveitar evita "porta em uso".
      reuseExistingServer: true,
      stdout: 'ignore',
    },
  ],
})
