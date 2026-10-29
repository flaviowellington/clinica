import { useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { keepPreviousData, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { api, consultaEu, isoLocal, mensagemDeErro } from '../api'
import { pode } from '../../../shared/permissoes'
import { GRUPOS, acharRelatorio } from '../../../shared/relatorios'
import { Icone } from '../componentes/Icones'
import { CampoData } from '../componentes/CampoData'

interface Resultado {
  titulo: string
  grupo: string
  colunas: string[]
  linhas: (string | number)[][]
}

/** Baixa a tabela como CSV (abre no Excel), sem biblioteca. */
function baixarCsv(r: Resultado) {
  const celula = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const csv = [r.colunas, ...r.linhas].map((l) => l.map(celula).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: `${r.titulo}.csv` })
  a.click()
  URL.revokeObjectURL(url)
}

export function Relatorios() {
  const { data: eu } = useSuspenseQuery(consultaEu)
  const { id } = useSearch({ from: '/logado/relatorios' })
  const navegar = useNavigate({ from: '/relatorios' })
  const qc = useQueryClient()
  const grupos = GRUPOS.filter((g) => pode(eu.perfis, g.permissao))
  const atual = id ? acharRelatorio(id) : null
  const permitido = atual && pode(eu.perfis, atual.permissao)

  const hoje = new Date()
  const [rascunho, setRascunho] = useState({
    de: isoLocal(new Date(hoje.getFullYear(), hoje.getMonth(), 1)),
    ate: isoLocal(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)),
  })
  const [periodo, setPeriodo] = useState(rascunho)

  const r = useQuery({
    queryKey: ['relatorio', id, periodo],
    queryFn: async () => (await api.get<Resultado>(`/relatorios/${id}`, { params: periodo })).data,
    enabled: !!permitido && atual!.pronto,
    // Ao trocar de relatório, o quadro mantém o anterior até o novo chegar (sem piscar).
    placeholderData: keepPreviousData,
  })

  return (
    // Menu e quadro rolam cada um por conta própria; a página não sobe ao trocar de relatório.
    <div className="flex flex-col gap-4 lg:h-[calc(100vh-2rem)] lg:flex-row">
      <nav
        className="cartao max-h-72 shrink-0 space-y-4 overflow-y-auto lg:max-h-none lg:w-64"
        aria-label="Relatórios"
      >
        <p className="flex items-center gap-2 font-semibold">
          <Icone nome="relatorios" /> Relatórios
        </p>
        {grupos.map((g) => (
          <div key={g.titulo}>
            <p className="mb-1 font-medium">{g.titulo}</p>
            <ul className="space-y-0.5 border-l border-borda pl-3">
              {g.itens.map((i) => (
                <li key={i.id}>
                  <button
                    disabled={!i.pronto}
                    onClick={() => navegar({ search: { id: i.id }, resetScroll: false })}
                    aria-current={id === i.id}
                    className={`w-full rounded px-2 py-1 text-left hover:bg-primaria-clara disabled:cursor-not-allowed disabled:text-suave disabled:hover:bg-transparent ${id === i.id ? 'bg-primaria-clara text-primaria' : ''}`}
                  >
                    {i.titulo}
                    {!i.pronto && ' (em breve)'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <section className="cartao min-w-0 flex-1 space-y-4 overflow-y-auto">
        {!permitido ? (
          <div className="flex flex-col items-center gap-2 py-20 text-center">
            <span className="rounded-full bg-primaria-clara p-4 text-primaria">
              <Icone nome="relatorios" className="h-8 w-8" />
            </span>
            <p className="text-base font-semibold">Aqui ficam os relatórios da clínica.</p>
            <p className="text-suave">Escolha um relatório ao lado.</p>
          </div>
        ) : (
          <>
            <header className="flex flex-wrap items-end gap-3">
              <div className="mr-auto">
                <p className="text-suave">{atual.grupo}</p>
                <h1 className="text-xl font-semibold">{atual.titulo}</h1>
              </div>
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  setPeriodo(rascunho)
                  // Listar sempre busca de novo, mesmo sem mudar o período.
                  qc.invalidateQueries({ queryKey: ['relatorio', id] })
                }}
              >
                <label>
                  <span className="rotulo">De</span>
                  <CampoData
                    value={rascunho.de}
                    onChange={(v) => setRascunho({ ...rascunho, de: v })}
                    required
                  />
                </label>
                <label>
                  <span className="rotulo">Até</span>
                  <CampoData
                    value={rascunho.ate}
                    onChange={(v) => setRascunho({ ...rascunho, ate: v })}
                    required
                  />
                </label>
                <button className="botao">Listar</button>
                <button
                  type="button"
                  className="botao-leve"
                  disabled={!r.data?.linhas.length}
                  onClick={() => r.data && baixarCsv(r.data)}
                >
                  Baixar planilha
                </button>
              </form>
            </header>
            {r.isError && <p className="text-perigo">{mensagemDeErro(r.error)}</p>}
            {r.isPending && <p className="text-suave">Carregando…</p>}
            {r.isPlaceholderData && <p className="text-suave">Atualizando…</p>}
            {r.data && (
              <div
                className={`overflow-x-auto ${r.isPlaceholderData ? 'opacity-40' : ''}`}
              >
                <table className="w-full text-left">
                  <thead className="border-b border-borda text-suave">
                    <tr>
                      {r.data.colunas.map((c) => (
                        <th key={c} className="px-3 py-2 font-medium">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {r.data.linhas.map((l, i) => (
                      <tr key={i} className="border-b border-borda last:border-0">
                        {l.map((v, j) => (
                          <td key={j} className="px-3 py-2">
                            {v}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-suave">
                  {r.data.linhas.length
                    ? `${r.data.linhas.length} linhas`
                    : 'Nada no período escolhido.'}
                </p>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
