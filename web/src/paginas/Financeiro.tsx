import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { consultaEu, consultaProfissionais, mensagemDeErro } from '../api'
import { pode, type Acao } from '../../../shared/permissoes'
import { reais } from '../../../shared/financeiro'
import { normalizar } from '../../../shared/regras'
import { Abas } from '../componentes/Abas'
import { Icone } from '../componentes/Icones'
import {
  PeriodoSuspenso,
  ProfissionaisSuspenso,
  consultaAnalise,
  faturamentoPorProfissional,
  periodoAnterior,
  useIntervalo,
  type Analise,
} from './FinanceiroAbas'
import { Graficos } from './FinanceiroGraficos'
import { OrcamentosAbertos } from './FinanceiroAbertos'
import { COR_PADRAO } from './Profissionais'
import { MESES, meio } from '../componentes/CalendarioIntervalo'

// Recepção e profissional só veem os orçamentos abertos; o resto é do financeiro.
export const ABAS = [
  { id: 'abertos', rotulo: 'Orçamentos abertos', acao: 'orcamento.ver' },
  { id: 'controle', rotulo: 'Controle Financeiro', acao: 'financeiro.ver' },
  { id: 'graficos', rotulo: 'Gráficos', acao: 'financeiro.ver' },
  // Gráficos 2 (a versão antiga, livre: adicionar, favoritar, remover): desligada.
  // Para voltar, descomente esta linha e a da renderização abaixo.
  // { id: 'graficos2', rotulo: 'Gráficos 2', acao: 'financeiro.ver' },
] as const satisfies readonly { id: string; rotulo: string; acao: Acao }[]
type Aba = (typeof ABAS)[number]['id']

/** Financeiro da clínica (S-009). */
export function Financeiro() {
  const { aba: daUrl } = useSearch({ from: '/logado/financeiro' })
  const navegar = useNavigate({ from: '/financeiro' })
  const { data: eu } = useSuspenseQuery(consultaEu)
  const abas = ABAS.filter((a) => pode(eu.perfis, a.acao))
  const aba = (abas.find((a) => a.id === daUrl)?.id ?? 'abertos') as Aba
  const ir = (a: Aba) => navegar({ search: { aba: a === 'abertos' ? undefined : a } })

  return (
    <div className="space-y-5">
      <div className="print:hidden">
        {abas.length > 1 && <Abas abas={abas} atual={aba} aoTrocar={ir} />}
      </div>
      {aba === 'abertos' && <OrcamentosAbertos />}
      {aba === 'controle' && <ControleFinanceiro />}
      {aba === 'graficos' && <Graficos fixo />}
      {/* {aba === 'graficos2' && <Graficos />} */}
    </div>
  )
}

// ── Indicadores ─────────────────────────────────────────────────────────────
type Orc = Analise['orcamentos'][number]

/** Orçamento só é aprovado já pago (parcelado, quem financia é o banco): aprovado = faturado. */
function totais(os: Orc[]) {
  return {
    qtd: os.length,
    faturamento: os.reduce((s, o) => s + o.totalCentavos, 0),
    procedimentos: os.reduce((s, o) => s + o.itens.length, 0),
  }
}

/** Variação contra o período anterior: seta + número, não só cor. */
function Variacao({ atual, antes }: { atual: number; antes: number | undefined }) {
  if (antes === undefined) return null
  if (!antes) return <span className="text-xs text-suave">sem movimento no período anterior</span>
  const v = Math.round(((atual - antes) / Math.abs(antes)) * 100)
  return (
    <span className="flex items-center gap-1.5 text-xs text-suave">
      <span
        className={`etiqueta ${v > 0 ? 'etiqueta-sucesso' : v < 0 ? 'etiqueta-perigo' : ''}`}
        title={`Período anterior: ${reais(antes)}`}
      >
        <span aria-hidden="true">{v > 0 ? '▲' : v < 0 ? '▼' : '='}</span>
        <span className="sr-only">{v > 0 ? 'subiu' : v < 0 ? 'caiu' : 'igual'}</span>
        {Math.abs(v)}%
      </span>
      vs. período anterior
    </span>
  )
}

function Indicador(props: { rotulo: string; valor: string; cor?: string; children?: ReactNode }) {
  return (
    <div className="cartao flex h-full flex-col gap-2.5">
      <p className="text-xs font-extrabold tracking-wide text-suave uppercase">{props.rotulo}</p>
      <p
        className={`text-[1.65rem] leading-none font-extrabold whitespace-nowrap tabular-nums ${props.cor ?? 'text-titulo'}`}
      >
        {props.valor}
      </p>
      <div className="mt-auto">{props.children}</div>
    </div>
  )
}

