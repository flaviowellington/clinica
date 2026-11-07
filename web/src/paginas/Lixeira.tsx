import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, cpfBR, dataBR, mensagemDeErro, type Paciente } from '../api'
import { avisar } from '../estado'
import { Icone } from '../componentes/Icones'

/** Sem acento e em minúsculas, para a busca achar "joão" digitando "joao". */
const normal = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()

/** R-050: pacientes excluídos, para o administrador restaurar. */
export function Lixeira() {
  const qc = useQueryClient()
  const [busca, setBusca] = useState('')
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

  const termo = normal(busca.trim())
  const digitos = busca.replace(/\D/g, '')
  const filtrados = (lista.data ?? []).filter(
    (p) => normal(p.nome).includes(termo) || (!!digitos && !!p.cpf?.includes(digitos)),
  )

  return (
    <div className="space-y-5">
      <header>
        <h1 className="titulo">Lixeira</h1>
        <p className="subtitulo">Pacientes excluídos. Restaurar devolve a ficha às buscas.</p>
      </header>

      {lista.isError && <p className="alerta-perigo">{mensagemDeErro(lista.error)}</p>}

      <section className="cartao overflow-hidden p-0" aria-labelledby="titulo-lixeira">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-borda px-4 py-3">
          <h2 id="titulo-lixeira" className="flex items-center gap-2 text-base">
            Pacientes excluídos
            {lista.data && <span className="etiqueta etiqueta-primaria">{lista.data.length}</span>}
          </h2>
          {!!lista.data?.length && (
            <label className="relative w-full sm:w-80">
              <Icone
                nome="busca"
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-suave"
              />
              <span className="sr-only">Buscar paciente excluído</span>
              <input
                type="search"
                className="campo py-1.5 pl-9"
                placeholder="Nome ou CPF"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </label>
          )}
        </header>

        {lista.isPending && <p className="px-4 py-10 text-center text-suave">Carregando…</p>}

        {lista.data?.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center text-suave">
            <Icone nome="lixeira" className="h-10 w-10 opacity-40" />
            <p className="font-bold">A lixeira está vazia.</p>
            <p className="text-sm">Pacientes excluídos aparecem aqui até serem restaurados.</p>
          </div>
        )}

        {!!lista.data?.length && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left">
              <thead>
                <tr>
                  {['Paciente', 'CPF', 'Nascimento', 'Excluído em', ''].map((t) => (
                    <th
                      key={t}
                      className="px-4 py-2.5 text-xs font-bold tracking-wide text-suave uppercase shadow-[inset_0_-1px_0_var(--borda)]"
                    >
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className={lista.isFetching ? 'opacity-60' : ''}>
                {filtrados.map((p) => (
                  <tr key={p.id} className="border-b border-borda last:border-0 hover:bg-primaria-clara">
                    <td className="px-4 py-2.5 font-bold text-titulo">{p.nome}</td>
                    <td className="px-4 py-2.5 font-mono text-sm">{cpfBR(p.cpf) || '—'}</td>
                    <td className="px-4 py-2.5">{dataBR(p.nascimento) || '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className="etiqueta etiqueta-perigo">{dataBR(p.excluidoEm)}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button
                        className="botao-leve botao-pequeno"
                        disabled={restaurar.isPending}
                        onClick={() => restaurar.mutate(p.id)}
                      >
                        <Icone nome="girar" className="h-4 w-4" />
                        Restaurar
                      </button>
                    </td>
                  </tr>
                ))}
                {filtrados.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-suave">
                      Nenhum paciente excluído com “{busca}”.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="alerta-info">
        Nada é apagado de verdade: o prontuário de um paciente excluído continua guardado e volta
        inteiro ao restaurar.
      </p>
    </div>
  )
}
