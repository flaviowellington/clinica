// Teste de permissões por perfil: só roda à mão (npm run test:permissoes).
import { defineConfig, mergeConfig } from 'vitest/config'
import base from './vitest.config.ts'

export default mergeConfig(base, defineConfig({ test: { include: ['test/permissoes.manual.ts'] } }))
