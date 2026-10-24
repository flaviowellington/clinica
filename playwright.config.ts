import { defineConfig } from '@playwright/test'
import dotenv from 'dotenv'

// O teste ponta a ponta usa o banco de TESTE, nunca o de desenvolvimento.
const env = dotenv.config({ path: 'server/.env', quiet: true }).parsed ?? {}

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:5174' },
  webServer: [
    {
      command: 'npm run e2e:servidor -w server',
      url: 'http://localhost:3101/api/saude',
      env: { DATABASE_URL: env.DATABASE_URL_TESTE, PORTA: '3101' },
    },
    {
      command: 'npm run dev -w web -- --port 5174 --strictPort',
      url: 'http://localhost:5174',
      env: { API_URL: 'http://localhost:3101' },
      // No Windows o Vite às vezes fica aberto depois do teste; reaproveitar evita "porta em uso".
      reuseExistingServer: true,
    },
  ],
})
