import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import {
  api,
  consultaEu,
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
  paraHora,
  paraMinutos,
  type Categoria,
} from '../../../shared/agenda'
import { Dialogo } from '../componentes/Dialogo'
import { NovoAgendamento, type Inicial } from '../componentes/NovoAgendamento'
import { CartaoConsulta } from '../componentes/CartaoConsulta'
import { COR_PADRAO } from './Profissionais'
import { ListaRetornos, NovoRetorno } from '../componentes/Retornos'
import { CampoData } from '../componentes/CampoData'

type Visao = 'dia' | 'semana' | 'mes'
const VISOES: Record<Visao, string> = { dia: 'Dia', semana: 'Semana', mes: 'Mês' }
const SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const ALTURA = 24 // px por intervalo de 15 min

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

const corDe = (a: Agendamento) =>
  a.tipo === 'COMPROMISSO' ? '#6b7280' : (CATEGORIAS[a.categoria as Categoria] ?? '#0f766e')
const nomeDe = (a: Agendamento) => a.paciente?.nome ?? a.titulo ?? 'Compromisso'

export function Agenda() {
  const { data: eu } = useSuspenseQuery(consultaEu)
  const { data: prof } = useSuspenseQuery(consultaProfissionais)
  const podeEditar = pode(eu.perfis, 'agenda.editar')
  const qc = useQueryClient()

  const hoje = isoLocal(new Date())
  const [data, setData] = useState(hoje)
  const [visao, setVisao] = useState<Visao>(lerVisao)
  const [marcados, setMarcados] = useState<number[]>([]) // vazio = todos
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
    queryKey: ['agenda', de, ate, marcados],
    queryFn: async () =>
      (
        await api.get<Agendamento[]>('/agenda', {
          params: { de, ate, profissionais: marcados.join(',') || undefined },
        })
      ).data,
  })
  const itens = lista.data ?? []
  const colunas = prof.profissionais.filter((p) => !marcados.length || marcados.includes(p.id))

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
    setMarcados((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]))
  }

  const abrirNovo = (i: Partial<Inicial> = {}) => {
    setMenu(false)
    setNovo({ tipo: 'CONSULTA', data, ...i })
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <aside className="space-y-4 lg:w-60 lg:shrink-0">
        {/* key: ao trocar de mês na agenda, o minicalendário volta para esse mês */}
        <MiniCalendario key={data.slice(0, 7)} data={data} hoje={hoje} aoEscolher={setData} />
        <div className="cartao space-y-2">
          <p className="font-medium">Profissionais</p>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!marcados.length} onChange={() => setMarcados([])} />
            Todos
          </label>
          {prof.profissionais.map((p) => (
            <label key={p.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={marcados.includes(p.id)}
                onChange={() => alternar(p.id)}
                style={{ accentColor: p.corAgenda ?? COR_PADRAO }}
              />
              {p.nome}
            </label>
          ))}
        </div>
        <ListaRetornos podeEditar={podeEditar} />
      </aside>

      <section className="min-w-0 flex-1 space-y-3">
        <header className="flex flex-wrap items-center gap-2">
          {podeEditar && (
            <div className="relative">
              <button className="botao" aria-expanded={menu} onClick={() => setMenu(!menu)}>
                Novo ▾
              </button>
              {menu && (
                <ul
                  className="cartao absolute z-20 mt-1 w-56 p-1 shadow-lg"
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
          <button className="botao-leve py-1.5" onClick={() => passo(-1)} aria-label="Anterior">
            ‹
          </button>
          <button className="botao-leve py-1.5" onClick={() => setData(hoje)}>
            Hoje
          </button>
          <button className="botao-leve py-1.5" onClick={() => passo(1)} aria-label="Próximo">
            ›
          </button>
          <CampoData
            className="w-36"
            value={data}
            onChange={(v) => v && setData(v)}
            aria-label="Ir para a data"
          />
          <h1 className="text-lg font-semibold first-letter:uppercase">{titulo(visao, data)}</h1>
          <div className="ml-auto flex gap-1" role="group" aria-label="Visualizar por">
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
        </header>

        {lista.isError && <p className="text-perigo">{mensagemDeErro(lista.error)}</p>}

        {visao === 'dia' && (
          <VisaoDia
            data={data}
            hoje={hoje}
            colunas={colunas}
            itens={itens}
            podeEditar={podeEditar}
            aoAbrir={setAberto}
            aoNovo={(inicio, profissionalId) => abrirNovo({ inicio, profissionalId })}
            aoSoltar={(a, inicio, profissionalId) => setMover({ a, data, inicio, profissionalId })}
          />
        )}
        {visao === 'semana' && (
          <VisaoSemana
            de={de}
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
      </section>

      <Dialogo
        aberto={!!novo}
        aoFechar={() => setNovo(null)}
        titulo={novo?.tipo === 'COMPROMISSO' ? 'Novo compromisso' : 'Nova consulta'}
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
  hoje: string
  colunas: { id: number; nome: string; corAgenda: string | null }[]
  itens: Agendamento[]
  podeEditar: boolean
  aoAbrir: (a: Agendamento) => void
  aoNovo: (inicio: string, profissionalId: number) => void
  aoSoltar: (a: Agendamento, inicio: string, profissionalId: number) => void
}) {
  const [agora, setAgora] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  const base = paraMinutos(HORARIOS[0])
  const minutosAgora = agora.getHours() * 60 + agora.getMinutes()
  const fimDia = paraMinutos(HORARIOS.at(-1)!) + INTERVALO
  const mostrarAgora = props.data === props.hoje && minutosAgora >= base && minutosAgora <= fimDia
  const fechado = !diaComExpediente(props.data)

  if (!props.colunas.length)
    return <p className="cartao text-suave">Nenhum profissional cadastrado.</p>

  return (
    <div className="cartao overflow-auto p-0" style={{ maxHeight: 'calc(100vh - 11rem)' }}>
      <div
        className="grid min-w-max"
        style={{ gridTemplateColumns: `4rem repeat(${props.colunas.length}, minmax(11rem, 1fr))` }}
      >
        <div className="sticky top-0 z-10 border-b border-borda bg-superficie" />
        {props.colunas.map((c) => (
          <div
            key={c.id}
            className="sticky top-0 z-10 border-b-4 border-l border-l-borda bg-superficie px-2 py-2"
            style={{ borderBottomColor: c.corAgenda ?? COR_PADRAO }}
          >
            <p className="truncate font-medium">{c.nome}</p>
            <p className="text-suave">
              Pacientes:{' '}
              {
                props.itens.filter((a) => a.profissional.id === c.id && a.tipo === 'CONSULTA')
                  .length
              }
            </p>
          </div>
        ))}

        <div className="relative">
          {HORARIOS.map((h) => (
            <div
              key={h}
              style={{ height: ALTURA }}
              className="border-b border-borda/50 pr-2 text-right text-xs text-suave"
            >
              {h.endsWith(':00') && h}
            </div>
          ))}
        </div>
        {props.colunas.map((c) => (
          <div
            key={c.id}
            className={`relative border-l border-borda ${fechado ? 'bg-borda/30' : ''}`}
            style={fechado ? undefined : { backgroundColor: `${c.corAgenda ?? COR_PADRAO}0f` }}
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
                className={`block w-full border-b border-borda/50 hover:bg-primaria-clara disabled:hover:bg-transparent ${h.endsWith(':00') ? 'border-borda' : ''}`}
              />
            ))}
            {props.itens
              .filter((a) => a.profissional.id === c.id)
              .map((a) => {
                const topo = ((paraMinutos(a.inicio) - base) / INTERVALO) * ALTURA
                const altura =
                  Math.max(1, (paraMinutos(a.fim) - paraMinutos(a.inicio)) / INTERVALO) * ALTURA
                return (
                  <button
                    key={a.id}
                    type="button"
                    draggable={props.podeEditar}
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', String(a.id))}
                    onClick={() => props.aoAbrir(a)}
                    className="absolute inset-x-1 overflow-hidden rounded border-l-4 px-1.5 text-left text-xs leading-tight shadow-sm"
                    style={{
                      top: topo + 1,
                      height: altura - 2,
                      backgroundColor: `${corDe(a)}26`,
                      borderLeftColor: STATUS[a.status].cor,
                    }}
                    title={`${nomeDe(a)}, ${a.inicio}–${a.fim} · ${STATUS[a.status].rotulo}`}
                  >
                    <span className="font-medium">{nomeDe(a)}</span>, {a.inicio}–{a.fim}
                    {altura > ALTURA && a.tipo === 'CONSULTA' && (
                      <span className="block text-suave">{STATUS[a.status].rotulo}</span>
                    )}
                  </button>
                )
              })}
            {mostrarAgora && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-perigo"
                style={{ top: ((minutosAgora - base) / INTERVALO) * ALTURA }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function VisaoSemana(props: {
  de: string
  hoje: string
  itens: Agendamento[]
  carregando: boolean
  aoAbrir: (a: Agendamento) => void
  aoDia: (d: string) => void
}) {
  const dias = Array.from({ length: 6 }, (_, i) => somarDias(props.de, i)) // domingo fechado
  return (
    <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {dias.map((d, i) => {
        const doDia = props.itens.filter((a) => a.data === d)
        return (
          <div
            key={d}
            className={`cartao min-h-40 space-y-1 p-2 ${d === props.hoje ? 'border-primaria' : ''}`}
          >
            <button
              className="w-full text-left font-medium hover:text-primaria"
              onClick={() => props.aoDia(d)}
            >
              {SEMANA[i]} {d.slice(8)}/{d.slice(5, 7)}
            </button>
            {!doDia.length && (
              <p className="text-suave">{props.carregando ? 'Carregando…' : 'Sem agendamentos'}</p>
            )}
            {doDia.map((a) => (
              <button
                key={a.id}
                onClick={() => props.aoAbrir(a)}
                className="block w-full truncate rounded border-l-4 px-1.5 py-0.5 text-left text-xs"
                style={{ backgroundColor: `${corDe(a)}26`, borderLeftColor: STATUS[a.status].cor }}
                title={`${a.profissional.nome} · ${STATUS[a.status].rotulo}`}
              >
                {a.inicio} {nomeDe(a)}
              </button>
            ))}
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
  const dias = Array.from({ length: 42 }, (_, i) => somarDias(props.de, i))
  return (
    <div className="cartao overflow-x-auto p-0">
      <div className="grid min-w-[42rem] grid-cols-7">
        {SEMANA.map((s) => (
          <div key={s} className="border-b border-borda px-2 py-1 font-medium text-suave">
            {s}
          </div>
        ))}
        {dias.map((d) => {
          const doDia = props.itens.filter((a) => a.data === d)
          const fora = !d.startsWith(props.mes)
          return (
            <button
              key={d}
              onClick={() => props.aoDia(d)}
              className={`min-h-24 border-b border-l border-borda p-1 text-left align-top hover:bg-primaria-clara ${fora ? 'opacity-40' : ''}`}
            >
              <span
                className={`inline-block rounded-full px-1.5 ${d === props.hoje ? 'bg-primaria text-white dark:text-black' : ''}`}
              >
                {Number(d.slice(8))}
              </span>
              {doDia.slice(0, 3).map((a) => (
                <span key={a.id} className="block truncate text-xs">
                  {a.inicio} {nomeDe(a)}
                </span>
              ))}
              {doDia.length > 3 && (
                <span className="block text-xs text-suave">+{doDia.length - 3}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Minicalendário da lateral: clicar num dia abre esse dia na agenda. */
function MiniCalendario(props: { data: string; hoje: string; aoEscolher: (d: string) => void }) {
  const [mes, setMes] = useState(props.data.slice(0, 7))
  const primeiro = `${mes}-01`
  const inicio = somarDias(primeiro, -new Date(`${primeiro}T12:00:00`).getDay()) // começa no domingo
  const dias = Array.from({ length: 42 }, (_, i) => somarDias(inicio, i))
  const trocar = (dir: number) => {
    const d = new Date(`${primeiro}T12:00:00`)
    d.setMonth(d.getMonth() + dir)
    setMes(isoLocal(d).slice(0, 7))
  }
  return (
    <div className="cartao p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          className="px-2 text-suave hover:text-texto"
          onClick={() => trocar(-1)}
          aria-label="Mês anterior"
        >
          ‹
        </button>
        <span className="font-medium first-letter:uppercase">
          {new Date(`${primeiro}T12:00:00`).toLocaleDateString('pt-BR', {
            month: 'long',
            year: 'numeric',
          })}
        </span>
        <button
          className="px-2 text-suave hover:text-texto"
          onClick={() => trocar(1)}
          aria-label="Próximo mês"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-xs">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
          <span key={i} className="py-1 text-suave">
            {d}
          </span>
        ))}
        {dias.map((d) => (
          <button
            key={d}
            onClick={() => props.aoEscolher(d)}
            aria-label={d.split('-').reverse().join('/')}
            aria-current={d === props.data ? 'date' : undefined}
            className={`m-0.5 rounded-full py-1 ${d === props.data ? 'bg-primaria font-semibold text-white dark:text-black' : d === props.hoje ? 'text-primaria font-semibold' : 'hover:bg-primaria-clara'} ${d.startsWith(mes) ? '' : 'opacity-40'}`}
          >
            {Number(d.slice(8))}
          </button>
        ))}
      </div>
    </div>
  )
}
