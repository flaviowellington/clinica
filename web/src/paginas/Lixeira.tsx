import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, mensagemDeErro } from '../api'
import { avisar } from '../estado'
import { Icone } from '../componentes/Icones'

/** Um registro excluído (server/src/lixeira.ts). */
type Excluido = {
  tipo: string
  rotulo: string
  id: number
  /** Vários dentes de um mesmo lançamento: aparecem e voltam juntos. */
  ids: number[]
  titulo: string
  detalhe: string | null
  paciente: string | null
  excluidoEm: string
  excluidoPor: string | null
}

/** Sem acento e em minúsculas, para a busca achar "joão" digitando "joao". */
const normal = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()

/** R-050: tudo que foi excluído (pacientes, consultas, orçamentos...), para o administrador restaurar. */
export function Lixeira() {
  const qc = useQueryClient()
  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState('')
  const lista = useQuery({
    queryKey: ['lixeira'],
    queryFn: async () => (await api.get<Excluido[]>('/lixeira')).data,
  })
  const restaurar = useMutation({
    mutationFn: (i: Excluido) => api.post(`/lixeira/${i.tipo}/${i.id}/restaurar`),
    onSuccess: () => {
      // O registro volta para outra tela (agenda, ficha, financeiro...): recarrega tudo.
      qc.invalidateQueries()
      avisar('Registro restaurado')
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })

  const todos = lista.data ?? []
  const tipos = [...new Map(todos.map((i) => [i.tipo, i.rotulo]))].map(([t, rotulo]) => ({
    t,
    rotulo,
    n: todos.filter((i) => i.tipo === t).length,
  }))
  const termo = normal(busca.trim())
  const filtrados = todos.filter(
    (i) =>
      (!tipo || i.tipo === tipo) &&
      normal([i.titulo, i.detalhe, i.paciente, i.rotulo].join(' ')).includes(termo),
  )

  return (
    <div className="space-y-5">
      <header>
        <h1 className="titulo">Lixeira</h1>
        <p className="subtitulo">
          Tudo que foi excluído: pacientes, consultas, orçamentos, procedimentos, controle protético
          e mais. Restaurar devolve o registro ao lugar de onde saiu.
        </p>
      </header>

      {lista.isError && <p className="alerta-perigo">{mensagemDeErro(lista.error)}</p>}

      <section className="cartao overflow-hidden p-0" aria-labelledby="titulo-lixeira">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-borda px-4 py-3">
          <h2 id="titulo-lixeira" className="flex items-center gap-2 text-base">
            Registros excluídos
            {lista.data && <span className="etiqueta etiqueta-primaria">{todos.length}</span>}
          </h2>
          {!!todos.length && (
            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <label className="w-full sm:w-56">
                <span className="sr-only">Tipo de registro</span>
                <select className="campo py-1.5" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                  <option value="">Todos os tipos ({todos.length})</option>
                  {tipos.map((x) => (
                    <option key={x.t} value={x.t}>
                      {x.rotulo} ({x.n})
                    </option>
                  ))}
                </select>
              </label>
              <label className="relative w-full sm:w-72">
                <Icone
                  nome="busca"
                  className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-suave"
                />
                <span className="sr-only">Buscar na lixeira</span>
                <input
                  type="search"
                  className="campo py-1.5 pl-9"
                  placeholder="Paciente, procedimento, descrição…"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </label>
            </div>
          )}
        </header>

        {lista.isPending && <p className="px-4 py-10 text-center text-suave">Carregando…</p>}

        {lista.data?.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center text-suave">
            <Icone nome="lixeira" className="h-10 w-10 opacity-40" />
            <p className="font-bold">A lixeira está vazia.</p>
            <p className="text-sm">O que for excluído no sistema aparece aqui até ser restaurado.</p>
          </div>
        )}

        {!!todos.length && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left">
              <thead>
                <tr>
                  {['Tipo', 'Registro', 'Paciente', 'Excluído em', ''].map((t) => (
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
                {filtrados.map((i) => (
                  <tr
                    key={`${i.tipo}-${i.id}`}
                    className="border-b border-borda last:border-0 hover:bg-primaria-clara"
                  >
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="etiqueta">{i.rotulo}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="flex items-center gap-2 font-bold text-titulo">
                        {i.titulo}
                        {i.ids.length > 1 && (
                          <span className="etiqueta etiqueta-primaria">{i.ids.length} dentes</span>
                        )}
                      </p>
                      {i.detalhe && <p className="text-sm text-suave">{i.detalhe}</p>}
                    </td>
                    <td className="px-4 py-2.5">{i.paciente ?? '—'}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="etiqueta etiqueta-perigo">
                        {new Date(i.excluidoEm).toLocaleString('pt-BR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </span>
                      {i.excluidoPor && <p className="mt-1 text-xs text-suave">por {i.excluidoPor}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button
                        className="botao-leve botao-pequeno"
                        disabled={restaurar.isPending}
                        onClick={() => restaurar.mutate(i)}
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
                      Nenhum registro excluído com esse filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="alerta-info">
        Nada é apagado de verdade: o que está aqui continua guardado e volta inteiro ao restaurar.
      </p>
    </div>
  )
}
