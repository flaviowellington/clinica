import { useState } from 'react'
import { create } from 'zustand'
import { Dialogo } from './Dialogo'

interface Pedido {
  titulo: string
  texto: string
  botao: string
  perigo: boolean
  /** Com rótulo, pede um texto (ex.: motivo) e responde com ele. */
  campo?: string
  /** Com palavra, a pessoa precisa digitá-la para liberar o botão (ação sensível). */
  palavra?: string
  responder: (r: string | null) => void
}

const usePedido = create<{ pedido: Pedido | null }>()(() => ({ pedido: null }))

function abrir(p: Omit<Pedido, 'responder'>) {
  return new Promise<string | null>((responder) =>
    usePedido.setState({ pedido: { ...p, responder } }),
  )
}

/** Troca o confirm() do navegador: resolve true só se a pessoa clicar no botão. */
export async function confirmar(
  texto: string,
  { titulo = 'Tem certeza?', botao = 'Excluir', perigo = true } = {},
) {
  return (await abrir({ titulo, texto, botao, perigo })) !== null
}

/** Troca o prompt(): resolve com o texto digitado, ou null se cancelar. */
export function perguntar(campo: string, { titulo = campo, texto = '', botao = 'Confirmar' } = {}) {
  return abrir({ titulo, texto, botao, perigo: false, campo })
}

/** Ação sensível: só confirma depois de digitar a palavra (em vermelho, como nas exclusões). */
export async function confirmarDigitando(
  palavra: string,
  texto: string,
  { titulo = 'Tem certeza?', botao = 'Confirmar' } = {},
) {
  return (await abrir({ titulo, texto, botao, perigo: true, palavra })) !== null
}

/** Montado uma vez na raiz do app. */
export function Confirmacao() {
  const pedido = usePedido((s) => s.pedido)
  const [valor, setValor] = useState('')
  const fechar = (r: string | null) => {
    pedido?.responder(r)
    usePedido.setState({ pedido: null })
    setValor('')
  }
  const liberado = !pedido?.palavra || valor.trim().toLowerCase() === pedido.palavra
  return (
    <Dialogo aberto={!!pedido} aoFechar={() => fechar(null)} titulo={pedido?.titulo ?? ''}>
      {pedido && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (liberado) fechar(valor)
          }}
        >
          {pedido.texto &&
            (pedido.palavra ? (
              <p className="alerta-perigo">{pedido.texto}</p>
            ) : (
              <p>{pedido.texto}</p>
            ))}
          {pedido.palavra && (
            <div>
              <label className="rotulo" htmlFor="confirma-palavra">
                Digite <span className="text-perigo">{pedido.palavra}</span> para confirmar
              </label>
              <input
                id="confirma-palavra"
                className="campo"
                autoComplete="off"
                autoFocus
                value={valor}
                onChange={(e) => setValor(e.target.value)}
              />
            </div>
          )}
          {pedido.campo && (
            <label className="block">
              <span className="rotulo">{pedido.campo}</span>
              <input
                className="campo"
                autoFocus
                value={valor}
                onChange={(e) => setValor(e.target.value)}
              />
            </label>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="botao-leve" onClick={() => fechar(null)}>
              Voltar
            </button>
            <button
              className={pedido.perigo ? 'botao-perigo' : 'botao'}
              autoFocus={!pedido.campo && !pedido.palavra}
              disabled={!liberado}
            >
              {pedido.botao}
            </button>
          </div>
        </form>
      )}
    </Dialogo>
  )
}
