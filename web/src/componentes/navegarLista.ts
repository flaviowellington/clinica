import type { KeyboardEvent } from 'react'

/**
 * Teclado nas listas que abrem embaixo de um campo de busca (onKeyDown do contêiner campo + lista):
 * ↑/↓ andam pelas opções (botões) e voltam ao campo, Enter escolhe (é o clique do botão),
 * Esc volta ao campo e qualquer tecla de digitação volta ao campo e vai para ele.
 */
export function navegarLista(e: KeyboardEvent<HTMLElement>) {
  const campo = e.currentTarget.querySelector<HTMLInputElement>('input:not([type=hidden])')
  const opcoes = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled)')]
  const i = opcoes.indexOf(document.activeElement as HTMLElement)

  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (!opcoes.length) return
    e.preventDefault()
    // O campo é a posição -1 da roda: do fim volta a ele, e ↑ no campo vai para a última.
    const n = opcoes.length + 1
    const j = ((i + 1 + (e.key === 'ArrowDown' ? 1 : -1) + n) % n) - 1
    if (j < 0) campo?.focus()
    else opcoes[j].focus()
    return
  }
  if (i < 0 || !campo) return // a tecla já está no campo
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation() // volta ao campo, não fecha a janela
    campo.focus()
  } else if (
    e.key === 'Backspace' ||
    e.key === 'Delete' ||
    (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey)
  ) {
    // Sem preventDefault: com o foco já no campo, o navegador escreve (ou apaga) nele.
    campo.focus()
  }
}
