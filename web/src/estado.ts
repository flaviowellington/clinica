import { create } from 'zustand'
import { useEffect, useState, type MouseEvent } from 'react'
import { useCanGoBack, useRouter } from '@tanstack/react-router'
import { persist } from 'zustand/middleware'

type Tema = 'claro' | 'escuro'
/** Tema global (claro/escuro), lembrado neste navegador. */
export const useTema = create<{
  tema: Tema
  menuRecolhido: boolean
  alternar: () => void
  alternarMenu: () => void
}>()(
  persist(
    (set, get) => ({
      tema: matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro',
      menuRecolhido: false,
      alternar: () => set({ tema: get().tema === 'claro' ? 'escuro' : 'claro' }),
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

/**
 * useState que sobrevive à troca de tela nesta aba do navegador (sessionStorage):
 * quem sai no meio de um agendamento e volta encontra tudo como deixou.
 */
export function useSalvo<T>(chave: string, inicial: T | (() => T)) {
  const [valor, setValor] = useState<T>(() => {
    try {
      const s = sessionStorage.getItem(chave)
      if (s !== null) return JSON.parse(s) as T
    } catch {
      /* sem armazenamento: começa do zero */
    }
    return typeof inicial === 'function' ? (inicial as () => T)() : inicial
  })
  useEffect(() => {
    try {
      sessionStorage.setItem(chave, JSON.stringify(valor))
    } catch {
      /* sem armazenamento: só não lembra */
    }
  }, [chave, valor])
  return [valor, setValor] as const
}

/** Apaga o que useSalvo guardou com esse prefixo (ex.: ao concluir ou cancelar o rascunho). */
export function esquecer(prefixo: string) {
  try {
    for (const k of Object.keys(sessionStorage))
      if (k.startsWith(prefixo)) sessionStorage.removeItem(k)
  } catch {
    /* sem armazenamento: nada guardado */
  }
}

/**
 * onClick para os botões "Voltar" (que são <Link> com o destino padrão): se houver tela
 * anterior nesta aba, volta para ela, como o voltar do navegador; senão, segue o link.
 */
export function useVoltar() {
  const router = useRouter()
  const podeVoltar = useCanGoBack()
  return (e: MouseEvent) => {
    if (!podeVoltar || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    router.history.back()
  }
}
