import { useId, useState, type InputHTMLAttributes } from 'react'
import { normalizar } from '../../../shared/regras'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'list'> & {
  value: string
  onChange: (valor: string) => void
  /** O que aparece na lista; o campo aceita também texto livre. */
  sugestoes: readonly string[]
}

/**
 * Campo de texto com lista de sugestões no padrão do sistema
 * (no lugar do <datalist> do navegador, que não segue o tema).
 */
export function CampoSugestoes({ value, onChange, sugestoes, className = '', ...resto }: Props) {
  const id = useId()
  const [aberta, setAberta] = useState(false)
  const [ativa, setAtiva] = useState(0)
  const termo = normalizar(value.trim())
  const contem = sugestoes.filter((s) => normalizar(s).includes(termo))
  // Primeiro as que começam com o digitado ("4" → 48, 47… antes de 14, 24).
  const achadas = [
    ...contem.filter((s) => normalizar(s).startsWith(termo)),
    ...contem.filter((s) => !normalizar(s).startsWith(termo)),
  ]
  // Já escrito igual à única sugestão: não há o que mostrar.
  const mostrar = aberta && achadas.length > 0 && !(achadas.length === 1 && achadas[0] === value)

  const escolher = (s: string) => {
    onChange(s)
    setAberta(false)
  }

  return (
    <div className="relative">
      <input
        {...resto}
        className={`campo ${className}`}
        role="combobox"
        aria-expanded={mostrar}
        aria-controls={`${id}-lista`}
        aria-autocomplete="list"
        autoComplete="off"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setAberta(true)
          setAtiva(0)
        }}
        onFocus={(e) => {
          setAberta(true)
          resto.onFocus?.(e)
        }}
        onBlur={(e) => {
          setAberta(false)
          resto.onBlur?.(e)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            setAberta(true)
            const passo = e.key === 'ArrowDown' ? 1 : -1
            setAtiva((a) => (a + passo + achadas.length) % Math.max(achadas.length, 1))
          } else if (e.key === 'Enter' && mostrar) {
            e.preventDefault()
            escolher(achadas[ativa] ?? achadas[0])
          } else if (e.key === 'Escape' && mostrar) {
            e.preventDefault()
            e.stopPropagation() // fecha só a lista, não a janela
            setAberta(false)
          }
          resto.onKeyDown?.(e)
        }}
      />
      {mostrar && (
        <ul
          id={`${id}-lista`}
          role="listbox"
          // Clicar na lista não tira o foco do campo (senão ela fecharia antes do clique).
          onMouseDown={(e) => e.preventDefault()}
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-xl border border-borda bg-superficie py-1 shadow-[0_10px_30px_-8px_color-mix(in_srgb,black_30%,transparent)]"
        >
          {achadas.map((s, i) => (
            <li
              key={s}
              role="option"
              aria-selected={i === ativa}
              onClick={() => escolher(s)}
              onMouseEnter={() => setAtiva(i)}
              className={`cursor-pointer px-3 py-2 ${i === ativa ? 'bg-primaria-clara' : ''} ${s === value ? 'font-bold text-primaria' : ''}`}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
