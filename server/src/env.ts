// Carrega server/.env. Variáveis já definidas (ex.: pelos testes) têm prioridade.
import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true })
