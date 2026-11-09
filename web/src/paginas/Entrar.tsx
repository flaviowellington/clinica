import { useState, type FormEvent } from 'react'
import { SENHA_MINIMA } from '../../../shared/dtos'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { api, mensagemDeErro, type Eu } from '../api'
import logoFabrica from '../assets/logo_fabrica.png'
import logoRiso from '../assets/logo_riso.png'

// As logos têm fundo branco: multiply apaga o branco no tema claro; no escuro, inverte a cor e usa screen.
export const LOGO =
  'mix-blend-multiply dark:mix-blend-screen dark:[filter:invert(1)_hue-rotate(180deg)]'

/** entrar → (esqueci a senha) pedir o código → trocar a senha com o código. */
type Etapa = 'entrar' | 'pedir' | 'trocar'

export function Entrar() {
  const navegar = useNavigate()
  const qc = useQueryClient()
  const [etapa, setEtapa] = useState<Etapa>('entrar')
  const [email, setEmail] = useState('')
  const [aviso, setAviso] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  function irPara(e: Etapa) {
    setEtapa(e)
    setErro('')
    setAviso('')
  }

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setEnviando(true)
    setErro('')
    const dados = Object.fromEntries(new FormData(e.currentTarget))
    try {
      if (etapa === 'pedir') {
        const { data } = await api.post<{ mensagem: string }>('/senha/codigo', dados)
        setEmail(String(dados.email))
        irPara('trocar')
        setAviso(data.mensagem)
      } else {
        const rota = etapa === 'entrar' ? '/entrar' : '/senha/redefinir'
        const { data } = await api.post<Eu>(rota, { ...dados, email })
        qc.setQueryData(['eu'], data)
        navegar({ to: '/' })
      }
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
    setEnviando(false)
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
        <h1 className="text-center text-2xl font-extrabold text-titulo">
          {etapa === 'entrar' ? 'Que bom ver você!' : 'Trocar a senha'}
        </h1>
        {etapa === 'entrar' && (
          <>
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
          </>
        )}
        {etapa === 'pedir' && (
          <label className="block">
            <span className="rotulo">E-mail cadastrado</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              className="campo"
              defaultValue={email}
              autoFocus
            />
            <span className="ajuda">Enviaremos um código de 6 dígitos para ele.</span>
          </label>
        )}
        {etapa === 'trocar' && (
          <>
            {aviso && <p className="text-sm text-suave">{aviso}</p>}
            <label className="block">
              <span className="rotulo">Código</span>
              <input
                name="codigo"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
                className="campo tracking-[0.5em]"
                autoFocus
              />
            </label>
            <label className="block">
              <span className="rotulo">Nova senha</span>
              <input
                name="senha"
                type="password"
                autoComplete="new-password"
                minLength={SENHA_MINIMA}
                required
                className="campo"
              />
              <span className="ajuda">Pelo menos {SENHA_MINIMA} caracteres.</span>
            </label>
          </>
        )}
        {erro && (
          <p role="alert" className="text-perigo">
            {erro}
          </p>
        )}
        <button className="botao-secundario h-12 w-full rounded-full text-base" disabled={enviando}>
          {enviando
            ? 'Aguarde…'
            : { entrar: 'Entrar', pedir: 'Enviar código', trocar: 'Trocar senha e entrar' }[etapa]}
        </button>
        <div className="flex justify-center gap-4 text-sm">
          {etapa === 'entrar' ? (
            <button
              type="button"
              className="text-primaria underline"
              onClick={() => irPara('pedir')}
            >
              Esqueceu a senha?
            </button>
          ) : (
            <>
              <button
                type="button"
                className="text-primaria underline"
                onClick={() => irPara('entrar')}
              >
                Voltar para o login
              </button>
              {etapa === 'trocar' && (
                <button
                  type="button"
                  className="text-primaria underline"
                  onClick={() => irPara('pedir')}
                >
                  Pedir outro código
                </button>
              )}
            </>
          )}
        </div>
      </form>
    </main>
  )
}
