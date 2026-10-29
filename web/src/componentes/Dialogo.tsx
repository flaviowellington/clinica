import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/** Janela modal com o <dialog> do próprio navegador (Esc fecha, foco preso dentro). */
export function Dialogo(props: {
  aberto: boolean
  aoFechar: () => void
  titulo: string
  children: ReactNode
  /** Janela larga, para editores como o de orçamento. */
  largo?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const apertouFora = useRef(false)
  // O conteúdo só monta com o <dialog> já aberto: antes disso o autoFocus dos campos não pega.
  const [montado, setMontado] = useState(false)
  useLayoutEffect(() => {
    const d = ref.current!
    setMontado(props.aberto)
    if (props.aberto && !d.open) {
      d.showModal()
      // Aberto por cima de outro, o foco às vezes fica na janela de baixo e o Esc fecharia ela.
      if (!d.contains(document.activeElement)) d.focus()
    }
    if (!props.aberto && d.open) d.close()
  }, [props.aberto])

  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      // scroll-p*: com TAB, o campo focado rola para a vista sem ficar atrás do rodapé fixo.
      // Esc fecha só a janela onde está o foco; sem isso o Chrome às vezes fecha a de baixo junto.
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        e.stopPropagation()
        props.aoFechar()
      }}
      // No React o "close" de um diálogo aberto por cima sobe até este: só fecha se for o próprio.
      onClose={(e) => e.target === e.currentTarget && props.aoFechar()}
      // Clique fora fecha só se apertou E soltou no fundo: arrastar de dentro para fora (ex.: selecionar texto) não fecha.
      // O conteúdo preenche o <dialog> (p-0), então alvo === o próprio diálogo significa o fundo.
      onPointerDown={(e) => (apertouFora.current = e.target === e.currentTarget)}
      onPointerUp={(e) => {
        if (apertouFora.current && e.target === e.currentTarget) props.aoFechar()
        apertouFora.current = false
      }}
      className={`m-auto scroll-pt-6 scroll-pb-24 scroll-smooth ${props.largo ? 'w-[min(1000px,calc(100%-2rem))]' : 'w-[min(640px,calc(100%-2rem))]'} rounded-2xl border border-borda bg-superficie p-0 text-texto outline-none backdrop:bg-black/40`}
    >
      <div className="flex items-center justify-between border-b border-borda px-5 py-3">
        <h2 className="text-lg font-semibold">{props.titulo}</h2>
        <button
          type="button"
          onClick={props.aoFechar}
          aria-label="Fechar"
          className="text-xl text-suave"
        >
          ×
        </button>
      </div>
      <div className="p-5">{props.aberto && montado && props.children}</div>
    </dialog>
  )
}
