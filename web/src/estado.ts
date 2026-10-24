import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Tema = 'claro' | 'escuro'

/** Tema global, lembrado neste navegador. */
export const useTema = create<{ tema: Tema; alternar: () => void }>()(
  persist(
    (set, get) => ({
      tema: matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro',
      alternar: () => set({ tema: get().tema === 'claro' ? 'escuro' : 'claro' }),
    }),
    { name: 'tema' },
  ),
)

interface Aviso {
  id: number
  texto: string
  erro?: boolean
}

/** Avisos curtos no canto da tela ("Paciente cadastrado com sucesso"). */
export const useAvisos = create<{ avisos: Aviso[] }>()(() => ({ avisos: [] }))

let proximo = 0
export function avisar(texto: string, erro = false) {
  const id = ++proximo
  useAvisos.setState((s) => ({ avisos: [...s.avisos, { id, texto, erro }] }))
  setTimeout(
    () => useAvisos.setState((s) => ({ avisos: s.avisos.filter((a) => a.id !== id) })),
    4000,
  )
}
