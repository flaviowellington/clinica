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
    if (props.aberto && !d.open) d.showModal()
    if (!props.aberto && d.open) d.close()
  }, [props.aberto])

  return (
    <dialog
      ref={ref}
      onClose={props.aoFechar}
      className={`m-auto ${props.largo ? 'w-[min(1000px,calc(100%-2rem))]' : 'w-[min(640px,calc(100%-2rem))]'} rounded-lg border border-borda bg-superficie p-0 text-texto backdrop:bg-black/40`}
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
