import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type Paciente } from '../api'

/** Escolher um paciente: busca por nome ou sobrenome com ENTER; mostra o escolhido com "Trocar". */
export function BuscaPaciente(props: {
  valor: Paciente | null
  aoEscolher: (p: Paciente | null) => void
  somenteAtivos?: boolean
  autoFocus?: boolean
}) {
  const [busca, setBusca] = useState('')
  const [termo, setTermo] = useState('')
  const achados = useQuery({
    queryKey: ['pacientes', termo, 1],
    queryFn: async () =>
      (await api.get<{ itens: Paciente[] }>('/pacientes', { params: { busca: termo } })).data.itens,
    enabled: !!termo,
  })

  if (props.valor)
    return (
      <div className="flex items-center justify-between rounded-md border border-borda px-3 py-2">
        <span>
          <span className="font-medium">{props.valor.nome}</span>
          {props.valor.celular && <span className="ml-2 text-suave">{props.valor.celular}</span>}
        </span>
        <button type="button" className="text-primaria" onClick={() => props.aoEscolher(null)}>
          Trocar
        </button>
      </div>
    )

  return (
    <div>
      <input
        type="search"
        className="campo"
        placeholder="Nome ou sobrenome e ENTER"
        value={busca}
        autoFocus={props.autoFocus}
        onChange={(e) => setBusca(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            setTermo(busca.trim())
          }
        }}
      />
      {termo && (
        <ul className="mt-1 max-h-48 overflow-y-auto rounded-md border border-borda">
          {achados.data?.length === 0 && (
            <li className="px-3 py-2 text-suave">Nenhum paciente encontrado.</li>
          )}
          {achados.data?.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={props.somenteAtivos && !p.ativo}
                onClick={() => props.aoEscolher(p)}
                className="w-full px-3 py-2 text-left hover:bg-primaria-clara disabled:text-suave"
              >
                {p.nome}
                {!p.ativo && ' (inativo)'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
