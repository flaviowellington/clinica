/** Barra de abas de uma tela (Financeiro, Ficha, Configurações). */
export function Abas<T extends string>(props: {
  abas: { id: T; rotulo: string }[]
  atual: T
  aoTrocar: (id: T) => void
}) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-borda">
      {props.abas.map((a) => (
        <button
          key={a.id}
          role="tab"
          aria-selected={props.atual === a.id}
          onClick={() => props.aoTrocar(a.id)}
          className={`shrink-0 border-b-2 px-3 py-2 ${props.atual === a.id ? 'border-primaria font-medium text-primaria' : 'border-transparent text-suave hover:text-texto'}`}
        >
          {a.rotulo}
        </button>
      ))}
    </div>
  )
}
