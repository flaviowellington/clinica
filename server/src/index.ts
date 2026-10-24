import { criarApp } from './app'

const porta = Number(process.env.PORTA) || 3001
criarApp().listen(porta, () => console.log(`API em http://localhost:${porta}`))
