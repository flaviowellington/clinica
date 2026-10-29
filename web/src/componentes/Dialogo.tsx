import { useEffect, useRef, type ReactNode } from 'react'

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
  useEffect(() => {
    const d = ref.current!
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
      // Esc fecha só a janela onde está o foco; sem isso o Chrome às vezes fecha a de baixo junto.
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        e.stopPropagation()
        props.aoFechar()
      }}
      // No React o "close" de um diálogo aberto por cima sobe até este: só fecha se for o próprio.
      onClose={(e) => e.target === e.currentTarget && props.aoFechar()}
      className={`m-auto ${props.largo ? 'w-[min(1000px,calc(100%-2rem))]' : 'w-[min(640px,calc(100%-2rem))]'} rounded-lg border border-borda bg-superficie p-0 text-texto outline-none backdrop:bg-black/40`}
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
      <div className="p-5">{props.aberto && props.children}</div>
    </dialog>
  )
}
