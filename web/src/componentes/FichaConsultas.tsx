// Abas de consulta da ficha: Agendamentos e Indicações do paciente.
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import {
  api,
  consultaConfig,
  consultaEu,
  dataBR,
  isoLocal,
  mensagemDeErro,
  type Paciente,
} from '../api'
import { pode } from '../../../shared/permissoes'
import { CATEGORIAS, STATUS, type StatusAgenda } from '../../../shared/agenda'
import { Dialogo } from './Dialogo'
import { Icone } from './Icones'
import { NovoAgendamento } from './NovoAgendamento'

interface AgendamentoPaciente {
  id: number
  data: string
  inicio: string
  fim: string
  status: StatusAgenda
  categoria: string | null
  observacoes: string | null
  desmarcadoEm: string | null
  motivoDesmarcacao: string | null
  profissional: { nome: string }
}

type Filtro = 'proximas' | 'anteriores' | 'desmarcadas' | 'todas'
const FILTROS: Record<Filtro, string> = {
  proximas: 'Próximas',
  anteriores: 'Anteriores',
  desmarcadas: 'Desmarcadas',
  todas: 'Todas',
}
const COR_DESMARCADA = '#94a3b8'

const diaDe = (iso: string) => new Date(`${iso}T12:00:00`)
function quando(data: string, hoje: string) {
  const n = Math.round((diaDe(data).getTime() - diaDe(hoje).getTime()) / 86_400_000)
  if (n === 0) return 'Hoje'
  if (n === 1) return 'Amanhã'
  return n > 1 ? `Em ${n} dias` : null
}

