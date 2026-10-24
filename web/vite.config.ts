import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Em desenvolvimento, /api vai para o servidor Express: front e API ficam no mesmo endereço.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': process.env.API_URL ?? 'http://localhost:3001' } },
})
