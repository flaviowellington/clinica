import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, dataBR, mensagemDeErro, type Paciente } from '../api'
import { avisar } from '../estado'

/** R-050: pacientes excluídos, para o administrador restaurar. */
export function Lixeira() {
  const qc = useQueryClient()
  const lista = useQuery({
    queryKey: ['lixeira'],
    queryFn: async () => (await api.get<Paciente[]>('/lixeira/pacientes')).data,
  })
  const restaurar = useMutation({
    mutationFn: (id: number) => api.post(`/lixeira/pacientes/${id}/restaurar`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lixeira'] })
      qc.invalidateQueries({ queryKey: ['pacientes'] })
      avisar('Paciente restaurado')
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Lixeira</h1>
        <p className="text-suave">Pacientes excluídos. Restaurar devolve a ficha às buscas.</p>
      </div>
      {lista.isError && <p className="text-perigo">{mensagemDeErro(lista.error)}</p>}
      {lista.data?.length === 0 && <p className="text-suave">A lixeira está vazia.</p>}
      {!!lista.data?.length && (
        <ul className="cartao divide-y divide-borda p-0">
          {lista.data.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span>
                <strong>{p.nome}</strong>{' '}
                <span className="text-suave">excluído em {dataBR(p.excluidoEm)}</span>
              </span>
              <button
                className="botao-leve"
                disabled={restaurar.isPending}
                onClick={() => restaurar.mutate(p.id)}
              >
                Restaurar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
