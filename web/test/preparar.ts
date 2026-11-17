// O que o jsdom não tem e os componentes usam.
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(cleanup)

// <dialog> modal (Dialogo.tsx).
const D = HTMLDialogElement.prototype
if (!D.showModal)
  D.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
if (!D.close)
  D.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  }

// Tema (estado.ts) consulta o tema do sistema ao carregar.
window.matchMedia ??= ((q: string) => ({
  matches: false,
  media: q,
  onchange: null,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia

// Lista de sugestões rola até a opção destacada.
Element.prototype.scrollIntoView ??= function () {}
