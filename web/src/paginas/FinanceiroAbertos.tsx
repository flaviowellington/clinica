// Financeiro > Orçamentos abertos: filtros numa barra (como na Agenda 2), a lista e o
// orçamento escolhido ao lado; quando o paciente paga, aprova ali mesmo e o valor já entra.
import { useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { api, consultaEu, consultaProfissionais, dataBR, isoLocal, mensagemDeErro } from '../api'
import { avisar } from '../estado'
import { pode } from '../../../shared/permissoes'
import { reais } from '../../../shared/financeiro'
import { normalizar } from '../../../shared/regras'
import { CampoData } from '../componentes/CampoData'
import { Icone } from '../componentes/Icones'
import { PeriodoSuspenso, ProfissionaisSuspenso, Suspenso, useIntervalo } from './FinanceiroAbas'
import { COR_PADRAO } from './Profissionais'

interface Aberto {
  id: number
  criadoEm: string
  observacoes: string | null
  paciente: { id: number; nome: string; celular: string | null }
  profissional: { id: number; nome: string; corAgenda: string | null }
  descontoCentavos: number
  totalCentavos: number
  custoCentavos: number
  itens: {
    nome: string
    dente: string | null
    valorCentavos: number
    custoCentavos: number
    especialidade: string | null
  }[]
}

/** Filtro por tempo em aberto (dias desde que o orçamento foi feito). */
const TEMPOS = {
  todos: { rotulo: 'Qualquer tempo', de: 0, ate: Infinity, cor: 'bg-borda' },
  novos: { rotulo: 'Até 7 dias', de: 0, ate: 7, cor: 'bg-primaria' },
  esfriando: { rotulo: '8 a 30 dias', de: 8, ate: 30, cor: 'bg-secundaria' },
  parados: { rotulo: 'Mais de 30 dias', de: 31, ate: Infinity, cor: 'bg-aviso' },
} as const
type Tempo = keyof typeof TEMPOS

/** Formas aceitas ao aprovar aqui (boleto, transferência e cheque ficam de fora). */
const FORMAS_APROVAR = ['Pix', 'Dinheiro', 'Cartão de crédito', 'Cartão de débito'] as const

const diasDesde = (iso: string) =>
  Math.round((Date.parse(isoLocal(new Date())) - Date.parse(iso)) / 86_400_000)
const idade = (dias: number) => (dias <= 0 ? 'hoje' : dias === 1 ? 'ontem' : `há ${dias} dias`)
const procedimento = (i: Aberto['itens'][number]) => (i.dente ? `${i.nome} · ${i.dente}` : i.nome)
export function OrcamentosAbertos() {
  const { data: eu } = useSuspenseQuery(consultaEu)
  const podeAprovar = pode(eu.perfis, 'orcamento.aprovar') && pode(eu.perfis, 'financeiro.receber')
  const p = useIntervalo(true) // orçamento aberto não tem prazo: começa vendo todos
  const { data: prof } = useSuspenseQuery(consultaProfissionais)
  // Como na Agenda: o profissional começa vendo só os orçamentos dele.
  const [ocultos, setOcultos] = useState<number[]>(() =>
    pode(eu.perfis, 'confirmacoes.todas') || !prof.meuId
      ? []
      : prof.profissionais.filter((x) => x.id !== prof.meuId).map((x) => x.id),
  )
  const [tempo, setTempo] = useState<Tempo>('todos')
  const [busca, setBusca] = useState('')
  const [escolhido, setEscolhido] = useState<number | null>(null)
  const painel = useRef<HTMLElement>(null)

  const periodo = p.tudo ? {} : p.intervalo
  const lista = useQuery({
    queryKey: ['abertos', periodo],
    queryFn: async () =>
      (await api.get<Aberto[]>('/financeiro/orcamentos-abertos', { params: periodo })).data,
  })
  const todos = useMemo(() => lista.data ?? [], [lista.data])
  const porProf = new Map<number, number>()
  for (const o of todos) porProf.set(o.profissional.id, (porProf.get(o.profissional.id) ?? 0) + 1)
  const faixa = TEMPOS[tempo]

  const termo = normalizar(busca.trim())
  const visiveis = todos
    .filter((o) => {
      const dias = diasDesde(o.criadoEm)
      return (
        !ocultos.includes(o.profissional.id) &&
        dias >= faixa.de &&
        dias <= faixa.ate &&
        (!termo ||
          normalizar(o.paciente.nome).includes(termo) ||
          String(o.id) === termo.replace(/\D/g, '') ||
          o.itens.some((i) => normalizar(i.nome).includes(termo) || i.dente === termo))
      )
    })
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm) || b.id - a.id)
  // Sem escolha (ou o escolhido saiu da lista), mostra o primeiro.
  const sel = visiveis.find((o) => o.id === escolhido) ?? visiveis[0]
  return (
    <div className="mx-auto max-w-[1320px] space-y-3">
      <header className="flex flex-wrap items-center gap-3.5">
        <h1 className="titulo">Orçamentos abertos</h1>
        <span aria-hidden="true" className="h-6 w-px bg-borda" />
        <span className="text-base text-suave">
          {lista.isPending
            ? 'Carregando…'
            : `${visiveis.length} ${visiveis.length === 1 ? 'orçamento' : 'orçamentos'}`}
        </span>
      </header>

      {/* ---------- Filtros (barra da Agenda 2) ---------- */}
      <div className="cartao flex flex-wrap items-center gap-2 py-2">
        <PeriodoSuspenso p={p} />
        <ProfissionaisSuspenso
          ocultos={ocultos}
          aoMudar={setOcultos}
          valor={(id) => porProf.get(id) ?? 0}
        />
        <Suspenso
          marcado={tempo !== 'todos'}
          painel="w-60 p-1.5"
          rotulo={`${faixa.rotulo} ▾`}
        >
          {(fechar) => (
            <ul>
              {(Object.keys(TEMPOS) as Tempo[]).map((t) => (
                <li key={t}>
                  <button
                    type="button"
                    aria-pressed={tempo === t}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left font-bold hover:bg-primaria-clara ${tempo === t ? 'bg-primaria-clara text-titulo' : ''}`}
                    onClick={() => {
                      setTempo(t)
                      fechar()
                    }}
                  >
                    <span aria-hidden className={`size-2.5 rounded-full ${TEMPOS[t].cor}`} />
                    {TEMPOS[t].rotulo}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Suspenso>
      </div>

      {lista.isError && <p className="alerta-perigo">{mensagemDeErro(lista.error)}</p>}

      <div className="flex flex-wrap items-start gap-4">
        {/* ---------- Lista ---------- */}
        <nav
          aria-label="Orçamentos"
          className={`cartao flex max-h-[calc(100vh-13rem)] min-w-0 flex-[1_1_22rem] flex-col p-0 ${lista.isFetching ? 'opacity-60' : ''}`}
        >
          <div className="flex items-center gap-2 border-b border-borda p-3">
            <label className="relative flex-1">
              <Icone
                nome="busca"
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-suave"
              />
              <span className="sr-only">Buscar orçamento</span>
              <input
                type="search"
                autoFocus
                className="campo py-1.5 pl-9"
                placeholder="Buscar paciente, procedimento ou nº"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </label>
          </div>
          <div className="flex flex-col gap-0.5 overflow-y-auto p-2">
            {visiveis.map((o) => {
              const dias = diasDesde(o.criadoEm)
              const ativo = o.id === sel?.id
              return (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => {
                    setEscolhido(o.id)
                    // No celular o painel fica embaixo: rola até ele.
                    painel.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
                  }}
                  className={`flex w-full gap-2.5 rounded-xl border-2 px-3 py-2.5 text-left ${
                    ativo
                      ? 'border-primaria bg-primaria-clara'
                      : 'border-transparent hover:bg-superficie-2'
                  }`}
                >
                  <span
                    aria-hidden
                    className="w-1 shrink-0 rounded-full"
                    style={{ backgroundColor: o.profissional.corAgenda ?? COR_PADRAO }}
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex justify-between gap-2 font-bold text-titulo">
                      <span className="truncate">{o.paciente.nome}</span>
                      <span className="tabular-nums">{reais(o.totalCentavos)}</span>
                    </span>
                    <span className="flex justify-between gap-2 text-sm text-suave">
                      <span className="truncate">{o.itens.map((i) => i.nome).join(', ')}</span>
                      <span
                        className={`shrink-0 font-bold ${dias > 30 ? 'text-aviso' : ''}`}
                        title="Desde que o orçamento foi feito"
                      >
                        {idade(dias)}
                      </span>
                    </span>
                  </span>
                </button>
              )
            })}
            {!visiveis.length && (
              <p className="flex flex-col items-center gap-2 py-10 text-center text-suave">
                <Icone nome="documento" className="h-8 w-8" />
                {lista.isPending
                  ? 'Carregando…'
                  : todos.length
                    ? 'Nenhum orçamento com esses filtros.'
                    : 'Nenhum orçamento em aberto neste período.'}
              </p>
            )}
          </div>
        </nav>

        {/* ---------- Orçamento escolhido ---------- */}
        {sel && (
          <section
            ref={painel}
            aria-label="Orçamento escolhido"
            className="cartao min-w-0 flex-[999_1_32rem] scroll-mt-4 overflow-hidden p-0"
            style={{ boxShadow: `inset 0 4px 0 ${sel.profissional.corAgenda ?? COR_PADRAO}` }}
          >
            <div className="flex flex-wrap justify-between gap-3 border-b border-borda px-5 py-4">
              <div className="min-w-0">
                <p className="text-sm text-suave">
                  Orçamento nº {sel.id} · feito em {dataBR(sel.criadoEm)} (
                  {idade(diasDesde(sel.criadoEm))})
                </p>
                <h2 className="text-xl font-extrabold text-titulo">{sel.paciente.nome}</h2>
                <p className="flex items-center gap-1.5 text-suave">
                  <span
                    aria-hidden
                    className="size-2.5 rounded-full"
                    style={{ background: sel.profissional.corAgenda ?? COR_PADRAO }}
                  />
                  com {sel.profissional.nome}
                </p>
              </div>
              <Link
                to="/pacientes/$id"
                params={{ id: String(sel.paciente.id) }}
                search={{ aba: 'orcamentos' }}
                className="botao-leve self-start"
              >
                <Icone nome="documento" className="h-4 w-4" />
                Abrir ficha
              </Link>
            </div>

            <div className="flex flex-wrap gap-5 p-5">
              <div className="min-w-0 flex-[1_1_16rem]">
                <h3 className="mb-2 text-sm font-extrabold tracking-wide text-suave uppercase">
                  Procedimentos
                </h3>
                <ul>
                  {sel.itens.map((i, n) => (
                    <li
                      key={n}
                      className="flex justify-between gap-3 border-b border-borda py-2"
                      title={i.especialidade ?? undefined}
                    >
                      <span>{procedimento(i)}</span>
                      <span className="tabular-nums">{reais(i.valorCentavos)}</span>
                    </li>
                  ))}
                  {sel.descontoCentavos > 0 && (
                    <li className="flex justify-between gap-3 border-b border-borda py-2 text-suave">
                      <span>Desconto</span>
                      <span className="tabular-nums">− {reais(sel.descontoCentavos)}</span>
                    </li>
                  )}
                </ul>
                <p className="mt-2 flex items-baseline justify-between">
                  <strong>Total</strong>
                  <span className="text-2xl font-extrabold text-titulo tabular-nums">
                    {reais(sel.totalCentavos)}
                  </span>
                </p>
                <p className="flex justify-between text-sm text-suave">
                  <span>Lucro estimado</span>
                  <strong className="text-sucesso tabular-nums">
                    {reais(sel.totalCentavos - sel.custoCentavos)}
                  </strong>
                </p>
                {sel.observacoes && (
                  <p className="mt-3 rounded-xl bg-superficie-2 px-3 py-2 text-sm">
                    {sel.observacoes}
                  </p>
                )}
              </div>
              {podeAprovar && <Aprovar key={sel.id} orcamento={sel} />}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function Aprovar({ orcamento: o }: { orcamento: Aberto }) {
  const qc = useQueryClient()
  const [forma, setForma] = useState<string>('Pix')
  const aprovar = useMutation({
    mutationFn: async (pagamento: Record<string, unknown>) =>
      (await api.post(`/orcamentos/${o.id}/aprovar`, { pagamento })).data,
    onSuccess: () => {
      avisar('Orçamento aprovado e pagamento registrado')
      for (const k of ['abertos', 'analise', 'orcamentos'])
        qc.invalidateQueries({ queryKey: [k] })
    },
    onError: (e) => {
      avisar(mensagemDeErro(e), true)
      qc.invalidateQueries({ queryKey: ['abertos'] })
    },
  })
  return (
    <form
      className="flex min-w-0 flex-[1_1_16rem] flex-col gap-3.5 self-start rounded-2xl bg-superficie-2 p-4"
      onSubmit={(e) => {
        e.preventDefault()
        aprovar.mutate(Object.fromEntries(new FormData(e.currentTarget)))
      }}
    >
      <h3 className="text-base font-extrabold text-titulo">Paciente pagou? Aprove aqui</h3>
      <label>
        <span className="rotulo">Data do pagamento</span>
        <CampoData name="data" defaultValue={isoLocal(new Date())} required />
      </label>
      <fieldset>
        <legend className="rotulo">Forma de pagamento</legend>
        <input type="hidden" name="forma" value={forma} />
        <div className="grid grid-cols-2 gap-1.5">
          {FORMAS_APROVAR.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={forma === f}
              // Clicar de novo na escolhida tira a forma ("não informar").
              onClick={() => setForma(forma === f ? '' : f)}
              className={`rounded-lg border-2 px-3 py-1.5 text-sm font-bold ${
                forma === f
                  ? 'border-primaria bg-primaria text-sobre-primaria'
                  : 'border-borda bg-superficie hover:border-primaria/50'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        {!forma && <span className="ajuda">Sem forma informada.</span>}
      </fieldset>
      <button className="botao" disabled={aprovar.isPending}>
        Confirmar pagamento e aprovar
      </button>
      <p className="text-xs text-suave">
        O orçamento vira tratamento e {reais(o.totalCentavos)} entram no caixa.
      </p>
    </form>
  )
}
