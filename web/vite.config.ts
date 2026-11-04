import { createReadStream } from 'node:fs'
import { cp } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Python dos gráficos (Pyodide): servido pelo próprio app em /pyodide/, sem CDN de terceiros (LGPD).
 * Em desenvolvimento sai direto do node_modules; no build é copiado para dist/pyodide.
 */
function pyodide(): Plugin {
  const pasta = dirname(fileURLToPath(import.meta.resolve('pyodide/package.json')))
  const TIPOS: Record<string, string> = {
    mjs: 'text/javascript',
    js: 'text/javascript',
    wasm: 'application/wasm',
    json: 'application/json',
    zip: 'application/zip',
  }
  return {
    name: 'pyodide-local',
    configureServer(server) {
      server.middlewares.use('/pyodide', (req, res, next) => {
        const nome = (req.url ?? '').split('?')[0].replace(/^\/+/, '')
        if (!/^[\w.-]+$/.test(nome)) return next()
        res.setHeader('Content-Type', TIPOS[nome.split('.').pop()!] ?? 'application/octet-stream')
        createReadStream(join(pasta, nome))
          .on('error', () => next())
          .pipe(res)
      })
    },
    async writeBundle(opcoes) {
      await cp(pasta, join(opcoes.dir!, 'pyodide'), {
        recursive: true,
        filter: (f) => !/\.(map|d\.ts|html|md)$/.test(f) && !f.endsWith('package.json'),
      })
    },
  }
}

// Em desenvolvimento, /api vai para o servidor Express: front e API ficam no mesmo endereço.
export default defineConfig({
  plugins: [react(), tailwindcss(), pyodide()],
  worker: { format: 'es' },
  server: { proxy: { '/api': process.env.API_URL ?? 'http://localhost:3001' } },
})
