// Testes unitários do front: componentes no jsdom (npm run test:web na raiz).
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['test/preparar.ts'],
    reporters: ['verbose', 'json'],
    outputFile: { json: '../test-results/vitest-web.json' },
  },
})
