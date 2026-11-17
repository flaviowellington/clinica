// Testes unitários das regras de shared/: sem banco e sem servidor (npm run test:unidade).
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/unidade/**/*.test.ts'],
    reporters: ['verbose', 'json'],
    outputFile: { json: '../test-results/vitest-unidade.json' },
  },
})
