import { useState, type FormEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { api, mensagemDeErro, type Eu } from '../api'
import logoFabrica from '../assets/logo_fabrica.png'
import logoRiso from '../assets/logo_riso.png'

// As logos têm fundo branco: multiply apaga o branco no tema claro; no escuro, inverte a cor e usa screen.
export const LOGO =
  'mix-blend-multiply dark:mix-blend-screen dark:[filter:invert(1)_hue-rotate(180deg)]'

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
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-primaria p-4">
      {/* Rosto ao fundo como marca d'água: cinza invertido vira branco, screen some com o preto. */}
      <img
        src={logoRiso}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -bottom-24 w-80 opacity-15 mix-blend-screen [filter:grayscale(1)_invert(1)] md:-right-32 md:-bottom-40 md:w-[640px]"
      />
      <img
        src={logoRiso}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute -top-28 -left-24 hidden w-96 opacity-10 mix-blend-screen [filter:grayscale(1)_invert(1)] md:block"
      />
      <form
        onSubmit={enviar}
        className="relative w-full max-w-sm space-y-4 rounded-3xl bg-superficie px-6 py-8 shadow-[0_24px_60px_rgba(26,6,51,0.35)] md:max-w-md md:p-10"
      >
        <img
          src={logoFabrica}
          alt="Fábrica do Amanhã"
          className={`mx-auto hidden aspect-[1280/340] w-56 object-cover md:block ${LOGO}`}
        />
        <img src={logoRiso} alt="Fábrica do Amanhã" className={`mx-auto w-22 md:hidden ${LOGO}`} />
        <h1 className="text-center text-2xl font-extrabold text-titulo">Que bom ver você!</h1>
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
        <button className="botao-secundario h-12 w-full rounded-full text-base" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
