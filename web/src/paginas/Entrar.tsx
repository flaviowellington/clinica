import { useState, type FormEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { api, mensagemDeErro, type Eu } from '../api'

export function Entrar() {
  const navegar = useNavigate()
  const qc = useQueryClient()
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setEnviando(true)
    setErro('')
    try {
      const { data } = await api.post<Eu>(
        '/entrar',
        Object.fromEntries(new FormData(e.currentTarget)),
      )
      qc.setQueryData(['eu'], data)
      navegar({ to: '/' })
    } catch (err) {
      setErro(mensagemDeErro(err))
      setEnviando(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center p-4">
      <form onSubmit={enviar} className="cartao w-full max-w-sm space-y-4">
        <h1 className="text-xl font-semibold">Entrar</h1>
        <label className="block">
          <span className="rotulo">Usuário</span>
          <input name="login" autoComplete="username" required className="campo" autoFocus />
        </label>
        <label className="block">
          <span className="rotulo">Senha</span>
          <input
            name="senha"
            type="password"
            autoComplete="current-password"
            required
            className="campo"
          />
        </label>
        {erro && (
          <p role="alert" className="text-perigo">
            {erro}
          </p>
        )}
        <button className="botao w-full" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
