import { useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { keepPreviousData, useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { api, consultaConfig, consultaEu, consultaProfissionais, mensagemDeErro } from '../api'
import { STATUS } from '../../../shared/agenda'
import { pode } from '../../../shared/permissoes'
import { normalizar } from '../../../shared/regras'
import { GRUPOS, acharRelatorio, type Filtro } from '../../../shared/relatorios'
import { Icone, type NomeIcone } from '../componentes/Icones'
import { PeriodoSuspenso, ProfissionaisSuspenso, Suspenso, useIntervalo } from './FinanceiroAbas'

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

const ICONE_GRUPO: Record<string, NomeIcone> = {
  Agendamentos: 'agenda',
  Pacientes: 'pacientes',
  Financeiro: 'financeiro',
  Geral: 'painel',
  Tratamentos: 'dente',
}

/** Escolha de um valor numa janela suspensa (modelo dos filtros do Financeiro). */
function OpcaoSuspensa(props: {
  rotulo: string
  valor: string
  opcoes: { valor: string; rotulo: string }[]
  aoMudar: (v: string) => void
}) {
  const escolhida = props.opcoes.find((o) => o.valor === props.valor)
  return (
    <Suspenso
      marcado={!!props.valor}
      painel="w-60 space-y-0.5 p-1.5"
      rotulo={
        <>
          {props.rotulo}
          <span className="text-suave">{escolhida?.rotulo ?? 'todos'}</span>▾
        </>
      }
    >
      {(fechar) =>
        [{ valor: '', rotulo: 'Todos' }, ...props.opcoes].map((o) => (
          <button
            key={o.valor}
            type="button"
            aria-pressed={o.valor === props.valor}
            onClick={() => {
              props.aoMudar(o.valor)
              fechar()
            }}
            className={`block w-full rounded-lg px-2.5 py-1.5 text-left hover:bg-primaria-clara ${o.valor === props.valor ? 'bg-primaria-clara font-bold text-primaria' : ''}`}
          >
            {o.rotulo}
          </button>
        ))
      }
    </Suspenso>
  )
}

const STATUS_OPCOES = Object.entries(STATUS).map(([valor, s]) => ({ valor, rotulo: s.rotulo }))

/** Colunas de contato ou texto livre: ordenar por elas não ajuda ninguém. */
const NAO_ORDENA = ['Celular', 'E-mail', 'Motivo', 'A realizar', 'Referente a']

/** "1.234,56" → 1234.56; "12%" → 12. */
const numero = (v: string | number) =>
  typeof v === 'number' ? v : Number(v.replace(/[.%]/g, '').replace(',', '.'))
/** "05/11/2026" → "20261105" e "05/11" → "1105" (ordenam como texto); outra coisa volta igual. */
const dataOrdenavel = (v: string) =>
  v.replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, '$3$2$1').replace(/^(\d{2})\/(\d{2})$/, '$2$1')

function comparar(a: string | number, b: string | number, numerica: boolean) {
  if (numerica) return numero(a) - numero(b)
  return dataOrdenavel(String(a)).localeCompare(dataOrdenavel(String(b)), 'pt-BR', {
    numeric: true,
    sensitivity: 'base',
  })
}

/** Coluna de números (contagem, "1.234,56", "12%"): alinha à direita. */
const ehNumero = (v: string | number) => typeof v === 'number' || /^-?[\d.,]+%?$/.test(v)

export function Relatorios() {
  const { data: eu } = useSuspenseQuery(consultaEu)
  const { id } = useSearch({ from: '/logado/relatorios' })
  const navegar = useNavigate({ from: '/relatorios' })
  const grupos = GRUPOS.filter((g) => pode(eu.perfis, g.permissao))
  const atual = id ? acharRelatorio(id) : null
  const permitido = atual && pode(eu.perfis, atual.permissao)
  const p = useIntervalo()
  const [busca, setBusca] = useState('')
  const [ocultos, setOcultos] = useState<number[]>([])
  const [status, setStatus] = useState('')
  const [categoria, setCategoria] = useState('')
  const [ordem, setOrdem] = useState<{ id?: string; col: number; desc: boolean } | null>(null)
  const usa = (f: Filtro) => !!atual?.filtros?.includes(f)
  const profs = useQuery({ ...consultaProfissionais, enabled: usa('profissional') })
  const categorias = useQuery({ ...consultaConfig('categorias'), enabled: usa('categoria') })

  // Só vai para a API o filtro que este relatório aceita; vazio = todos.
  const visiveis = (profs.data?.profissionais ?? []).filter((x) => !ocultos.includes(x.id))
  const params = {
    ...(!atual?.semPeriodo && p.consulta),
    profissionais:
      usa('profissional') && ocultos.length
        ? visiveis.map((x) => x.id).join(',') || '0'
        : undefined,
    status: (usa('status') && status) || undefined,
    categoria: (usa('categoria') && categoria) || undefined,
  }

  const r = useQuery({
    queryKey: ['relatorio', id, params],
    queryFn: async () => (await api.get<Resultado>(`/relatorios/${id}`, { params })).data,
    enabled: !!permitido && atual!.pronto,
    // Ao trocar de relatório ou período, o quadro mantém o anterior até o novo chegar.
    placeholderData: keepPreviousData,
  })

  const termo = normalizar(busca.trim())
  const filtradas = (r.data?.linhas ?? []).filter(
    (l) => !termo || l.some((v) => normalizar(String(v)).includes(termo)),
  )
  const numerica = (r.data?.colunas ?? []).map(
    (_, j) =>
      !!r.data?.linhas.some((l) => l[j] !== '') &&
      r.data.linhas.every((l) => l[j] === '' || ehNumero(l[j])),
  )
  // Ordem vale só para o relatório em que foi escolhida; sem escolha, fica a do servidor.
  const ord = ordem?.id === id ? ordem : null
  const linhas = ord
    ? [...filtradas].sort((a, b) => {
        const [x, y] = [a[ord.col], b[ord.col]]
        if (x === '' || y === '') return x === y ? 0 : x === '' ? 1 : -1 // vazio sempre no fim
        const c = comparar(x, y, numerica[ord.col])
        return ord.desc ? -c : c
      })
    : filtradas
  /** Clique no cabeçalho: crescente → decrescente → ordem original. */
  const ordenar = (col: number) =>
    setOrdem(
      ord?.col !== col ? { id, col, desc: false } : !ord.desc ? { id, col, desc: true } : null,
    )
  const ordenavel = (c: string) => !atual?.semOrdenar && !NAO_ORDENA.includes(c)
  const carregando = r.isFetching ? 'opacity-60' : ''

  return (
    // Menu e quadro rolam cada um por conta própria; a página não sobe ao trocar de relatório.
    <div className="flex flex-col gap-4 lg:h-[calc(100vh-2rem)] lg:flex-row">
      <nav
        className="cartao max-h-72 shrink-0 space-y-4 overflow-y-auto lg:max-h-none lg:w-64"
        aria-label="Relatórios"
      >
        <p className="flex items-center gap-2 text-base font-extrabold text-titulo">
          <span className="grid size-8 place-items-center rounded-lg bg-primaria-clara text-primaria">
            <Icone nome="relatorios" className="h-4 w-4" />
          </span>
          Relatórios
        </p>
        {grupos.map((g) => (
          <div key={g.titulo} role="group" aria-labelledby={`grupo-${g.titulo}`}>
            {/* Cabeçalho do grupo; os relatórios ficam pendurados na linha-guia abaixo dele. */}
            <p
              id={`grupo-${g.titulo}`}
              className={`flex items-center gap-2 rounded-xl px-1.5 py-1.5 font-extrabold ${atual?.grupo === g.titulo ? 'text-primaria' : 'text-titulo'}`}
            >
              <span
                className={`grid size-7 shrink-0 place-items-center rounded-lg ${atual?.grupo === g.titulo ? 'bg-primaria text-sobre-primaria' : 'bg-superficie-2 text-suave'}`}
              >
                <Icone nome={ICONE_GRUPO[g.titulo] ?? 'relatorios'} className="h-4 w-4" />
              </span>
              <span className="flex-1">{g.titulo}</span>
              <span className="text-xs font-bold text-suave tabular-nums">{g.itens.length}</span>
            </p>
            <ul className="mt-0.5 ml-[1.35rem] space-y-0.5 border-l-2 border-borda pl-2">
              {g.itens.map((i) => (
                <li key={i.id} className="relative">
                  <button
                    disabled={!i.pronto}
                    onClick={() => navegar({ search: { id: i.id }, resetScroll: false })}
                    aria-current={id === i.id}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-primaria-clara disabled:cursor-not-allowed disabled:text-suave disabled:hover:bg-transparent ${id === i.id ? "bg-primaria-clara font-bold text-primaria before:absolute before:inset-y-1 before:-left-[10px] before:w-0.5 before:rounded-full before:bg-primaria before:content-['']" : ''}`}
                  >
                    {i.titulo}
                    {!i.pronto && <span className="etiqueta shrink-0 text-[10px]">em breve</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <section className="min-w-0 flex-1 space-y-4 overflow-y-auto">
        {!permitido ? (
          <div className="cartao flex flex-col items-center gap-2 py-20 text-center">
            <span className="rounded-full bg-primaria-clara p-4 text-primaria">
              <Icone nome="relatorios" className="h-8 w-8" />
            </span>
            <p className="text-base font-semibold">Aqui ficam os relatórios da clínica.</p>
            <p className="text-suave">Escolha um relatório ao lado.</p>
          </div>
        ) : (
          <>
            <header>
              <p className="text-xs font-extrabold tracking-wide text-suave uppercase">
                {atual.grupo}
              </p>
              <h1 className="titulo">{atual.titulo}</h1>
            </header>

            {/* Filtros (modelo do Financeiro). */}
            <div className="cartao flex flex-wrap items-center gap-2 py-2">
              {atual.semPeriodo ? (
                <span className="flex items-center gap-2 px-1 text-suave">
                  <Icone nome="agenda" className="h-4 w-4" />
                  Situação de hoje (não usa período)
                </span>
              ) : (
                <PeriodoSuspenso p={p} />
              )}
              {usa('profissional') && (
                <ProfissionaisSuspenso ocultos={ocultos} aoMudar={setOcultos} valor={() => null} />
              )}
              {usa('status') && (
                <OpcaoSuspensa
                  rotulo="Status"
                  valor={status}
                  opcoes={STATUS_OPCOES}
                  aoMudar={setStatus}
                />
              )}
              {usa('categoria') && (
                <OpcaoSuspensa
                  rotulo="Categoria"
                  valor={categoria}
                  opcoes={Object.keys(categorias.data ?? {}).map((c) => ({ valor: c, rotulo: c }))}
                  aoMudar={setCategoria}
                />
              )}
              <button
                type="button"
                className="botao-leve ml-auto py-1.5"
                disabled={!r.data?.linhas.length}
                onClick={() => r.data && baixarCsv(r.data)}
              >
                <Icone nome="baixar" className="h-4 w-4" />
                Baixar planilha
              </button>
            </div>

            {r.isError && <p className="alerta-perigo">{mensagemDeErro(r.error)}</p>}

            <section className="cartao overflow-hidden p-0" aria-labelledby="titulo-tabela">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-borda px-4 py-3">
                <h2 id="titulo-tabela" className="flex items-center gap-2 text-base">
                  Resultado
                  <span className="etiqueta etiqueta-primaria">{linhas.length}</span>
                </h2>
                <label className="relative w-full sm:w-80">
                  <Icone
                    nome="busca"
                    className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-suave"
                  />
                  <span className="sr-only">Buscar na tabela</span>
                  <input
                    type="search"
                    className="campo py-1.5 pl-9"
                    placeholder="Buscar na tabela"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                  />
                </label>
              </header>

              {linhas.length > 0 && r.data && (
                <div className={`overflow-x-auto ${carregando}`}>
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-superficie-2 text-xs tracking-wide text-suave uppercase">
                        {r.data.colunas.map((c, j) => (
                          <th
                            key={c}
                            scope="col"
                            aria-sort={
                              ord?.col === j ? (ord.desc ? 'descending' : 'ascending') : undefined
                            }
                            className={`px-4 py-2.5 font-extrabold whitespace-nowrap ${numerica[j] ? 'text-right' : ''}`}
                          >
                            {ordenavel(c) ? (
                              <button
                                type="button"
                                onClick={() => ordenar(j)}
                                title={`Ordenar por ${c}`}
                                className={`inline-flex items-center gap-1 uppercase hover:text-titulo ${ord?.col === j ? 'text-primaria' : ''}`}
                              >
                                {c}
                                <span aria-hidden className={ord?.col === j ? '' : 'opacity-40'}>
                                  {ord?.col === j ? (ord.desc ? '▼' : '▲') : '↕'}
                                </span>
                              </button>
                            ) : (
                              c
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {linhas.map((l, i) => (
                        <tr
                          key={i}
                          className="border-t border-borda even:bg-superficie-2/40 hover:bg-primaria-clara"
                        >
                          {l.map((v, j) => (
                            <td
                              key={j}
                              className={`px-4 py-2.5 ${numerica[j] ? 'text-right whitespace-nowrap tabular-nums' : ''} ${j === 0 ? 'font-bold text-titulo' : ''}`}
                            >
                              {v === '' ? <span className="text-suave">—</span> : v}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {!linhas.length && (
                <p className="px-4 py-12 text-center text-suave">
                  {r.isPending
                    ? 'Carregando…'
                    : busca
                      ? 'Nada encontrado com essa busca.'
                      : 'Nada no período escolhido.'}
                </p>
              )}
            </section>
          </>
        )}
      </section>
    </div>
  )
}
