import { criarApp } from './app'
import { atualizarAtrasos } from './agenda'

const porta = Number(process.env.PORTA) || 3001
criarApp().listen(porta, () => console.log(`API em http://localhost:${porta}`))

// Atrasado/Faltou mudam com o relógio, mesmo sem ninguém com a agenda aberta (relatórios contam faltas).
setInterval(() => atualizarAtrasos().catch((e) => console.error('Atrasos:', e)), 60_000)