/** Aba "Agendamentos" da ficha: próximas consultas e histórico do paciente. */
export function AgendamentosPaciente({ paciente }: { paciente: Paciente }) {
  const { data: eu } = useSuspenseQuery(consultaEu)
  const { data: categorias } = useQuery(consultaConfig('categorias'))
  const cores: Record<string, string> = categorias ?? CATEGORIAS
  const [novo, setNovo] = useState(false)
  const [filtro, setFiltro] = useState<Filtro | null>(null)
  const hoje = isoLocal(new Date())
  const lista = useQuery({
    queryKey: ['agendamentos-paciente', paciente.id],
    queryFn: async () =>
      (await api.get<AgendamentoPaciente[]>(`/pacientes/${paciente.id}/agendamentos`)).data,
  })
  const todos = lista.data ?? []
  const grupos: Record<Filtro, AgendamentoPaciente[]> = {
    // A API manda do mais novo para o mais antigo; as próximas vêm na ordem em que acontecem.
    proximas: todos.filter((a) => !a.desmarcadoEm && a.data >= hoje).reverse(),
    anteriores: todos.filter((a) => !a.desmarcadoEm && a.data < hoje),
    desmarcadas: todos.filter((a) => a.desmarcadoEm),
    todas: todos,
  }
  // Sem escolha: abre nas próximas, ou em todas quando não há nenhuma marcada.
  const ativo = filtro ?? (grupos.proximas.length ? 'proximas' : 'todas')
  const itens = grupos[ativo]
  const podeMarcar = pode(eu.perfis, 'agenda.editar') && paciente.ativo
  const conta = (s: StatusAgenda) => grupos.anteriores.filter((a) => a.status === s).length
  const resumo = [
    {
      rotulo: 'Consultas',
      valor: todos.length - grupos.desmarcadas.length,
      cor: 'var(--primaria)',
    },
    { rotulo: 'Próximas', valor: grupos.proximas.length, cor: STATUS.CONFIRMADO.cor },
    { rotulo: 'Atendidas', valor: conta('ATENDIDO'), cor: STATUS.ATENDIDO.cor },
    { rotulo: 'Faltas', valor: conta('FALTOU'), cor: STATUS.FALTOU.cor },
    { rotulo: 'Desmarcadas', valor: grupos.desmarcadas.length, cor: COR_DESMARCADA },
  ]

  return (
    <div className="space-y-4">
      <header className="cartao flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl">Agendamentos</h2>
          <p className="subtitulo">Consultas marcadas, atendidas e desmarcadas do paciente.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/agenda" className="botao-leve">
            <Icone nome="agenda" className="h-4 w-4" />
            Abrir agenda
          </Link>
          {podeMarcar && (
            <button className="botao" onClick={() => setNovo(true)}>
              <Icone nome="mais" className="h-4 w-4" />
              Nova consulta
            </button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {resumo.map((r) => (
          <div key={r.rotulo} className="cartao flex items-center gap-3 px-4 py-3">
            <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: r.cor }} />
            <div className="min-w-0">
              <p className="text-2xl leading-none font-extrabold text-titulo tabular-nums">
                {lista.isPending ? '–' : r.valor}
              </p>
              <p className="truncate text-xs text-suave">{r.rotulo}</p>
            </div>
          </div>
        ))}
      </div>

      <section className="cartao overflow-hidden p-0">
        <div
          className="flex flex-wrap gap-1 border-b border-borda p-2"
          role="group"
          aria-label="Mostrar"
        >
          {(Object.keys(FILTROS) as Filtro[]).map((f) => (
            <button
              key={f}
              aria-pressed={ativo === f}
              onClick={() => setFiltro(f)}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 font-bold ${
                ativo === f
                  ? 'bg-primaria text-sobre-primaria'
                  : 'text-suave hover:bg-primaria-clara hover:text-texto'
              }`}
            >
              {FILTROS[f]}
              <span
                className={`rounded-full px-1.5 text-xs tabular-nums ${ativo === f ? 'bg-superficie/25' : 'bg-superficie-2'}`}
              >
                {grupos[f].length}
              </span>
            </button>
          ))}
        </div>

        {lista.isPending && <p className="px-4 py-10 text-center text-suave">Carregando…</p>}
        {lista.isError && (
          <p className="px-4 py-10 text-center text-perigo">{mensagemDeErro(lista.error)}</p>
        )}
        {lista.isSuccess && !itens.length && (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-primaria-clara text-primaria">
              <Icone nome="agenda" className="h-7 w-7" />
            </span>
            <p className="font-bold text-titulo">
              {ativo === 'proximas'
                ? 'Nenhuma consulta marcada'
                : ativo === 'desmarcadas'
                  ? 'Nenhuma consulta desmarcada'
                  : 'Nenhuma consulta por aqui'}
            </p>
            {podeMarcar && ativo !== 'desmarcadas' && (
              <button className="botao-leve botao-pequeno" onClick={() => setNovo(true)}>
                <Icone nome="mais" className="h-3.5 w-3.5" />
                Marcar consulta
              </button>
            )}
          </div>
        )}

        <ul className="divide-y divide-borda">
          {itens.map((a) => {
            const d = diaDe(a.data)
            const desmarcada = !!a.desmarcadoEm
            const status = desmarcada
              ? { rotulo: 'Desmarcada', cor: COR_DESMARCADA }
              : STATUS[a.status]
            const destaque = a.data === hoje && !desmarcada
            const prazo = desmarcada ? null : quando(a.data, hoje)
            const nota = a.motivoDesmarcacao ?? a.observacoes
            return (
              <li
                key={a.id}
                className={`flex flex-wrap items-center gap-4 px-4 py-3 hover:bg-superficie-2 ${desmarcada ? 'opacity-70' : ''}`}
              >
                <div
                  className={`w-16 shrink-0 rounded-xl border py-1.5 text-center ${
                    destaque
                      ? 'border-primaria bg-primaria text-sobre-primaria'
                      : 'border-borda bg-superficie text-titulo'
                  }`}
                >
                  <p className="text-xs font-extrabold uppercase">
                    {d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}
                  </p>
                  <p className="text-2xl leading-none font-extrabold tabular-nums">{d.getDate()}</p>
                  <p className="text-[11px] tabular-nums opacity-70">{d.getFullYear()}</p>
                </div>

                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="flex flex-wrap items-center gap-2">
                    <span
                      className={`font-bold text-titulo first-letter:uppercase ${desmarcada ? 'line-through' : ''}`}
                    >
                      {d.toLocaleDateString('pt-BR', { weekday: 'long' })},{' '}
                      <span className="tabular-nums">
                        {a.inicio} – {a.fim}
                      </span>
                    </span>
                    {prazo && <span className="etiqueta etiqueta-primaria">{prazo}</span>}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-suave">
                    <span>{a.profissional.nome}</span>
                    {a.categoria && (
                      <span className="flex items-center gap-1.5">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: cores[a.categoria] ?? COR_DESMARCADA }}
                        />
                        {a.categoria}
                      </span>
                    )}
                  </p>
                  {nota && (
                    <p className="text-sm text-suave">
                      {a.motivoDesmarcacao && <span className="font-bold">Motivo: </span>}
                      {nota}
                    </p>
                  )}
                </div>

                <span
                  className="etiqueta shrink-0"
                  style={{
                    color: status.cor,
                    backgroundColor: `color-mix(in srgb, ${status.cor} 14%, transparent)`,
                  }}
                >
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: status.cor }} />
                  {status.rotulo}
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      <Dialogo aberto={novo} aoFechar={() => setNovo(false)} titulo="Nova consulta" largo>
        {novo && (
          <NovoAgendamento
            inicial={{ tipo: 'CONSULTA', data: hoje, paciente }}
            aoTerminar={() => setNovo(false)}
          />
        )}
      </Dialogo>
    </div>
  )
}

interface DadosIndicacao {
  indicadoPor: string | null
  quemIndicou: { id: number; nome: string } | null
  indicados: { id: number; nome: string; criadoEm: string }[]
}

export function Indicacoes({ paciente }: { paciente: Paciente }) {
  const r = useQuery({
    queryKey: ['indicacoes', paciente.id],
    queryFn: async () =>
      (await api.get<DadosIndicacao>(`/pacientes/${paciente.id}/indicacoes`)).data,
  })
  const linkPaciente = (p: { id: number; nome: string }) => (
    <Link
      to="/pacientes/$id"
      params={{ id: String(p.id) }}
      className="text-primaria hover:underline"
    >
      {p.nome}
    </Link>
  )
  return (
    <div className="space-y-4">
      <section className="cartao space-y-2">
        <h2 className="font-semibold">Quem indicou este paciente</h2>
        {!r.data?.indicadoPor && <p className="text-suave">Não foi indicado por ninguém.</p>}
        {r.data?.indicadoPor && (
          <p>{r.data.quemIndicou ? linkPaciente(r.data.quemIndicou) : r.data.indicadoPor}</p>
        )}
      </section>
      <section className="cartao space-y-3">
        <h2 className="font-semibold">Pacientes que ele indicou</h2>
        {r.data?.indicados.length === 0 && (
          <p className="text-suave">
            Nenhum. Quando um paciente novo for cadastrado com “Indicado por” igual ao nome deste,
            ele aparece aqui.
          </p>
        )}
        <ul className="space-y-1">
          {r.data?.indicados.map((p) => (
            <li key={p.id}>
              {linkPaciente(p)}{' '}
              <span className="text-suave">· cadastrado em {dataBR(p.criadoEm)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