/** "Segunda, 02 nov" ou "Hoje, quarta, 04 nov". */
const diaDaSemana = (iso: string, hoje: string) => {
  const t = meio(iso).toLocaleDateString('pt-BR', { weekday: 'long' }).replace('-feira', '')
  const s = `${t}, ${iso.slice(8)} ${MESES[Number(iso.slice(5, 7)) - 1]}`
  return iso === hoje ? `Hoje, ${s}` : s.charAt(0).toUpperCase() + s.slice(1)
}

function LinkPaciente({ o }: { o: Orc }) {
  return (
    <Link
      to="/pacientes/$id"
      params={{ id: String(o.paciente.id) }}
      search={{ aba: 'orcamentos' }}
      className="font-extrabold text-primaria hover:underline"
    >
      {o.paciente.nome}
    </Link>
  )
}

// ── Página ──────────────────────────────────────────────────────────────────
function ControleFinanceiro() {
  const p = useIntervalo()
  const { intervalo, tudo, hoje, consulta } = p
  const [ocultos, setOcultos] = useState<number[]>([])
  const [busca, setBusca] = useState('')

  // O filtro de profissional é feito aqui, para marcar vários de uma vez (como na Agenda).
  const atual = useQuery(consultaAnalise({ ...consulta, profissionalId: '' }))
  const antes = useQuery({
    ...consultaAnalise({ ...periodoAnterior(intervalo.de, intervalo.ate), profissionalId: '' }),
    enabled: !tudo,
  })
  const profs = useQuery(consultaProfissionais)

  const visivel = (p: { id: number }) => !ocultos.includes(p.id)
  const filtrar = (a: Analise) => a.orcamentos.filter((o) => visivel(o.profissional))
  const agora = filtrar(atual.data ?? { orcamentos: [], entradas: [] })
  const t = totais(agora)
  const porProf = faturamentoPorProfissional(atual.data)
  const anterior = !tudo && antes.data ? filtrar(antes.data) : null
  const ta = anterior ? totais(anterior) : undefined

  const corDe = (id: number) =>
    profs.data?.profissionais.find((p) => p.id === id)?.corAgenda ?? COR_PADRAO
  const termo = normalizar(busca.trim())
  const lista = agora.filter(
    (o) =>
      !termo ||
      normalizar(o.paciente.nome).includes(termo) ||
      String(o.id) === termo.replace(/\D/g, '') ||
      o.itens.some((i) => normalizar(i.nome).includes(termo)),
  )
  // A API devolve do mais novo para o mais antigo; agrupa por dia de aprovação.
  const grupos: { dia: string; os: Orc[] }[] = []
  for (const o of lista) {
    const g = grupos.at(-1)
    if (g?.dia === o.aprovadoEm) g.os.push(o)
    else grupos.push({ dia: o.aprovadoEm, os: [o] })
  }
  const soma = (os: Orc[], f: (o: Orc) => number) => os.reduce((s, o) => s + f(o), 0)
  const carregando = atual.isFetching ? 'opacity-60' : ''

  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-4 lg:h-[calc(100dvh-6.5rem)] print:h-auto">
      <header className="shrink-0 space-y-4">
        <div>
          <h1 className="titulo">Controle Financeiro</h1>
          <p className="subtitulo">
            Orçamentos aprovados (já pagos) no período: o faturamento da clínica.
          </p>
        </div>
        {/* Filtros (modelo de Orçamentos abertos): ficam fixos, só o conteúdo rola. */}
        <div className="cartao flex flex-wrap items-center gap-2 py-2">
          <PeriodoSuspenso p={p} />
          <ProfissionaisSuspenso
            ocultos={ocultos}
            aoMudar={setOcultos}
            valor={(id) => reais(porProf.get(id) ?? 0)}
          />
        </div>
      </header>

      <div className="relative min-h-0 flex-1 space-y-4 lg:-mr-2 lg:overflow-y-auto lg:pr-2 print:overflow-visible">
        <div className="min-w-0 space-y-4">
          {atual.isError && <p className="alerta-perigo">{mensagemDeErro(atual.error)}</p>}

          <section aria-label="Indicadores" className={`grid gap-3 sm:grid-cols-2 ${carregando}`}>
            <Indicador rotulo="Faturamento" valor={reais(t.faturamento)} cor="text-sucesso">
              <Variacao atual={t.faturamento} antes={ta?.faturamento} />
            </Indicador>
            <Indicador rotulo="Aprovados" valor={String(t.qtd)}>
              <p className="text-xs text-suave">
                Ticket médio{' '}
                <strong className="text-texto">
                  {reais(t.qtd ? Math.round(t.faturamento / t.qtd) : 0)}
                </strong>{' '}
                · {t.procedimentos} {t.procedimentos === 1 ? 'procedimento' : 'procedimentos'}
              </p>
            </Indicador>
          </section>

          <section className="cartao overflow-hidden p-0" aria-labelledby="titulo-lista">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-borda px-4 py-3">
              <h2 id="titulo-lista" className="flex items-center gap-2 text-base">
                Orçamentos aprovados
                <span className="etiqueta etiqueta-primaria">{lista.length}</span>
              </h2>
              <label className="relative w-full sm:w-80">
                <Icone
                  nome="busca"
                  className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-suave"
                />
                <span className="sr-only">Buscar orçamento</span>
                <input
                  type="search"
                  className="campo py-1.5 pl-9"
                  placeholder="Paciente, procedimento ou nº"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </label>
            </header>

            {/* Computador: tabela agrupada por dia. */}
            <div className={`hidden overflow-x-auto md:block ${carregando}`}>
              <table className="w-full min-w-[40rem] text-left">
                <thead>
                  <tr className="bg-superficie-2 text-xs tracking-wide text-suave uppercase">
                    {['Paciente', 'Procedimentos', 'Faturamento'].map((c, i) => (
                      <th
                        key={c}
                        scope="col"
                        className={`px-4 py-2.5 font-extrabold ${i >= 2 ? 'text-right' : ''}`}
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                {grupos.map((g) => (
                  <tbody key={g.dia}>
                    <tr>
                      <th
                        scope="rowgroup"
                        colSpan={3}
                        className="border-t border-borda px-4 pt-3.5 pb-1.5 text-left text-sm"
                      >
                        <span className="font-extrabold text-titulo">
                          {diaDaSemana(g.dia, hoje)}
                        </span>
                        <span className="font-semibold text-suave">
                          {' '}
                          · {g.os.length} {g.os.length === 1 ? 'orçamento' : 'orçamentos'} ·{' '}
                          {reais(soma(g.os, (o) => o.totalCentavos))}
                        </span>
                      </th>
                    </tr>
                    {g.os.map((o) => (
                      <tr key={o.id} className="hover:bg-primaria-clara">
                        <td className="px-4 py-2.5 align-top">
                          <span className="flex gap-2.5">
                            <span
                              aria-hidden="true"
                              className="w-1 shrink-0 self-stretch rounded"
                              style={{ background: corDe(o.profissional.id) }}
                            />
                            <span>
                              <LinkPaciente o={o} />
                              <span className="block text-xs text-suave">
                                {o.profissional.nome} · nº {o.id}
                              </span>
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-2.5 align-top">
                          <span className="flex flex-wrap gap-1">
                            {o.itens.map((i, k) => (
                              <span
                                key={k}
                                className="rounded-lg bg-superficie-2 px-2 py-0.5 text-sm"
                              >
                                {i.nome}
                              </span>
                            ))}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right align-top font-extrabold whitespace-nowrap tabular-nums">
                          {reais(o.totalCentavos)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                ))}
                {lista.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-borda bg-superficie-2 font-extrabold">
                      <td colSpan={2} className="px-4 py-3 text-suave">
                        Total do período
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                        {reais(soma(lista, (o) => o.totalCentavos))}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Celular: cartões agrupados por dia. */}
            {lista.length > 0 && (
              <div className={`space-y-4 p-3 md:hidden ${carregando}`}>
                {grupos.map((g) => (
                  <section key={g.dia} className="space-y-2">
                    <h3 className="flex justify-between text-sm">
                      <span className="font-extrabold text-titulo">{diaDaSemana(g.dia, hoje)}</span>
                      <span className="font-bold text-suave">
                        {reais(soma(g.os, (o) => o.totalCentavos))}
                      </span>
                    </h3>
                    {g.os.map((o) => (
                      <div
                        key={o.id}
                        className="flex gap-2.5 rounded-2xl border border-borda bg-superficie p-3"
                      >
                        <span
                          aria-hidden="true"
                          className="w-1 shrink-0 rounded"
                          style={{ background: corDe(o.profissional.id) }}
                        />
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex justify-between gap-2">
                            <LinkPaciente o={o} />
                            <strong className="whitespace-nowrap tabular-nums">
                              {reais(o.totalCentavos)}
                            </strong>
                          </div>
                          <p className="truncate text-sm text-suave">
                            {o.itens.map((i) => i.nome).join(', ')}
                          </p>
                          <p className="text-xs text-suave">{o.profissional.nome}</p>
                        </div>
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            )}

            {!lista.length && (
              <p className="px-4 py-12 text-center text-suave">
                {atual.isPending
                  ? 'Carregando…'
                  : busca
                    ? 'Nada encontrado com essa busca.'
                    : 'Nenhum orçamento aprovado neste período.'}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
