// Financeiro > Aprovações: o administrador confere cada orçamento aprovado e vê quem aprovou.
// Mesmo desenho de Orçamentos abertos: barra de filtros do Financeiro, lista e o escolhido ao lado.
import { useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, dataBR, isoLocal, mensagemDeErro } from '../api'
import { avisar } from '../estado'
import { confirmar } from '../componentes/Confirmar'
import { reais } from '../../../shared/financeiro'
import { normalizar } from '../../../shared/regras'
import { Icone } from '../componentes/Icones'
import { PeriodoSuspenso, ProfissionaisSuspenso, Suspenso, useIntervalo } from './FinanceiroAbas'
import { COR_PADRAO } from './Profissionais'

interface Aprovacao {
  id: number
  criadoEm: string
  aprovadoEm: string
  aprovadoPor: { nome: string } | null
  paciente: { id: number; nome: string }
  profissional: { id: number; nome: string; corAgenda: string | null }
  observacoes: string | null
  descontoCentavos: number
  totalCentavos: number
  itens: { nome: string; dente: string | null; valorCentavos: number }[]
  pagamentos: { data: string; forma: string | null; valorCentavos: number }[]
}

const SEM_NOME = 'Não registrado'
const quemAprovou = (o: Aprovacao) => o.aprovadoPor?.nome ?? SEM_NOME
const quando = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const diasDesde = (iso: string) =>
  Math.round((Date.parse(isoLocal(new Date())) - Date.parse(isoLocal(new Date(iso)))) / 86_400_000)
const idade = (dias: number) => (dias <= 0 ? 'hoje' : dias === 1 ? 'ontem' : `há ${dias} dias`)
const procedimento = (i: Aprovacao['itens'][number]) =>
  i.dente ? `${i.nome} · ${i.dente}` : i.nome

