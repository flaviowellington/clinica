import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Tema = 'claro' | 'escuro'
export const PALETAS = {
  uva: 'Uva',
  tutti: 'Tutti-frutti',
  hortela: 'Hortelã',
  tangerina: 'Tangerina',
  girassol: 'Girassol',
  nuvem: 'Nuvem',
} as const
export type Paleta = keyof typeof PALETAS

/** Tema global (claro/escuro + paleta de cores), lembrado neste navegador. */
export const useTema = create<{
  tema: Tema
  paleta: Paleta
  menuRecolhido: boolean
  alternar: () => void
  escolherPaleta: (p: Paleta) => void
  alternarMenu: () => void
}>()(
  persist(
    (set, get) => ({
      tema: matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro',
      paleta: 'uva',
      menuRecolhido: false,
      alternar: () => set({ tema: get().tema === 'claro' ? 'escuro' : 'claro' }),
      escolherPaleta: (paleta) => set({ paleta }),
      alternarMenu: () => set({ menuRecolhido: !get().menuRecolhido }),
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
