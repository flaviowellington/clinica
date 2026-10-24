import './src/env'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Vazio só serve para "prisma generate"; migrar exige DATABASE_URL no .env.
  datasource: { url: process.env.DATABASE_URL ?? '' },
})
