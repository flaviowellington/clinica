import { useState } from 'react'

/**
 * Lista longa aos poucos (web/RESPONSIVIDADE.md, regra 3): mostra `passo` itens e um botão
 * "Carregar mais". Quando `chave` muda (outro filtro, outra busca), volta ao começo.
 */
export function useAosPoucos<T>(lista: T[], chave: unknown = null, passo = 50) {
  const [estado, setEstado] = useState({ chave, qtd: passo })
  const qtd = Object.is(estado.chave, chave) ? estado.qtd : passo
  const resto = lista.length - qtd
  return {
    itens: resto > 0 ? lista.slice(0, qtd) : lista,
    mais:
      resto > 0 ? (
        <button
          type="button"
          className="botao-leve w-full"
          onClick={() => setEstado({ chave, qtd: qtd + passo })}
        >
          Carregar mais ({resto})
        </button>
      ) : null,
  }
}
