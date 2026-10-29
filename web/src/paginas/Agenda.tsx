import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import {
  api,
  consultaEu,
  consultaConfig,
  consultaProfissionais,
  isoLocal,
  mensagemDeErro,
  somarDias,
  type Agendamento,
} from '../api'
import { avisar } from '../estado'
import { pode } from '../../../shared/permissoes'
import {
  CATEGORIAS,
  HORARIOS,
  INTERVALO,
  STATUS,
  diaComExpediente,
  ladoALado,
  paraHora,
  paraMinutos,
  type Categoria,
} from '../../../shared/agenda'
import { Dialogo } from '../componentes/Dialogo'
import { NovoAgendamento, type Inicial } from '../componentes/NovoAgendamento'
import { MiniCalendario } from '../componentes/MiniCalendario'
import { CartaoConsulta } from '../componentes/CartaoConsulta'
import { COR_PADRAO } from './Profissionais'
import { ListaRetornos, NovoRetorno } from '../componentes/Retornos'
import { Icone } from '../componentes/Icones'

type Visao = 'dia' | 'semana' | 'mes'
const VISOES: Record<Visao, string> = { dia: 'Dia', semana: 'Semana', mes: 'Mês' }
const SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
/** Domingo (fechado) listrado na visão Mês. */
const LISTRA_FECHADO =
  'bg-[repeating-linear-gradient(135deg,transparent_0_6px,color-mix(in_srgb,var(--borda)_60%,transparent)_6px_7px)]'
const LARGURA_MAXIMA = 380 // px por coluna de profissional na grade do dia
const ALTURA = 36 // px por intervalo de 15 min: cabe uma linha de texto sem cortar
/** Cor do profissional misturada com o fundo: mais clara, e funciona no tema escuro. */
const clara = (cor: string, pct: number) => `color-mix(in srgb, ${cor} ${pct}%, var(--superficie))`

// R-064: a visão escolhida fica só neste navegador.
function lerVisao(): Visao {
  try {
    const v = localStorage.getItem('agenda.visao')
    return v === 'semana' || v === 'mes' ? v : 'dia'
  } catch {
    return 'dia'
  }
}

/** Segunda-feira da semana da data. */
const segundaDe = (iso: string) => somarDias(iso, -((new Date(`${iso}T12:00:00`).getDay() + 6) % 7))

function periodo(visao: Visao, data: string): [string, string] {
  if (visao === 'dia') return [data, data]
  if (visao === 'semana') return [segundaDe(data), somarDias(segundaDe(data), 6)]
  const inicio = segundaDe(`${data.slice(0, 7)}-01`)
  return [inicio, somarDias(inicio, 41)]
}

