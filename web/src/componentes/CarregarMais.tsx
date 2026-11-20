import { useEffect, useRef, useState } from 'react'

/**
 * Lista longa aos poucos (web/RESPONSIVIDADE.md, regra 3): mostra `passo` itens e um botão
 * "Carregar mais". Quando `chave` muda (outro filtro, outra busca), volta ao começo.
 * `proximo` serve à rolagem infinita (`FimDaLista`); é null quando já mostrou tudo.
 */
export function useAosPoucos<T>(lista: T[], chave: unknown = null, passo = 50) {
  const [estado, setEstado] = useState({ chave, qtd: passo })
  const qtd = Object.is(estado.chave, chave) ? estado.qtd : passo
  const resto = lista.length - qtd
  const proximo = resto > 0 ? () => setEstado({ chave, qtd: qtd + passo }) : null
  return {
    itens: resto > 0 ? lista.slice(0, qtd) : lista,
    proximo,
    mais: proximo ? (
      <button type="button" className="botao-leve w-full" onClick={proximo}>
        Carregar mais ({resto})
      </button>
    ) : null,
  }
}

/** Marcador no fim da lista: ao aparecer na tela (ou na caixa que rola), carrega a próxima parte. */
export function FimDaLista({ aoVer }: { aoVer: (() => void) | null }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!aoVer || !ref.current) return
    // Recria a cada parte: se o marcador ainda estiver à vista, carrega outra até encher a caixa.
    const o = new IntersectionObserver(([e]) => e.isIntersecting && aoVer())
    o.observe(ref.current)
    return () => o.disconnect()
  }, [aoVer])
  return aoVer ? <div ref={ref} aria-hidden className="h-px" /> : null
}
