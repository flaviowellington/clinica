import type { ReactNode, SelectHTMLAttributes } from 'react'

/** Opção: o texto (vale como valor e rótulo) ou [valor, rótulo]. */
export type Opcao = string | number | readonly [string | number, ReactNode]

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & {
  /** Lista de opções, ou um objeto de rótulos ({ VALOR: 'Rótulo' }). */
  opcoes?: readonly Opcao[] | Record<string, ReactNode>
  /** Opções agrupadas ({ Grupo: ['a', 'b'] }), depois das soltas. */
  grupos?: Record<string, readonly Opcao[]>
  /** Primeira opção, de valor vazio. Padrão "Selecione"; false quando sempre há uma escolhida. */
  vazio?: ReactNode | false
  /** Erro vindo do servidor. */
  erro?: string
}

const lista = (o: Props['opcoes']): readonly Opcao[] =>
  !o ? [] : Array.isArray(o) ? o : Object.entries(o as Record<string, ReactNode>)

const opcao = (o: Opcao) => {
  const [valor, rotulo] = Array.isArray(o) ? o : [o, o]
  return (
    <option key={valor} value={valor}>
      {rotulo}
    </option>
  )
}

/** Dropdown padrão do sistema (o mesmo do cadastro de paciente). */
export function CampoSelect({
  opcoes,
  grupos,
  vazio = 'Selecione',
  erro,
  className = '',
  ...resto
}: Props) {
  return (
    <>
      <select
        {...resto}
        className={`campo ${className}`}
        aria-invalid={!!erro || undefined}
        onKeyDown={(e) => {
          // Enter abre a lista (o navegador só abre com espaço ou Alt+↓); as setas navegam nela.
          if (e.key === 'Enter') {
            e.preventDefault()
            try {
              e.currentTarget.showPicker()
            } catch {
              // navegador sem showPicker em <select>: fica o espaço
            }
          }
          resto.onKeyDown?.(e)
        }}
      >
        {vazio !== false && <option value="">{vazio}</option>}
        {lista(opcoes).map(opcao)}
        {grupos &&
          Object.entries(grupos).map(([g, itens]) => (
            <optgroup key={g} label={g}>
              {itens.map(opcao)}
            </optgroup>
          ))}
      </select>
      {erro && <span className="erro-campo">{erro}</span>}
    </>
  )
}