export function Aprovacoes() {
  const qc = useQueryClient()
  const p = useIntervalo(true) // o que espera conferência não tem prazo: começa vendo tudo
  const [ocultos, setOcultos] = useState<number[]>([])
  const [aprovador, setAprovador] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [escolhido, setEscolhido] = useState<number | null>(null)
  const painel = useRef<HTMLElement>(null)

  const lista = useQuery({
    queryKey: ['aprovacoes'],
    queryFn: async () => (await api.get<Aprovacao[]>('/financeiro/aprovacoes')).data,
  })
  const todos = lista.data ?? []
  const aoConfirmar = (n: number) => {
    avisar(`${n} ${n === 1 ? 'aprovação confirmada' : 'aprovações confirmadas'}`)
    qc.invalidateQueries({ queryKey: ['aprovacoes'] })
  }
  const confirmarUm = useMutation({
    mutationFn: async (id: number) => (await api.post(`/orcamentos/${id}/confirmar`)).data,
    onSuccess: () => aoConfirmar(1),
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const confirmarVarios = useMutation({
    mutationFn: async (ids: number[]) =>
      (await api.post<{ confirmados: number }>('/financeiro/aprovacoes/confirmar', { ids })).data,
    onSuccess: (r) => aoConfirmar(r.confirmados),
    onError: (e) => avisar(mensagemDeErro(e), true),
  })

  // Qual aprovação está com o formulário de rejeitar aberto (some ao trocar de orçamento).
  const [rejeitando, setRejeitando] = useState<number | null>(null)
  const rejeitar = useMutation({
    mutationFn: async (d: { id: number; senha: string }) =>
      (await api.post(`/orcamentos/${d.id}/rejeitar`, { senha: d.senha })).data,
    onSuccess: () => {
      avisar('Aprovação rejeitada: o orçamento voltou para Orçamentos abertos')
      setRejeitando(null)
      for (const k of ['aprovacoes', 'abertos', 'analise', 'orcamentos'])
        qc.invalidateQueries({ queryKey: [k] })
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })

  const porProf = new Map<number, number>()
  const aprovadores = new Map<string, number>()
  for (const o of todos) {
    porProf.set(o.profissional.id, (porProf.get(o.profissional.id) ?? 0) + 1)
    aprovadores.set(quemAprovou(o), (aprovadores.get(quemAprovou(o)) ?? 0) + 1)
  }

  const termo = normalizar(busca.trim())
  const visiveis = todos
    .filter((o) => {
      const dia = isoLocal(new Date(o.aprovadoEm))
      return (
        (p.tudo || (dia >= p.intervalo.de && dia <= p.intervalo.ate)) &&
        !ocultos.includes(o.profissional.id) &&
        (!aprovador || quemAprovou(o) === aprovador) &&
        (!termo ||
          normalizar(o.paciente.nome).includes(termo) ||
          String(o.id) === termo.replace(/\D/g, '') ||
          o.itens.some((i) => normalizar(i.nome).includes(termo) || i.dente === termo))
      )
    })
    .sort((a, b) => b.aprovadoEm.localeCompare(a.aprovadoEm) || b.id - a.id)
  const totalVisivel = visiveis.reduce((s, o) => s + o.totalCentavos, 0)
  // Sem escolha (ou o escolhido saiu da lista), mostra o primeiro.
  const sel = visiveis.find((o) => o.id === escolhido) ?? visiveis[0]
  const ocupado = confirmarUm.isPending || confirmarVarios.isPending || rejeitar.isPending

  async function aoConfirmarTodas() {
    const ids = visiveis.map((o) => o.id)
    const ok = await confirmar(
      `Confirmar as ${ids.length} aprovações da lista (${reais(totalVisivel)})?`,
      { titulo: 'Confirmar todas', botao: 'Confirmar todas', perigo: false },
    )
    if (ok) confirmarVarios.mutate(ids)
  }

  return (
    <div className="mx-auto max-w-[1320px] space-y-3">
      <header className="flex flex-wrap items-center gap-3.5">
        <h1 className="titulo">Aprovações</h1>
        <span aria-hidden="true" className="h-6 w-px bg-borda" />
        <span className="text-base text-suave">
          {lista.isPending
            ? 'Carregando…'
            : `${visiveis.length} esperando confirmação · ${reais(totalVisivel)}`}
        </span>
        {visiveis.length > 1 && (
          <button
            type="button"
            className="botao-leve min-h-11 w-full sm:ml-auto sm:w-auto md:min-h-0"
            disabled={ocupado}
            onClick={aoConfirmarTodas}
          >
            Confirmar todas ({visiveis.length})
          </button>
        )}
      </header>

      {/* ---------- Filtros (barra padrão do Financeiro) ---------- */}
      <div className="cartao flex flex-wrap items-center gap-2 py-2">
        <PeriodoSuspenso p={p} />
        <ProfissionaisSuspenso
          ocultos={ocultos}
          aoMudar={setOcultos}
          valor={(id) => porProf.get(id) ?? 0}
        />
        <Suspenso
          marcado={!!aprovador}
          painel="w-64 p-1.5"
          rotulo={`${aprovador ? `Por ${aprovador}` : 'Aprovado por'} ▾`}
        >
          {(fechar) => (
            <ul>
              {[null, ...aprovadores.keys()].map((nome) => (
                <li key={nome ?? ''}>
                  <button
                    type="button"
                    aria-pressed={aprovador === nome}
                    className={`flex w-full items-center justify-between gap-2.5 rounded-lg px-3 py-2 text-left font-bold hover:bg-primaria-clara ${aprovador === nome ? 'bg-primaria-clara text-titulo' : ''}`}
                    onClick={() => {
                      setAprovador(nome)
                      fechar()
                    }}
                  >
                    {nome ?? 'Todos'}
                    <span className="text-sm text-suave tabular-nums">
                      {nome ? aprovadores.get(nome) : todos.length}
                    </span>
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
          aria-label="Aprovações"
          className={`cartao flex max-h-[calc(100vh-13rem)] min-w-0 flex-[1_1_22rem] flex-col p-0 ${lista.isFetching ? 'opacity-60' : ''}`}
        >
          <div className="border-b border-borda p-3">
            <label className="relative block">
              <Icone
                nome="busca"
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-suave"
              />
              <span className="sr-only">Buscar aprovação</span>
              <input
                type="search"
                className="campo py-1.5 pl-9"
                placeholder="Buscar paciente, procedimento ou nº"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </label>
          </div>
          <div className="flex flex-col gap-0.5 overflow-y-auto p-2">
            {visiveis.map((o) => {
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
                      <span className="truncate">por {quemAprovou(o)}</span>
                      <span className="shrink-0 font-bold" title="Desde que foi aprovado">
                        {idade(diasDesde(o.aprovadoEm))}
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
                    ? 'Nenhuma aprovação com esses filtros.'
                    : 'Nenhuma aprovação esperando confirmação.'}
              </p>
            )}
          </div>
        </nav>

        {/* ---------- Aprovação escolhida ---------- */}
        {sel && (
          <section
            ref={painel}
            aria-label="Aprovação escolhida"
            className="cartao min-w-0 flex-[999_1_32rem] scroll-mt-4 overflow-hidden p-0"
            style={{ boxShadow: `inset 0 4px 0 ${sel.profissional.corAgenda ?? COR_PADRAO}` }}
          >
            <div className="flex flex-wrap justify-between gap-3 border-b border-borda px-5 py-4">
              <div className="min-w-0">
                <p className="text-sm text-suave">
                  Orçamento nº {sel.id} · feito em {dataBR(isoLocal(new Date(sel.criadoEm)))}
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
                    <li key={n} className="flex justify-between gap-3 border-b border-borda py-2">
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
                {sel.observacoes && (
                  <p className="mt-3 rounded-xl bg-superficie-2 px-3 py-2 text-sm">
                    {sel.observacoes}
                  </p>
                )}
              </div>

              <div className="flex min-w-0 flex-[1_1_16rem] flex-col gap-3 self-start rounded-2xl bg-superficie-2 p-4">
                <h3 className="text-base font-extrabold text-titulo">Conferência</h3>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
                  <dt className="text-suave">Aprovado por</dt>
                  <dd className="font-bold">{quemAprovou(sel)}</dd>
                  <dt className="text-suave">Quando</dt>
                  <dd className="font-bold">{quando(sel.aprovadoEm)}</dd>
                  <dt className="text-suave">Pagamento</dt>
                  <dd className="font-bold">
                    {sel.pagamentos.length
                      ? sel.pagamentos.map((g, n) => (
                          <span key={n} className="block">
                            {g.forma ?? 'Sem forma'} · {reais(g.valorCentavos)} em {dataBR(g.data)}
                          </span>
                        ))
                      : 'Não recebido na aprovação'}
                  </dd>
                </dl>
                {rejeitando === sel.id ? (
                  <form
                    className="space-y-2 rounded-xl border border-borda bg-superficie p-3"
                    onSubmit={(e) => {
                      e.preventDefault()
                      const senha = String(new FormData(e.currentTarget).get('senha'))
                      rejeitar.mutate({ id: sel.id, senha })
                    }}
                  >
                    <p>
                      Para rejeitar, confirme com a sua senha. O orçamento volta para Orçamentos
                      abertos
                      {sel.pagamentos.length > 0 &&
                        ` e o pagamento de ${reais(sel.pagamentos.reduce((s, g) => s + g.valorCentavos, 0))} sai do caixa`}
                      .
                    </p>
                    <input
                      name="senha"
                      type="password"
                      className="campo"
                      aria-label="Sua senha"
                      autoComplete="current-password"
                      autoFocus
                      required
                    />
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        className="botao-leve min-h-11 md:min-h-0"
                        onClick={() => setRejeitando(null)}
                      >
                        Voltar
                      </button>
                      <button className="botao-perigo min-h-11 md:min-h-0" disabled={ocupado}>
                        Rejeitar
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <button
                      type="button"
                      className="botao min-h-11 md:min-h-0"
                      disabled={ocupado}
                      onClick={() => confirmarUm.mutate(sel.id)}
                    >
                      Confirmar aprovação
                    </button>
                    <button
                      type="button"
                      className="botao-leve min-h-11 text-perigo md:min-h-0"
                      disabled={ocupado}
                      onClick={() => setRejeitando(sel.id)}
                    >
                      Rejeitar
                    </button>
                    <p className="text-xs text-suave">
                      Confirmar tira da lista e registra quem conferiu. Rejeitar devolve o orçamento
                      para Orçamentos abertos.
                    </p>
                  </>
                )}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
