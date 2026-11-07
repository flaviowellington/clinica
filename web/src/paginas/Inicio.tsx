import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import {
  api,
  consultaEu,
  consultaProfissionais,
  isoLocal,
  somarDias,
  type Agendamento,
} from '../api'
import { Icone } from '../componentes/Icones'
import { ABAS } from '../abas'
import { STATUS, paraMinutos, type StatusAgenda } from '../../../shared/agenda'
import type { Etapa } from '../../../shared/protetico'

const saudacao = (hora: number) => (hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite')
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

type Sinal = { texto: string; pendentes?: number }

/** Tela inicial: os módulos que o usuário pode abrir, cada um com o que pede atenção agora. */
export function Inicio() {
  const { data: eu } = useSuspenseQuery(consultaEu)
  const navegar = useNavigate()
  const [busca, setBusca] = useState('')
  const agora = new Date()
  const hoje = isoLocal(agora)
  const amanha = somarDias(hoje, 1)
  const abas = ABAS.filter((a) => a.visivel(eu.perfis))
  const ve = (para: string) => abas.some((a) => a.para === para)

  const dia = useQuery({
    queryKey: ['agenda', hoje, hoje, false],
    queryFn: async () =>
      (await api.get<Agendamento[]>('/agenda', { params: { de: hoje, ate: hoje } })).data,
    refetchInterval: 60_000,
  })
  const confirmacoes = useQuery({
    queryKey: ['confirmacoes', amanha],
    queryFn: async () =>
      (
        await api.get<{ status: StatusAgenda; confirmadoEm: string | null }[]>('/confirmacoes', {
          params: { data: amanha },
        })
      ).data,
    enabled: ve('/confirmacoes'),
  })
  const abertos = useQuery({
    queryKey: ['abertos', {}],
    queryFn: async () => (await api.get<unknown[]>('/financeiro/orcamentos-abertos')).data,
    enabled: ve('/financeiro'),
  })
  const protetico = useQuery({
    queryKey: ['protetico'],
    queryFn: async () => (await api.get<{ etapa: Etapa }[]>('/protetico')).data,
    enabled: ve('/protetico'),
  })
  const profissionais = useQuery(consultaProfissionais)

  const consultas = (dia.data ?? [])
    .filter((a) => a.tipo === 'CONSULTA')
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
  const porStatus = (Object.keys(STATUS) as StatusAgenda[])
    .map((s) => [s, consultas.filter((a) => a.status === s).length] as const)
    .filter(([, n]) => n > 0)
  const minutoAgora =agora.getHours() * 60 + agora.getMinutes()
  const proxima = consultas.find(
    (a) => paraMinutos(a.inicio) >= minutoAgora && ['AGENDADO', 'CONFIRMADO'].includes(a.status),
  )

  const semResposta = confirmacoes.data?.filter((c) => !c.confirmadoEm && c.status === 'AGENDADO').length
  const etapa = (e: Etapa) => protetico.data?.filter((t) => t.etapa === e).length ?? 0
  const sinais: Partial<Record<string, Sinal>> = {
    '/confirmacoes': semResposta === undefined
      ? undefined
      : semResposta
        ? { texto: `${plural(semResposta, 'consulta', 'consultas')} de amanhã sem resposta`, pendentes: semResposta }
        : { texto: 'Amanhã está todo confirmado' },
    '/financeiro': abertos.data && {
      texto: abertos.data.length
        ? `${plural(abertos.data.length, 'orçamento', 'orçamentos')} em aberto`
        : 'Nenhum orçamento em aberto',
      pendentes: abertos.data.length || undefined,
    },
    '/protetico': protetico.data && {
      texto: etapa('AGENDAMENTO')
        ? `${plural(etapa('AGENDAMENTO'), 'instalação', 'instalações')} para agendar`
        : `${plural(etapa('EM_LABORATORIO'), 'trabalho', 'trabalhos')} no laboratório`,
      pendentes: etapa('AGENDAMENTO') || undefined,
    },
    '/profissionais': profissionais.data && {
      texto: plural(profissionais.data.profissionais.length, 'dentista', 'dentistas') + ' na clínica',
    },
  }
  const outros = abas.filter((a) => a.para !== '/agenda' && a.para !== '/pacientes')

  return (
    <div className="mx-auto max-w-6xl space-y-6 py-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-extrabold text-titulo sm:text-3xl">
          {saudacao(agora.getHours())}, {eu.nome.split(' ')[0]}. Por onde começamos?
        </h1>
        <p className="text-suave">Cada módulo mostra o que pede sua atenção agora</p>
      </header>

      <nav
        aria-label="Módulos"
        className="grid auto-rows-[minmax(10.5rem,auto)] grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4"
      >
        {ve('/agenda') && (
          <Link
            to="/agenda"
            className="flex flex-col gap-3.5 rounded-[1.75rem] bg-primaria p-6 text-sobre-primaria shadow-sm transition hover:shadow-lg sm:col-span-2 sm:row-span-2"
          >
            <span className="flex items-center gap-3">
              <span className="rounded-2xl bg-sobre-primaria/15 p-3">
                <Icone nome="agenda" />
              </span>
              <span className="text-2xl font-extrabold">Agenda</span>
            </span>
            <span className="text-base opacity-90">Marque, remarque e acompanhe as consultas do dia.</span>
            <span className="mt-auto flex flex-col gap-3 rounded-2xl bg-superficie p-4 text-texto">
              <span className="text-xs font-extrabold tracking-wider text-suave uppercase">
                {consultas.length ? `Hoje · ${plural(consultas.length, 'consulta', 'consultas')}` : 'Hoje'}
              </span>
              <span className="flex h-3 gap-0.5 overflow-hidden rounded-full" aria-hidden>
                {dia.isPending ? (
                  <span className="flex-1 animate-pulse bg-superficie-2" />
                ) : consultas.length ? (
                  porStatus.map(([s, n]) => (
                    <span key={s} style={{ flex: n, background: STATUS[s].cor }} />
                  ))
                ) : (
                  <span className="flex-1 bg-superficie-2" />
                )}
              </span>
              {porStatus.length > 0 && (
                <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-suave">
                  {porStatus.map(([s, n]) => (
                    <span key={s} className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ background: STATUS[s].cor }} />
                      <strong className="text-texto">{n}</strong> {STATUS[s].rotulo.toLowerCase()}
                    </span>
                  ))}
                </span>
              )}
              <span className="text-base">
                {dia.isPending ? (
                  'Carregando o dia…'
                ) : dia.isError ? (
                  'Não foi possível carregar a agenda.'
                ) : proxima ? (
                  <>
                    <strong>Próxima às {proxima.inicio}</strong> ·{' '}
                    {proxima.paciente?.nome ?? proxima.titulo} com {proxima.profissional.nome}
                  </>
                ) : consultas.length ? (
                  `${plural(consultas.length, 'consulta', 'consultas')} hoje, nenhuma pendente daqui para frente.`
                ) : (
                  'Nenhuma consulta marcada para hoje.'
                )}
              </span>
            </span>
          </Link>
        )}

        {ve('/pacientes') && (
          <div className="cartao flex flex-col gap-3 rounded-[1.75rem] p-5 sm:col-span-2">
            <Link to="/pacientes" className="flex items-center gap-3 hover:text-primaria">
              <span className="rounded-xl bg-primaria-clara p-2.5 text-primaria">
                <Icone nome="pacientes" />
              </span>
              <span className="text-lg font-extrabold">Pacientes</span>
            </Link>
            <form
              role="search"
              className="mt-auto"
              onSubmit={(e) => {
                e.preventDefault()
                navegar({ to: '/pacientes', search: { busca: busca.trim() || undefined } })
              }}
            >
              <label>
                <span className="sr-only">Buscar paciente</span>
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Nome, CPF ou celular… e Enter"
                  className="campo h-11 w-full"
                />
              </label>
            </form>
            <p className="text-xs text-suave">Cadastro, prontuário e histórico de cada paciente.</p>
          </div>
        )}

        {outros.map((a) => {
          const s = sinais[a.para]
          return (
            <Link
              key={a.para}
              to={a.para}
              className="cartao group flex flex-col gap-2 rounded-3xl p-4.5 transition hover:border-primaria hover:shadow-md"
            >
              <span className="flex items-center justify-between">
                <span className="rounded-xl bg-primaria-clara p-2.5 text-primaria transition-transform group-hover:scale-110">
                  <Icone nome={a.icone} />
                </span>
                {s?.pendentes ? (
                  <span className="min-w-6 rounded-full bg-secundaria px-2 py-0.5 text-center text-xs font-extrabold text-sobre-secundaria">
                    {s.pendentes}
                  </span>
                ) : null}
              </span>
              <span className="text-base font-extrabold">{a.rotulo}</span>
              <span
                className={`mt-auto text-sm ${s?.pendentes ? 'font-extrabold text-aviso' : 'text-suave'}`}
              >
                {s?.texto ?? a.descricao}
              </span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
