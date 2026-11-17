import { configDefaults, defineConfig } from 'vitest/config'
import './src/env.ts'

if (!process.env.DATABASE_URL_TESTE) throw new Error('Defina DATABASE_URL_TESTE em server/.env')

export default defineConfig({
  test: {
    globalSetup: './test/preparar-banco.ts',
    // Os unitários (sem banco) têm config própria: vitest.unidade.config.ts.
    exclude: [...configDefaults.exclude, 'test/unidade/**'],
    // Console em árvore e o resultado salvo (com as falhas) em test-results/.
    reporters: ['verbose', 'json'],
    outputFile: { json: '../test-results/vitest-api.json' },
    fileParallelism: false,
    testTimeout: 20_000, // cada login gera hash de senha (bcrypt), que é lento de propósito
    env: { DATABASE_URL: process.env.DATABASE_URL_TESTE },
  },
})