const titulo = (visao: Visao, data: string) => {
  const d = new Date(`${data}T12:00:00`)
  if (visao === 'mes') return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  if (visao === 'semana') {
    const [de, ate] = periodo('semana', data)
    const f = (i: string) =>
      new Date(`${i}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    return `${f(de)} a ${f(ate)}`
  }
  return d.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

const COR_COMPROMISSO = '#6b7280'
const COR_SEM_CATEGORIA = '#a8a29e' // diferente de "Consulta" e de "Compromisso"

/** Cor do bloco pela categoria; inclui as categorias que a clínica criou. */
function useCorDe() {
  const { data } = useQuery(consultaConfig('categorias'))
  const cores: Record<string, string> = data ?? CATEGORIAS
  return (a: Agendamento) =>
    a.tipo === 'COMPROMISSO'
      ? COR_COMPROMISSO
      : ((a.categoria && cores[a.categoria]) ?? COR_SEM_CATEGORIA)
}

/** Legenda das categorias embaixo da agenda. */
function LegendaCategorias() {
  const { data } = useQuery(consultaConfig('categorias'))
  const itens: [string, string][] = [
    ...Object.entries(data ?? CATEGORIAS),
    ['Sem categoria', COR_SEM_CATEGORIA],
    ['Compromisso', COR_COMPROMISSO],
  ]
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-suave">
      <span className="font-bold">Categorias:</span>
      {itens.map(([nome, cor]) => (
        <span key={nome} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: cor }} />
          {nome}
        </span>
      ))}
    </div>
  )
}
const nomeDe = (a: Agendamento) => a.paciente?.nome ?? a.titulo ?? 'Compromisso'

/** filtrosNoTopo: "Agenda 2", sem a lateral; filtros numa barra e a grade na largura toda. */
export function Agenda({ filtrosNoTopo = false }: { filtrosNoTopo?: boolean }) {
  const { data: eu } = useSuspenseQuery(consultaEu)
  const { data: prof } = useSuspenseQuery(consultaProfissionais)
  const podeEditar = pode(eu.perfis, 'agenda.editar')
  const qc = useQueryClient()

  const hoje = isoLocal(new Date())
  const [data, setData] = useState(hoje)
  const [visao, setVisao] = useState<Visao>(lerVisao)
  const [ocultos, setOcultos] = useState<number[]>([]) // padrão: todos visíveis
  const [busca, setBusca] = useState<string | null>(null) // null = caixa de busca fechada
  const [janela, setJanela] = useState<'data' | 'profissionais' | 'retornos' | null>(null) // só na Agenda 2
  const [novo, setNovo] = useState<Inicial | null>(null)
  const [menu, setMenu] = useState(false)
  const [retorno, setRetorno] = useState(false)
  const [aberto, setAberto] = useState<Agendamento | null>(null)
  const [mover, setMover] = useState<{
    a: Agendamento
    data: string
    inicio: string
    profissionalId: number
  } | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem('agenda.visao', visao)
    } catch {
      /* navegador sem armazenamento: só não lembra a visão */
    }
  }, [visao])

  const [de, ate] = periodo(visao, data)
  const lista = useQuery({
    queryKey: ['agenda', de, ate],
    queryFn: async () => (await api.get<Agendamento[]>('/agenda', { params: { de, ate } })).data,
  })
  const termo = (busca ?? '').trim().toLocaleLowerCase('pt-BR')
  const achados = prof.profissionais.filter((p) =>
    p.nome.toLocaleLowerCase('pt-BR').includes(termo),
  )
  const colunas = achados.filter((p) => !ocultos.includes(p.id))
  const visiveis = new Set(colunas.map((p) => p.id))
  const itens = (lista.data ?? []).filter((a) => visiveis.has(a.profissional.id))

  const moverMut = useMutation({
    mutationFn: async (m: NonNullable<typeof mover>) =>
      (await api.put(`/agenda/${m.a.id}/horario`, m)).data,
    onSuccess: () => {
      avisar('Agendamento movido')
      qc.invalidateQueries({ queryKey: ['agenda'] })
      setMover(null)
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })

  function passo(dir: 1 | -1) {
    if (visao === 'dia') return setData(somarDias(data, dir))
    if (visao === 'semana') return setData(somarDias(data, 7 * dir))
    const d = new Date(`${data.slice(0, 7)}-01T12:00:00`)
    d.setMonth(d.getMonth() + dir)
    setData(isoLocal(d))
  }

  function alternar(id: number) {
    setOcultos((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]))
  }

  const abrirNovo = (i: Partial<Inicial> = {}) => {
    setMenu(false)
    setNovo({ tipo: 'CONSULTA', data, ...i })
  }

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1" role="group" aria-label="Visualizar por">
          {(Object.keys(VISOES) as Visao[]).map((v) => (
            <button
              key={v}
              aria-pressed={visao === v}
              onClick={() => setVisao(v)}
              className={visao === v ? 'botao py-1.5' : 'botao-leve py-1.5'}
            >
              {VISOES[v]}
            </button>
          ))}
        </div>
        <h1 className="ml-auto text-lg font-semibold first-letter:uppercase">
          {titulo(visao, data)}
        </h1>
        {podeEditar && (
          <div className="relative">
            <button className="botao" aria-expanded={menu} onClick={() => setMenu(!menu)}>
              Adicionar ▾
            </button>
            {menu && (
              <ul
                className="cartao absolute right-0 z-40 mt-1 w-56 p-1 shadow-lg"
                onKeyDown={(e) => e.key === 'Escape' && setMenu(false)}
              >
                <li>
                  <button
                    className="w-full rounded px-3 py-2 text-left hover:bg-primaria-clara"
                    onClick={() => abrirNovo()}
                  >
                    Nova consulta
                  </button>
                </li>
                <li>
                  <button
                    className="w-full rounded px-3 py-2 text-left hover:bg-primaria-clara"
                    onClick={() => abrirNovo({ tipo: 'COMPROMISSO' })}
                  >
                    Novo compromisso
                  </button>
                </li>
                <li>
                  <button
                    className="w-full rounded px-3 py-2 text-left hover:bg-primaria-clara"
                    onClick={() => {
                      setMenu(false)
                      setRetorno(true)
                    }}
                  >
                    Alerta de retorno
                  </button>
                </li>
              </ul>
            )}
          </div>
        )}
      </header>
      {filtrosNoTopo && (
        <div className="cartao flex flex-wrap items-center gap-2 py-2">
          {/* Clicar fora fecha a janela aberta (calendário, profissionais ou retornos). */}
          {janela && <div className="fixed inset-0 z-30" onClick={() => setJanela(null)} />}
          <div className="relative flex items-center gap-1">
            <button
              type="button"
              className="botao-leve px-2.5 py-1.5"
              onClick={() => passo(-1)}
              aria-label={`${VISOES[visao]} anterior`}
            >
              ‹
            </button>
            <button
              type="button"
              className="botao-leve flex items-center gap-2 py-1.5"
              aria-expanded={janela === 'data'}
              onClick={() => setJanela(janela === 'data' ? null : 'data')}
            >
              <Icone nome="agenda" className="h-4 w-4" />
              {data.split('-').reverse().join('/')}
            </button>
            <button
              type="button"
              className="botao-leve px-2.5 py-1.5"
              onClick={() => passo(1)}
              aria-label={`Próximo: ${VISOES[visao].toLowerCase()}`}
            >
              ›
            </button>
            {janela === 'data' && (
              <div className="absolute top-full left-0 z-40 mt-1 w-64 shadow-lg">
                <MiniCalendario
                  data={data}
                  hoje={hoje}
                  aoEscolher={(d) => {
                    setData(d)
                    setJanela(null)
                  }}
                />
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              className="botao-leve flex items-center gap-2 py-1.5"
              aria-expanded={janela === 'profissionais'}
              onClick={() => setJanela(janela === 'profissionais' ? null : 'profissionais')}
            >
              <span className="flex -space-x-1" aria-hidden>
                {colunas.slice(0, 5).map((p) => (
                  <span
                    key={p.id}
                    className="h-3 w-3 rounded-full ring-2 ring-superficie"
                    style={{ backgroundColor: p.corAgenda ?? COR_PADRAO }}
                  />
                ))}
              </span>
              Profissionais
              <span className="text-suave">
                {colunas.length === prof.profissionais.length
                  ? 'todos'
                  : `${colunas.length} de ${prof.profissionais.length}`}
              </span>
              ▾
            </button>
            {janela === 'profissionais' && (
              <div className="cartao absolute top-full left-0 z-40 mt-1 w-72 space-y-2 shadow-lg">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">Profissionais</p>
                  <button
                    type="button"
                    className="botao-leve px-2 py-0.5 text-sm"
                    onClick={() => {
                      setOcultos([])
                      setBusca(null)
                    }}
                  >
                    Todos
                  </button>
                </div>
                <div className="relative">
                  <Icone
                    nome="busca"
                    className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-suave"
                  />
                  <input
                    type="search"
                    autoFocus
                    className="campo py-1.5 pl-8"
                    placeholder="Buscar profissional"
                    aria-label="Buscar profissional"
                    value={busca ?? ''}
                    onChange={(e) => setBusca(e.target.value)}
                    onKeyDown={(e) => e.key === 'Escape' && setJanela(null)}
                  />
                </div>
                <div className="max-h-64 space-y-1.5 overflow-y-auto">
                  {achados.map((p) => (
                    <label key={p.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!ocultos.includes(p.id)}
                        onChange={() => alternar(p.id)}
                        style={{ '--cor-check': p.corAgenda ?? COR_PADRAO } as React.CSSProperties}
                      />
                      {p.nome}
                    </label>
                  ))}
                  {!achados.length && <p className="text-suave">Nenhum profissional encontrado.</p>}
                </div>
              </div>
            )}
          </div>

          <div className="relative ml-auto">
            <button
              type="button"
              className="botao-leve py-1.5"
              aria-expanded={janela === 'retornos'}
              onClick={() => setJanela(janela === 'retornos' ? null : 'retornos')}
            >
              Alertas de retorno ▾
            </button>
            {janela === 'retornos' && (
              <div className="absolute right-0 z-40 mt-1 w-72 shadow-lg">
                <ListaRetornos />
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {!filtrosNoTopo && (
          // Mesma altura da tabela (VisaoDia acima="9rem"): os alertas ocupam o que sobra.
          <aside className="flex flex-col gap-4 lg:h-[calc(100vh-9rem)] lg:w-64 lg:shrink-0">
            {/* key: ao trocar de mês na agenda, o minicalendário volta para esse mês */}
            <MiniCalendario key={data.slice(0, 7)} data={data} hoje={hoje} aoEscolher={setData} />
            <div className="cartao space-y-2">
              <div className="relative flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <p className="font-medium">Profissionais</p>
                  <button
                    type="button"
                    className="rounded p-1 text-suave hover:bg-primaria-clara hover:text-texto"
                    aria-label="Buscar profissional"
                    aria-expanded={busca !== null}
                    onClick={() => setBusca(busca === null ? '' : null)}
                  >
                    <Icone nome="busca" className="h-4 w-4" />
                  </button>
                  {busca !== null && (
                    <input
                      type="search"
                      autoFocus
                      className="campo absolute top-full left-0 z-20 mt-1 w-56 shadow-lg lg:top-0 lg:left-full lg:mt-0 lg:ml-2"
                      placeholder="Nome do profissional"
                      aria-label="Nome do profissional"
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      onKeyDown={(e) => e.key === 'Escape' && setBusca(null)}
                    />
                  )}
                </div>
                <button
                  type="button"
                  className="botao-leve px-2 py-0.5 text-sm"
                  onClick={() => {
                    setOcultos([])
                    setBusca(null)
                  }}
                >
                  Todos
                </button>
              </div>
              {achados.map((p) => (
                <label key={p.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!ocultos.includes(p.id)}
                    onChange={() => alternar(p.id)}
                    style={{ '--cor-check': p.corAgenda ?? COR_PADRAO } as React.CSSProperties}
                  />
                  {p.nome}
                </label>
              ))}
              {!achados.length && <p className="text-suave">Nenhum profissional encontrado.</p>}
            </div>
            <div className="lg:min-h-0 lg:flex-1 [&>.cartao]:h-full [&>.cartao]:overflow-y-auto">
              <ListaRetornos />
            </div>
          </aside>
        )}
        <section className="min-w-0 flex-1 space-y-3">
          {lista.isError && <p className="text-perigo">{mensagemDeErro(lista.error)}</p>}

          {visao === 'dia' && (
            <VisaoDia
              acima={filtrosNoTopo ? '14.75rem' : '10.75rem'}
              data={data}
              hoje={hoje}
              colunas={colunas}
              itens={itens}
              podeEditar={podeEditar}
              aoAbrir={setAberto}
              aoNovo={(inicio, profissionalId) => abrirNovo({ inicio, profissionalId })}
              aoSoltar={(a, inicio, profissionalId) =>
                setMover({ a, data, inicio, profissionalId })
              }
            />
          )}
          {visao === 'semana' && (
            <VisaoSemana
              de={de}
              acima={filtrosNoTopo ? '14.75rem' : '10.75rem'}
              hoje={hoje}
              itens={itens}
              carregando={lista.isPending}
              aoAbrir={setAberto}
              aoDia={(d) => {
                setData(d)
                setVisao('dia')
              }}
            />
          )}
          {visao === 'mes' && (
            <VisaoMes
              de={de}
              mes={data.slice(0, 7)}
              hoje={hoje}
              itens={itens}
              aoDia={(d) => {
                setData(d)
                setVisao('dia')
              }}
            />
          )}
          <LegendaCategorias />
        </section>
      </div>

      <Dialogo
        aberto={!!novo}
        aoFechar={() => setNovo(null)}
        titulo={novo?.tipo === 'COMPROMISSO' ? 'Novo compromisso' : 'Nova consulta'}
        largo
      >
        {novo && <NovoAgendamento inicial={novo} aoTerminar={() => setNovo(null)} />}
      </Dialogo>

      <Dialogo aberto={retorno} aoFechar={() => setRetorno(false)} titulo="Alerta de retorno">
        <NovoRetorno aoTerminar={() => setRetorno(false)} />
      </Dialogo>

      <Dialogo aberto={!!aberto} aoFechar={() => setAberto(null)} titulo="Agendamento">
        {aberto && (
          <CartaoConsulta a={aberto} podeEditar={podeEditar} aoFechar={() => setAberto(null)} />
        )}
      </Dialogo>

      <Dialogo aberto={!!mover} aoFechar={() => setMover(null)} titulo="Mover agendamento">
        {mover && (
          <div className="space-y-4">
            <p>
              Mover <strong>{nomeDe(mover.a)}</strong> de {mover.a.inicio}–{mover.a.fim} para{' '}
              {mover.inicio}–
              {paraHora(
                paraMinutos(mover.inicio) + paraMinutos(mover.a.fim) - paraMinutos(mover.a.inicio),
              )}
              {mover.profissionalId !== mover.a.profissional.id &&
                `, com ${prof.profissionais.find((p) => p.id === mover.profissionalId)?.nome}`}
              ?
            </p>
            <div className="flex justify-end gap-2">
              <button className="botao-leve" onClick={() => setMover(null)}>
                Cancelar
              </button>
              <button
                className="botao"
                disabled={moverMut.isPending}
                onClick={() => moverMut.mutate(mover)}
              >
                Mover
              </button>
            </div>
          </div>
        )}
      </Dialogo>
    </div>
  )
}

/** Uma coluna por profissional, linhas de 15 min (R-021), linha do horário atual. */
function VisaoDia(props: {
  data: string
  /** Espaço acima da grade (cabeçalho e filtros), para ela caber na tela. */
  acima: string
  hoje: string
  colunas: { id: number; nome: string; corAgenda: string | null }[]
  itens: Agendamento[]
  podeEditar: boolean
  aoAbrir: (a: Agendamento) => void
  aoNovo: (inicio: string, profissionalId: number) => void
  aoSoltar: (a: Agendamento, inicio: string, profissionalId: number) => void
}) {
  const corDe = useCorDe()
  const [agora, setAgora] = useState(() => new Date())
  const [foco, setFoco] = useState<number | null>(null) // linha sob o mouse
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])
  const base = paraMinutos(HORARIOS[0])
  const minutosAgora = agora.getHours() * 60 + agora.getMinutes()
  const fimDia = paraMinutos(HORARIOS.at(-1)!) + INTERVALO
  const mostrarAgora = props.data === props.hoje && minutosAgora >= base && minutosAgora <= fimDia
  const fechado = !diaComExpediente(props.data)
  // Sobrepostos dividem a coluna do profissional; com encaixe ela ganha fatia maior da largura.
  const lados = new Map(
    props.colunas.map((c) => [
      c.id,
      ladoALado(props.itens.filter((a) => a.profissional.id === c.id)),
    ]),
  )
  const fatia = (id: number) => Math.max(1, ...[...lados.get(id)!.values()].map((x) => x.colunas))
  // Todos os profissionais cabem na largura da tela, sem rolar para o lado: as colunas encolhem
  // por igual. Cada uma vai até 380px (com encaixe, 190px por consulta lado a lado).
  const maximo = (id: number) => Math.max(LARGURA_MAXIMA, (LARGURA_MAXIMA / 2) * fatia(id)) // px
  const grade = {
    gridTemplateColumns: `4rem ${props.colunas.map((c) => `minmax(0, ${maximo(c.id) / LARGURA_MAXIMA}fr)`).join(' ')}`,
    maxWidth: `calc(4rem + ${props.colunas.reduce((t, c) => t + maximo(c.id), 0)}px)`,
  }

  if (!props.colunas.length)
    return <p className="cartao text-suave">Nenhum profissional selecionado.</p>

  return (
    <div
      className="cartao overflow-x-hidden overflow-y-auto p-0"
      style={{ maxHeight: `calc(100vh - ${props.acima})` }}
    >
      <div className="sticky top-0 z-30 grid bg-superficie" style={grade}>
        <div className="border-b border-borda" />
        {props.colunas.map((c) => {
          const cor = c.corAgenda ?? COR_PADRAO
          return (
            <div
              key={c.id}
              className="border-b-4 border-l border-l-borda px-2 py-2"
              style={{ borderBottomColor: cor, backgroundColor: clara(cor, 22) }}
            >
              <p className="truncate font-medium">{c.nome}</p>
              <p className="truncate text-suave">
                Pacientes:{' '}
                {
                  props.itens.filter((a) => a.profissional.id === c.id && a.tipo === 'CONSULTA')
                    .length
                }
              </p>
            </div>
          )
        })}
      </div>

      <div
        className="relative grid"
        style={grade}
        onMouseMove={(e) => {
          const i = Math.floor((e.clientY - e.currentTarget.getBoundingClientRect().top) / ALTURA)
          setFoco(i >= 0 && i < HORARIOS.length ? i : null)
        }}
        onMouseLeave={() => setFoco(null)}
      >
        <div>
          {HORARIOS.map((h, i) => (
            <div
              key={h}
              style={{ height: ALTURA }}
              className={`flex items-start justify-end border-b border-borda/50 pt-0.5 pr-2 text-xs ${
                foco === i
                  ? 'bg-secundaria/25 font-semibold text-texto'
                  : h.endsWith(':00')
                    ? 'font-medium text-texto'
                    : 'text-suave'
              }`}
            >
              {h}
            </div>
          ))}
        </div>
        {props.colunas.map((c) => {
          const doProf = props.itens.filter((a) => a.profissional.id === c.id)
          const lado = lados.get(c.id)!
          return (
            <div
              key={c.id}
              className={`relative border-l border-borda ${fechado ? 'bg-borda/30' : ''}`}
              style={
                fechado ? undefined : { backgroundColor: clara(c.corAgenda ?? COR_PADRAO, 12) }
              }
            >
              {HORARIOS.map((h) => (
                <button
                  key={h}
                  type="button"
                  style={{ height: ALTURA }}
                  aria-label={`Marcar às ${h} com ${c.nome}`}
                  disabled={!props.podeEditar || fechado}
                  onClick={() => props.aoNovo(h, c.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const a = props.itens.find(
                      (x) => x.id === Number(e.dataTransfer.getData('text/plain')),
                    )
                    if (a && (a.inicio !== h || a.profissional.id !== c.id))
                      props.aoSoltar(a, h, c.id)
                  }}
                  className={`group flex w-full items-center justify-center overflow-hidden border-b border-borda/50 hover:bg-secundaria/20 disabled:hover:bg-transparent ${h.endsWith(':00') ? 'border-borda' : ''}`}
                >
                  <span className="hidden items-center gap-1 text-sm font-semibold text-secundaria group-enabled:group-hover:flex">
                    <Icone nome="agenda" className="h-5 w-5" />
                    {h}
                  </span>
                </button>
              ))}
              {doProf.map((a) => {
                const topo = ((paraMinutos(a.inicio) - base) / INTERVALO) * ALTURA
                const altura =
                  Math.max(1, (paraMinutos(a.fim) - paraMinutos(a.inicio)) / INTERVALO) * ALTURA
                // Sobrepostos dividem a coluna; o encaixe ganha etiqueta e contorno tracejado.
                const { coluna, colunas, encaixe } = lado.get(a.id)!
                return (
                  <button
                    key={a.id}
                    type="button"
                    draggable={props.podeEditar}
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', String(a.id))}
                    onClick={() => props.aoAbrir(a)}
                    className={`@container absolute z-10 flex flex-col justify-center overflow-hidden rounded border-l-4 px-1.5 text-left text-xs leading-tight shadow-sm hover:z-20 hover:brightness-95 ${
                      encaixe ? 'outline-2 -outline-offset-2 outline-aviso outline-dashed' : ''
                    }`}
                    style={{
                      top: topo + 2,
                      height: altura - 4,
                      left: `calc(${(coluna / colunas) * 100}% + 4px)`,
                      width: `calc(${100 / colunas}% - ${colunas > 1 ? 6 : 8}px)`,
                      backgroundColor: clara(corDe(a), 35),
                      borderLeftColor: STATUS[a.status].cor,
                    }}
                    title={`${encaixe ? 'Encaixe: ' : ''}${nomeDe(a)}, ${a.inicio}–${a.fim} · ${STATUS[a.status].rotulo}`}
                  >
                    {encaixe && (
                      <span className="hidden w-fit rounded bg-aviso @min-[5.5rem]:block px-1 text-[10px] leading-3.5 font-bold text-superficie uppercase">
                        Encaixe
                      </span>
                    )}
                    <span className="truncate">
                      <span className="font-medium">{nomeDe(a)}</span>, {a.inicio}–{a.fim}
                    </span>
                    {altura > ALTURA && a.tipo === 'CONSULTA' && (
                      <span className="truncate text-suave">{STATUS[a.status].rotulo}</span>
                    )}
                  </button>
                )
              })}
            </div>
          )
        })}

        {foco !== null && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 z-0 bg-secundaria/15"
            style={{ top: foco * ALTURA, height: ALTURA }}
          />
        )}
        {mostrarAgora && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 z-20 h-0.5 bg-perigo"
            style={{ top: ((minutosAgora - base) / INTERVALO) * ALTURA }}
          >
            <span className="absolute -top-2 left-0 rounded bg-perigo px-1 text-[10px] leading-4 font-semibold text-white">
              {paraHora(minutosAgora)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function VisaoSemana(props: {
  de: string
  /** Espaço acima (cabeçalho e filtros), para a semana caber na tela como a grade do dia. */
  acima: string
  hoje: string
  itens: Agendamento[]
  carregando: boolean
  aoAbrir: (a: Agendamento) => void
  aoDia: (d: string) => void
}) {
  const corDe = useCorDe()
  const dias = Array.from({ length: 6 }, (_, i) => somarDias(props.de, i)) // domingo fechado
  return (
    // Cabe na tela: a lista de cada dia rola por dentro, a página não cresce.
    <div
      className="grid gap-2 sm:grid-cols-[repeat(3,minmax(0,1fr))] lg:h-[calc(100vh-var(--acima))] lg:grid-cols-[repeat(6,minmax(0,1fr))]"
      style={{ '--acima': props.acima } as React.CSSProperties}
    >
      {dias.map((d, i) => {
        const doDia = props.itens.filter((a) => a.data === d)
        return (
          <div
            key={d}
            className={`cartao flex min-h-40 min-w-0 flex-col gap-1 p-2 ${d === props.hoje ? 'border-primaria' : ''}`}
          >
            <button
              type="button"
              className="flex w-full shrink-0 items-center justify-between gap-1 text-left font-medium hover:text-primaria"
              onClick={() => props.aoDia(d)}
            >
              <span className="truncate">
                {SEMANA[i]} {d.slice(8)}/{d.slice(5, 7)}
              </span>
              {doDia.length > 0 && (
                <span className="rounded-full bg-primaria-clara px-1.5 text-[11px] font-bold text-primaria tabular-nums">
                  {doDia.length}
                </span>
              )}
            </button>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
              {!doDia.length && (
                <p className="text-suave">
                  {props.carregando ? 'Carregando…' : 'Sem agendamentos'}
                </p>
              )}
              {doDia.map((a) => (
                <button
                  key={a.id}
                  onClick={() => props.aoAbrir(a)}
                  className="block w-full truncate rounded border-l-4 px-1.5 py-0.5 text-left text-xs"
                  style={{
                    backgroundColor: `${corDe(a)}26`,
                    borderLeftColor: STATUS[a.status].cor,
                  }}
                  title={`${a.profissional.nome} · ${STATUS[a.status].rotulo}`}
                >
                  {a.inicio} {nomeDe(a)}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function VisaoMes(props: {
  de: string
  mes: string
  hoje: string
  itens: Agendamento[]
  aoDia: (d: string) => void
}) {
  const corDe = useCorDe()
  const dias = Array.from({ length: 42 }, (_, i) => somarDias(props.de, i))
  const porDia = new Map<string, Agendamento[]>()
  for (const a of props.itens) porDia.set(a.data, [...(porDia.get(a.data) ?? []), a])
  const consultasDo = (d: string) => (porDia.get(d) ?? []).filter((a) => a.tipo === 'CONSULTA')
  const doMes = dias.filter((d) => d.startsWith(props.mes))
  const consultas = doMes.flatMap(consultasDo)
  const maisCheio = doMes.reduce((m, d) => (consultasDo(d).length > consultasDo(m).length ? d : m))
  const maximo = Math.max(1, consultasDo(maisCheio).length)
  const contar = (...s: (keyof typeof STATUS)[]) =>
    consultas.filter((a) => s.includes(a.status)).length
  const resumo = [
    { rotulo: 'Consultas', valor: consultas.length, cor: 'var(--primaria)' },
    { rotulo: 'Atendidas', valor: contar('ATENDIDO'), cor: STATUS.ATENDIDO.cor },
    { rotulo: 'Confirmadas', valor: contar('CONFIRMADO'), cor: STATUS.CONFIRMADO.cor },
    { rotulo: 'A confirmar', valor: contar('AGENDADO'), cor: STATUS.AGENDADO.cor },
    { rotulo: 'Faltas', valor: contar('FALTOU'), cor: STATUS.FALTOU.cor },
  ]
  // Mapa de calor: quanto mais consultas no dia, mais forte o fundo (5 níveis).
  const TONS = [0, 6, 12, 19, 27]
  const nivel = (n: number) => (n ? Math.ceil((n / maximo) * 4) : 0)
  const curto = (d: string) =>
    new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {resumo.map((r) => (
          <div key={r.rotulo} className="cartao flex items-center gap-3 px-4 py-3">
            <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: r.cor }} />
            <div className="min-w-0">
              <p className="text-2xl leading-none font-extrabold tabular-nums">{r.valor}</p>
              <p className="truncate text-xs text-suave">{r.rotulo}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="cartao overflow-x-auto p-0">
        <div className="grid min-w-[46rem] grid-cols-[repeat(7,minmax(0,1fr))]">
          {SEMANA.map((s) => (
            <div
              key={s}
              className={`border-b border-borda px-3 py-2 text-xs font-bold tracking-wide uppercase ${s === 'Dom' ? 'text-suave/60' : 'text-suave'}`}
            >
              {s}
            </div>
          ))}
          {dias.map((d, i) => {
            const lista = porDia.get(d) ?? []
            const n = consultasDo(d).length
            const fora = !d.startsWith(props.mes)
            const domingo = i % 7 === 6
            const ehHoje = d === props.hoje
            const tom = fora ? 0 : TONS[nivel(n)]
            return (
              <button
                key={d}
                type="button"
                onClick={() => props.aoDia(d)}
                aria-label={`${curto(d)}: ${n} consultas`}
                className={`group relative flex min-h-26 flex-col gap-1 border-b border-l border-borda p-1.5 text-left transition first:border-l-0 hover:z-10 hover:shadow-lg hover:ring-2 hover:ring-primaria/50 ${
                  fora ? 'opacity-40' : ''
                } ${domingo ? LISTRA_FECHADO : ''} ${i % 7 === 0 ? 'border-l-0' : ''}`}
                style={tom ? { backgroundColor: clara('var(--primaria)', tom) } : undefined}
              >
                <span className="flex items-center justify-between gap-1">
                  <span
                    className={`grid h-7 min-w-7 place-items-center rounded-full px-1.5 text-sm font-bold whitespace-nowrap ${
                      ehHoje
                        ? 'bg-primaria text-sobre-primaria shadow'
                        : d.endsWith('-01')
                          ? 'text-primaria'
                          : ''
                    }`}
                  >
                    {d.endsWith('-01') ? curto(d) : Number(d.slice(8))}
                  </span>
                  {n > 0 && (
                    <span className="rounded-full bg-superficie/80 px-1.5 text-[11px] font-bold text-primaria tabular-nums shadow-sm">
                      {n}
                    </span>
                  )}
                </span>
                {domingo ? (
                  !fora && <span className="m-auto text-xs text-suave">Fechado</span>
                ) : (
                  <>
                    {lista.slice(0, 3).map((a) => (
                      <span
                        key={a.id}
                        className={`flex min-w-0 items-center gap-1 rounded-md bg-superficie/75 px-1 py-px text-[11px] ${
                          a.status === 'FALTOU' ? 'line-through opacity-60' : ''
                        }`}
                        title={`${a.inicio} ${nomeDe(a)} · ${STATUS[a.status].rotulo}`}
                      >
                        <span
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: corDe(a) }}
                        />
                        <span className="text-suave tabular-nums">{a.inicio}</span>
                        <span className="truncate font-medium">{nomeDe(a)}</span>
                      </span>
                    ))}
                    {lista.length > 3 && (
                      <span className="px-1 text-[11px] font-bold text-primaria group-hover:underline">
                        +{lista.length - 3} mais
                      </span>
                    )}
                  </>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-1 text-xs text-suave">
        <span className="flex items-center gap-1.5">
          Menos
          {TONS.map((t) => (
            <span
              key={t}
              className="size-3.5 rounded border border-borda"
              style={{ backgroundColor: t ? clara('var(--primaria)', t) : 'var(--superficie)' }}
            />
          ))}
          Mais movimento
        </span>
        {consultasDo(maisCheio).length > 0 && (
          <span>
            Dia mais cheio:{' '}
            <button
              type="button"
              className="font-bold text-primaria hover:underline"
              onClick={() => props.aoDia(maisCheio)}
            >
              {curto(maisCheio)} ({consultasDo(maisCheio).length} consultas)
            </button>
          </span>
        )}
      </div>
    </div>
  )
}
