import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  api,
  consultaConfig,
  consultaProfissionais,
  errosDosCampos,
  isoLocal,
  mensagemDeErro,
  somarDias,
  type Agendamento,
  type Paciente,
} from '../api'
import { avisar } from '../estado'
import {
  AVISO_MESMO_DIA,
  CANAIS,
  CATEGORIAS,
  HORARIOS,
  INTERVALO,
  clicarHorario,
  diaComExpediente,
  paraHora,
  paraMinutos,
} from '../../../shared/agenda'
import { Avatar, BuscaPaciente, CampoBusca, iniciais } from './BuscaPaciente'
import { Icone } from './Icones'
import { MiniCalendario } from './MiniCalendario'
import { COR_PADRAO } from '../paginas/Profissionais'
import { CampoSelect } from './CampoSelect'

export interface Inicial {
  tipo: 'CONSULTA' | 'COMPROMISSO'
  data: string
  inicio?: string
  profissionalId?: number
  /** Já escolhido (aberto da ficha do paciente). */
  paciente?: Paciente
}

const PERIODOS = [
  { nome: 'Manhã', ate: 12 * 60 },
  { nome: 'Tarde', ate: 18 * 60 },
  { nome: 'Noite', ate: 24 * 60 },
]

type Estado = 'livre' | 'ocupado' | 'passou'

const duracaoTexto = (m: number) =>
  m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}`

const noDia = (iso: string) => new Date(`${iso}T12:00:00`)
const formatar = (iso: string, op: Intl.DateTimeFormatOptions) => {
  const t = noDia(iso).toLocaleDateString('pt-BR', op).replace('.', '')
  return t[0].toUpperCase() + t.slice(1)
}
const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Segunda-feira da semana; domingo (fechado) pula para a semana seguinte. */
function segundaDe(iso: string) {
  const d = noDia(iso).getDay()
  return somarDias(iso, d === 0 ? 1 : 1 - d)
}

/** Dia anterior/seguinte, pulando o domingo. */
function outroDia(iso: string, dir: 1 | -1) {
  const d = somarDias(iso, dir)
  return diaComExpediente(d) ? d : somarDias(d, dir)
}

interface Marcacao {
  data: string
  inicio: string
  ultimo: string // último horário da faixa (inclusive); vazio = só o início
  clicado: string // último horário clicado: clicar de novo nele limpa
  profissionalId: number | ''
  categoria: string
}

const SEM_HORARIO = { inicio: '', ultimo: '', clicado: '' }

const fimDe = (m: Marcacao) =>
  m.inicio ? paraHora(paraMinutos(m.ultimo || m.inicio) + INTERVALO) : ''

/** "hh:mm" → agendamento que já ocupa aquele intervalo no dia. */
function ocupacao(lista: Agendamento[], dia: string) {
  const m = new Map<string, Agendamento>()
  for (const a of lista)
    if (a.data === dia)
      for (let t = paraMinutos(a.inicio); t < paraMinutos(a.fim); t += INTERVALO)
        m.set(paraHora(t), a)
  return m
}

/** Conteúdo do diálogo "Nova consulta" / "Novo compromisso" (C-001). */
export function NovoAgendamento(props: { inicial: Inicial; aoTerminar: () => void }) {
  const qc = useQueryClient()
  const { data: prof } = useQuery(consultaProfissionais)
  const { data: cats = CATEGORIAS as Record<string, string> } = useQuery(
    consultaConfig('categorias'),
  )
  const [tipo, setTipo] = useState(props.inicial.tipo)
  // Uma ou várias marcações para o mesmo paciente; a tela edita sempre a "ativa".
  const [marcacoes, setMarcacoes] = useState<Marcacao[]>([
    {
      data: props.inicial.data,
      inicio: props.inicial.inicio ?? '',
      ultimo: '',
      clicado: props.inicial.inicio ?? '',
      profissionalId: props.inicial.profissionalId ?? prof?.meuId ?? '',
      categoria: '',
    },
  ])
  const [ativa, setAtiva] = useState(0)
  const [multiplos, setMultiplos] = useState(false)
  const { data, inicio, ultimo, profissionalId, categoria } = marcacoes[ativa]
  const alterar = (p: Partial<Marcacao>) =>
    setMarcacoes((ms) => ms.map((m, i) => (i === ativa ? { ...m, ...p } : m)))
  const [sobre, setSobre] = useState('') // horário sob o mouse, para a prévia da faixa
  const [encaixe, setEncaixe] = useState(false)
  const [calendario, setCalendario] = useState(false)
  const [buscaProf, setBuscaProf] = useState('')
  const [paciente, setPaciente] = useState<Paciente | null>(props.inicial.paciente ?? null)
  const [titulo, setTitulo] = useState('')
  // Decisão da clínica: confirmação e lembrete por WhatsApp de saída (o estudo, R-027, vinha desligado).
  const [avisos, setAvisos] = useState({ confirmacao: 'WHATSAPP', alerta: 'WHATSAPP' })

  // A semana de todos os profissionais numa chamada: trocar de profissional não busca de novo.
  const semana = segundaDe(data)
  const dias = Array.from({ length: 6 }, (_, i) => somarDias(semana, i))
  const agenda = useQuery({
    queryKey: ['agenda', 'livres', semana],
    queryFn: async () =>
      (await api.get<Agendamento[]>('/agenda', { params: { de: semana, ate: dias[5] } })).data,
  })
  const carregando = !agenda.data
  const agendaDe = (id: number | '') => (agenda.data ?? []).filter((a) => a.profissional.id === id)
  // As outras marcações deste lote também ocupam o horário: o paciente não está em dois lugares.
  const doLote = marcacoes.flatMap((m, i) =>
    i !== ativa && m.inicio
      ? [
          {
            id: -1 - i,
            data: m.data,
            inicio: m.inicio,
            fim: fimDe(m),
            titulo: `Marcação ${i + 1}`,
            paciente: null,
          } as unknown as Agendamento,
        ]
      : [],
  )
  const mapas = Object.fromEntries(
    dias.map((d) => [d, ocupacao([...agendaDe(profissionalId), ...doLote], d)]),
  )
  const ocupados = mapas[data] ?? new Map<string, Agendamento>()

  const agora = new Date()
  const hoje = isoLocal(agora)
  const agoraMin = agora.getHours() * 60 + agora.getMinutes()
  const passou = (dia: string, h: string) =>
    dia < hoje || (dia === hoje && paraMinutos(h) < agoraMin)
  const estadoEm = (dia: string, h: string, oc = mapas[dia] ?? ocupados): Estado =>
    oc.has(h) ? 'ocupado' : passou(dia, h) ? 'passou' : 'livre'
  // Livres do dia: só depende da agenda, nunca do horário que está sendo escolhido.
  const livresNo = (dia: string, oc = mapas[dia]) =>
    HORARIOS.filter((h) => estadoEm(dia, h, oc) === 'livre').length

  const semLivres = (dia: string) =>
    HORARIOS.some((h) => !passou(dia, h)) ? 'lotado' : 'encerrado'

  const proximoLivre = (() => {
    for (const d of dias) {
      if (d < hoje) continue
      const h = HORARIOS.find((h) => estadoEm(d, h) === 'livre')
      if (h) return { dia: d, h }
    }
  })()

  // Grava uma por vez; se uma falhar, as já gravadas saem da lista e o erro aponta qual foi.
  const lote = multiplos ? marcacoes : [marcacoes[ativa]]
  const criar = useMutation({
    mutationFn: async (comum: Record<string, unknown>) => {
      for (let i = 0; i < lote.length; i++) {
        const m = lote[i]
        try {
          await api.post<Agendamento>('/agenda', {
            ...comum,
            data: m.data,
            inicio: m.inicio,
            fim: fimDe(m),
            profissionalId: m.profissionalId,
            categoria: m.categoria,
          })
        } catch (e) {
          if (i) {
            setMarcacoes(lote.slice(i))
            setAtiva(0)
            qc.invalidateQueries({ queryKey: ['agenda'] })
          }
          throw new Error(
            `${lote.length > 1 ? `Marcação ${i + 1}: ` : ''}${mensagemDeErro(e)}${i ? ` (${i} já marcada${i > 1 ? 's' : ''})` : ''}`,
          )
        }
      }
    },
    onSuccess: () => {
      avisar(
        tipo === 'COMPROMISSO'
          ? 'Compromisso criado'
          : lote.length > 1
            ? `${lote.length} consultas marcadas com sucesso`
            : 'Consulta marcada com sucesso',
      )
      qc.invalidateQueries({ queryKey: ['agenda'] })
      props.aoTerminar()
    },
    onError: (e) => avisar(e.message, true),
  })
  const erros = errosDosCampos(criar.error)
  const aberto = diaComExpediente(data)
  const fim = fimDe(marcacoes[ativa])
  const profissionais = prof?.profissionais ?? []
  const profissional = profissionais.find((p) => p.id === profissionalId)
  const filtrados = buscaProf.trim()
    ? profissionais.filter((p) => semAcento(p.nome).includes(semAcento(buscaProf.trim())))
    : profissionais
  const completa = (m: Marcacao) => !!m.profissionalId && !!m.inicio && diaComExpediente(m.data)
  const pronto = (tipo === 'CONSULTA' ? !!paciente : !!titulo.trim()) && lote.every(completa)

  // De a até b (inclusive); "hh:mm" ordena como texto. Com encaixe, nada bloqueia.
  const temOcupadoEntre = (a: string, b: string) =>
    !encaixe && HORARIOS.some((h) => h >= a && h <= b && ocupados.has(h))
  const quemNaFaixa = inicio
    ? HORARIOS.filter((h) => h >= inicio && h < fim)
        .map((h) => ocupados.get(h))
        .find(Boolean)
    : undefined

  function mudarData(d: string) {
    alterar({ data: d, ...SEM_HORARIO })
    setCalendario(false)
  }
  function mudarProfissional(id: number) {
    alterar({ profissionalId: id, ...SEM_HORARIO })
  }
  function adicionarMarcacao() {
    // A nova já vem com o dia, o profissional e a categoria da atual; só falta o horário.
    setMarcacoes((ms) => [...ms, { data, ...SEM_HORARIO, profissionalId, categoria }])
    setAtiva(marcacoes.length)
  }
  function removerMarcacao(i: number) {
    setMarcacoes((ms) => ms.filter((_, j) => j !== i))
    setAtiva((a) => (a > i || a === marcacoes.length - 1 ? Math.max(0, a - 1) : a))
  }
  function alternarMultiplos(ligar: boolean) {
    setMultiplos(ligar)
    if (!ligar) {
      setMarcacoes((ms) => [ms[ativa]])
      setAtiva(0)
    }
  }

  // Regras dos cliques em shared/agenda.ts (clicarHorario).
  const escolher = (h: string) => alterar(clicarHorario(marcacoes[ativa], h, temOcupadoEntre))
  const fimFaixa = ultimo || inicio
  // Prévia ao passar o mouse, esperando o 2º clique: só de faixa válida, para os dois lados.
  const [pa, pb] = sobre < inicio ? [sobre, inicio] : [inicio, sobre]
  const previa = !!inicio && !ultimo && !!sobre && sobre !== inicio && !temOcupadoEntre(pa, pb)

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    criar.mutate({
      tipo,
      pacienteId: paciente?.id,
      titulo,
      observacoes: f.get('observacoes'),
      primeiraConsulta: f.get('primeiraConsulta') === 'on',
      ...avisos,
    })
  }

  const erro = (campo: string) => erros[campo] && <p className="erro-campo">{erros[campo]}</p>

  return (
    <>
      <form onSubmit={enviar} className="flex flex-col gap-4 lg:h-[min(760px,calc(100dvh-11rem))]">
        {multiplos && (
          <section
            aria-label="Marcações"
            className="shrink-0 rounded-2xl border border-primaria/25 bg-primaria-clara/60 p-2"
          >
            <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
              {marcacoes.map((m, i) => {
                const p = profissionais.find((x) => x.id === m.profissionalId)
                const cor = cats[m.categoria]
                const sel = i === ativa
                const ok = completa(m)
                return (
                  <div
                    key={i}
                    className={`relative w-56 shrink-0 overflow-hidden rounded-xl border-2 bg-superficie transition ${
                      sel
                        ? 'border-primaria shadow-md'
                        : 'border-transparent hover:border-primaria/40'
                    }`}
                  >
                    {cor && (
                      <span
                        className="absolute inset-x-0 top-0 h-1"
                        style={{ backgroundColor: cor }}
                      />
                    )}
                    <button
                      type="button"
                      aria-pressed={sel}
                      onClick={() => setAtiva(i)}
                      className="flex w-full items-start gap-2.5 p-2.5 pr-7 text-left"
                    >
                      <span
                        className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-extrabold ${
                          ok
                            ? 'bg-sucesso text-superficie'
                            : sel
                              ? 'bg-primaria text-sobre-primaria'
                              : 'bg-primaria-clara text-primaria'
                        }`}
                      >
                        {ok ? '✓' : i + 1}
                      </span>
                      <span className="min-w-0 flex-1 space-y-0.5 text-xs">
                        <span
                          className={`block truncate text-sm ${p ? 'font-bold' : 'text-suave italic'}`}
                        >
                          {p?.nome ?? 'Escolha o profissional'}
                        </span>
                        <span className="flex items-center gap-1 text-suave">
                          {cor && (
                            <span
                              className="size-2 rounded-full"
                              style={{ backgroundColor: cor }}
                            />
                          )}
                          {m.categoria || 'Sem categoria'}
                        </span>
                        <span
                          className={`block tabular-nums ${m.inicio ? 'font-medium' : 'text-suave italic'}`}
                        >
                          {m.inicio
                            ? `${formatar(m.data, { weekday: 'short', day: '2-digit', month: '2-digit' })} · ${m.inicio}–${fimDe(m)}`
                            : 'Escolha o horário'}
                        </span>
                      </span>
                    </button>
                    {marcacoes.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Remover marcação ${i + 1}`}
                        onClick={() => removerMarcacao(i)}
                        className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full text-suave hover:bg-perigo/10 hover:text-perigo"
                      >
                        ×
                      </button>
                    )}
                  </div>
                )
              })}
              <button
                type="button"
                onClick={adicionarMarcacao}
                className="flex w-40 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-primaria/40 p-2 text-sm font-bold text-primaria transition hover:border-primaria hover:bg-superficie"
              >
                <Icone nome="mais" className="h-5 w-5" />
                Adicionar marcação
              </button>
            </div>
          </section>
        )}
        <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          {/* ---------- Quem ---------- */}
          <div className="flex min-h-0 flex-col gap-5 lg:overflow-y-auto lg:pr-1">
            <div
              role="tablist"
              className="grid shrink-0 grid-cols-2 rounded-xl bg-superficie-2 p-1"
            >
              {(['CONSULTA', 'COMPROMISSO'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tipo === t}
                  onClick={() => {
                    setTipo(t)
                    if (t === 'COMPROMISSO') alternarMultiplos(false)
                  }}
                  className={`rounded-lg py-1.5 font-bold transition ${
                    tipo === t
                      ? 'bg-superficie text-primaria shadow-sm'
                      : 'text-suave hover:text-texto'
                  }`}
                >
                  {t === 'CONSULTA' ? 'Consulta' : 'Compromisso'}
                </button>
              ))}
            </div>

            {tipo === 'CONSULTA' ? (
              <Passo n={1} id="passo-paciente" titulo="Paciente" feito={!!paciente}>
                <BuscaPaciente
                  valor={paciente}
                  aoEscolher={setPaciente}
                  rotulo="passo-paciente"
                  somenteAtivos
                  autoFocus
                />
                {erro('pacienteId')}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="primeiraConsulta" /> Primeira consulta
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={multiplos}
                      onChange={(e) => alternarMultiplos(e.target.checked)}
                    />
                    Vários agendamentos
                  </label>
                </div>
              </Passo>
            ) : (
              <Passo n={1} id="passo-titulo" titulo="O que é" feito={!!titulo.trim()}>
                <input
                  aria-labelledby="passo-titulo"
                  className="campo"
                  placeholder="Ex.: Reunião, curso"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  autoFocus
                />
                {erro('titulo')}
              </Passo>
            )}

            <Passo
              n={2}
              id="passo-profissional"
              titulo={multiplos ? `Profissional da marcação ${ativa + 1}` : 'Profissional'}
              feito={!!profissionalId}
              extra={<span className="text-xs text-suave">livres no dia</span>}
            >
              <CampoBusca
                rotulo="passo-profissional"
                placeholder="Buscar profissional"
                valor={buscaProf}
                aoMudar={setBuscaProf}
                pequeno
              />
              <div
                role="radiogroup"
                aria-labelledby="passo-profissional"
                className="mt-2 max-h-[180px] overflow-y-auto rounded-xl border border-borda"
              >
                {filtrados.length === 0 && (
                  <p className="px-3 py-3 text-sm text-suave">
                    Nenhum profissional com “{buscaProf}”.
                  </p>
                )}
                {filtrados.map((p) => {
                  const sel = p.id === profissionalId
                  const n =
                    carregando || !aberto ? null : livresNo(data, ocupacao(agendaDe(p.id), data))
                  return (
                    <label
                      key={p.id}
                      className={`relative flex h-11 shrink-0 cursor-pointer items-center gap-2.5 border-b border-borda px-3 transition last:border-b-0 has-focus-visible:bg-primaria-clara ${
                        sel ? 'bg-primaria-clara' : 'hover:bg-superficie-2'
                      }`}
                    >
                      <input
                        type="radio"
                        name="_profissional"
                        className="sr-only"
                        checked={sel}
                        onChange={() => mudarProfissional(p.id)}
                      />
                      <Avatar texto={iniciais(p.nome)} cor={p.corAgenda ?? COR_PADRAO} pequeno />
                      <span
                        className={`min-w-0 flex-1 truncate text-sm ${sel ? 'font-bold text-primaria' : 'font-medium'}`}
                      >
                        {p.nome}
                      </span>
                      {p.id === prof?.meuId && <span className="etiqueta">você</span>}
                      {n !== null && (
                        <span
                          className={`text-xs font-bold tabular-nums ${n ? 'text-sucesso' : 'text-perigo'}`}
                        >
                          {n || semLivres(data)}
                        </span>
                      )}
                    </label>
                  )
                })}
              </div>
              {erro('profissionalId')}
            </Passo>

            {tipo === 'CONSULTA' && (
              <fieldset>
                <legend className="mb-2 font-bold">
                  {multiplos ? `Categoria da marcação ${ativa + 1}` : 'Categoria'}
                </legend>
                <div className="flex flex-wrap gap-1.5">
                  {['', ...Object.keys(cats)].map((c) => (
                    <label
                      key={c}
                      className="relative flex items-center gap-1.5 rounded-full border-2 border-borda px-3 py-1 text-xs font-bold transition hover:border-primaria/40 has-checked:border-primaria has-checked:bg-primaria-clara has-checked:text-primaria has-focus-visible:ring-4 has-focus-visible:ring-primaria/20"
                    >
                      <input
                        type="radio"
                        name="categoria"
                        value={c}
                        checked={categoria === c}
                        onChange={() => alterar({ categoria: c })}
                        className="sr-only"
                      />
                      {c && (
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: cats[c] }}
                        />
                      )}
                      {c || 'Sem categoria'}
                    </label>
                  ))}
                  <NovaCategoria aoCriar={(nome) => alterar({ categoria: nome })} />
                </div>
              </fieldset>
            )}

            <details className="group shrink-0 rounded-xl border border-borda">
              <summary className="flex items-center justify-between gap-2 px-3 py-2 font-bold [&::-webkit-details-marker]:hidden">
                <span>{tipo === 'CONSULTA' ? 'Avisos e observações' : 'Observações'}</span>
                <span className="text-suave transition group-open:rotate-180">▾</span>
              </summary>
              <div className="space-y-3 border-t border-borda p-3">
                {tipo === 'CONSULTA' && (
                  <>
                    {(['confirmacao', 'alerta'] as const).map((campo) => (
                      <div key={campo}>
                        <label className="rotulo text-sm" htmlFor={campo}>
                          {campo === 'confirmacao' ? 'Pedir confirmação' : 'Lembrete da consulta'}
                        </label>
                        <CampoSelect
                          id={campo}
                          value={avisos[campo]}
                          onChange={(e) => setAvisos({ ...avisos, [campo]: e.target.value })}
                          vazio={false}
                          opcoes={CANAIS}
                        />
                      </div>
                    ))}
                    {data === hoje && <p className="ajuda">{AVISO_MESMO_DIA}</p>}
                  </>
                )}
                <div>
                  <label className="rotulo text-sm" htmlFor="observacoes">
                    Observações
                  </label>
                  <textarea id="observacoes" name="observacoes" rows={2} className="campo" />
                </div>
              </div>
            </details>
          </div>

          {/* ---------- Quando ---------- */}
          <Passo
            n={3}
            id="passo-horario"
            titulo={multiplos ? `Data e horário da marcação ${ativa + 1}` : 'Data e horário'}
            feito={!!inicio && aberto}
            className="flex min-h-0 flex-col"
          >
            <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-2xl border border-borda bg-superficie-2 p-3 sm:p-4">
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <p className="font-extrabold text-titulo">
                  {formatar(data, { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
                {/* Clicar fora fecha o calendário. */}
                {calendario && (
                  <div className="fixed inset-0 z-30" onClick={() => setCalendario(false)} />
                )}
                <div className="relative ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    className="botao-leve px-2.5 py-1.5"
                    onClick={() => mudarData(outroDia(data, -1))}
                    aria-label="Dia anterior"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className="botao-leve flex items-center gap-2 py-1.5"
                    aria-expanded={calendario}
                    aria-label="Escolher data"
                    onClick={() => setCalendario(!calendario)}
                  >
                    <Icone nome="agenda" className="h-4 w-4" />
                    {data.split('-').reverse().join('/')}
                  </button>
                  <button
                    type="button"
                    className="botao-leve px-2.5 py-1.5"
                    onClick={() => mudarData(outroDia(data, 1))}
                    aria-label="Próximo dia"
                  >
                    ›
                  </button>
                  {calendario && (
                    <div className="absolute top-full right-0 z-40 mt-1 w-64 shadow-lg">
                      <MiniCalendario data={data} hoje={hoje} aoEscolher={mudarData} />
                    </div>
                  )}
                </div>
              </div>
              {erro('data')}

              <div className="grid shrink-0 grid-cols-6 gap-1.5">
                {dias.map((d) => {
                  const sel = d === data
                  const n = profissionalId && !carregando ? livresNo(d) : null
                  const passado = d < hoje
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={sel}
                      aria-label={`${formatar(d, { weekday: 'long', day: 'numeric', month: 'long' })}${
                        n === null || passado ? '' : `, ${n} horários livres`
                      }`}
                      onClick={() => mudarData(d)}
                      className={`flex flex-col items-center rounded-xl border-2 px-1 py-2 transition ${
                        sel
                          ? 'border-primaria bg-primaria text-sobre-primaria shadow-md'
                          : 'border-transparent bg-superficie hover:border-primaria/40'
                      } ${passado && !sel ? 'opacity-50' : ''}`}
                    >
                      <span className="text-[11px] font-bold uppercase opacity-75">
                        {formatar(d, { weekday: 'short' })}
                      </span>
                      <span className="text-lg leading-tight font-extrabold">{d.slice(8)}</span>
                      <span className="mt-1 h-4 text-[10px] leading-4 font-bold">
                        {n === null || passado ? (
                          ''
                        ) : n === 0 ? (
                          <span className={sel ? '' : 'text-perigo'}>{semLivres(d)}</span>
                        ) : (
                          <span className={sel ? '' : 'text-sucesso'}>
                            {n}
                            <span className="hidden sm:inline"> livres</span>
                          </span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>

              {!profissionalId ? (
                <Vazio icone="profissionais">
                  Escolha o profissional para ver os horários livres dele.
                </Vazio>
              ) : !aberto ? (
                <Vazio icone="agenda">A clínica não abre aos domingos. Escolha outro dia.</Vazio>
              ) : (
                <>
                  <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-suave">
                    <Legenda classe="border-sucesso/50 bg-superficie">Livre</Legenda>
                    <Legenda classe="border-primaria bg-primaria">Escolhido</Legenda>
                    <Legenda classe={`border-perigo/40 ${LISTRA}`}>Ocupado</Legenda>
                    <label className="ml-auto flex items-center gap-2 font-bold text-texto">
                      <input
                        type="checkbox"
                        className="check-aviso"
                        checked={encaixe}
                        onChange={(e) => setEncaixe(e.target.checked)}
                      />
                      Permitir encaixe
                    </label>
                  </div>

                  {/* Só esta lista rola. Ela fica montada ao trocar de dia, então a rolagem se mantém. */}
                  <div
                    className="-mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto px-1 pb-1 max-lg:max-h-[55vh]"
                    onMouseLeave={() => setSobre('')}
                  >
                    {PERIODOS.map((p, i) => {
                      const desde = i ? PERIODOS[i - 1].ate : 0
                      const hs = HORARIOS.filter((h) => {
                        const m = paraMinutos(h)
                        return m >= desde && m < p.ate
                      })
                      const livres = hs.filter((h) => estadoEm(data, h) === 'livre').length
                      return (
                        <div key={p.nome}>
                          <div className="mb-1.5 flex items-baseline justify-between">
                            <h4 className="text-sm font-extrabold">{p.nome}</h4>
                            <span className="text-xs text-suave">
                              {carregando ? '…' : livres ? `${livres} livres` : 'Nenhum livre'}
                            </span>
                          </div>
                          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 xl:grid-cols-8">
                            {hs.map((h) => (
                              <Horario
                                key={h}
                                h={h}
                                estado={estadoEm(data, h)}
                                carregando={carregando}
                                quem={ocupados.get(h)}
                                encaixe={encaixe}
                                naFaixa={!!inicio && h >= inicio && h <= fimFaixa}
                                ponta={h === inicio || h === ultimo}
                                naPrevia={previa && h >= pa && h <= pb}
                                aoEscolher={() => escolher(h)}
                                aoPassar={() => setSobre(h)}
                              />
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-2 border-t border-borda pt-2 text-sm">
                    <span className={quemNaFaixa ? 'font-bold text-aviso' : 'text-suave'}>
                      {!inicio
                        ? 'Clique no horário de início.'
                        : quemNaFaixa
                          ? `Encaixe: ${quemNaFaixa.paciente?.nome ?? quemNaFaixa.titulo} já está às ${quemNaFaixa.inicio}.`
                          : ultimo
                            ? `${inicio}–${fim} (${duracaoTexto(paraMinutos(fim) - paraMinutos(inicio))}). Fora da faixa aumenta, dentro recomeça; ${marcacoes[ativa].clicado} de novo limpa.`
                            : `${inicio} escolhido. Clique em outro horário para fazer a faixa, ou deixe ${INTERVALO} min.`}
                    </span>
                    {!inicio &&
                      proximoLivre &&
                      (proximoLivre.dia !== data || livresNo(data) === 0) && (
                        <button
                          type="button"
                          className="botao-fantasma botao-pequeno ml-auto"
                          onClick={() => {
                            alterar({
                              data: proximoLivre.dia,
                              inicio: proximoLivre.h,
                              ultimo: '',
                              clicado: proximoLivre.h,
                            })
                          }}
                        >
                          Próximo livre:{' '}
                          {formatar(proximoLivre.dia, {
                            weekday: 'short',
                            day: '2-digit',
                            month: '2-digit',
                          })}{' '}
                          às {proximoLivre.h} →
                        </button>
                      )}
                  </div>
                </>
              )}
              {erro('inicio')}
              {erro('fim')}
            </div>
          </Passo>
        </div>

        {/* ---------- Resumo ---------- */}
        <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t border-borda pt-4">
          <dl className="flex w-full min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-sm sm:w-auto sm:flex-1">
            <Resumo rotulo={tipo === 'CONSULTA' ? 'Paciente' : 'Compromisso'}>
              {tipo === 'CONSULTA' ? paciente?.nome : titulo.trim()}
            </Resumo>
            {multiplos ? (
              <Resumo rotulo="Marcações">
                {`${lote.filter(completa).length} de ${lote.length} prontas`}
              </Resumo>
            ) : (
              <>
                <Resumo rotulo="Com">{profissional?.nome}</Resumo>
                <Resumo rotulo="Quando">
                  {inicio &&
                    `${formatar(data, { weekday: 'short', day: '2-digit', month: '2-digit' })}, ${inicio}–${fim}`}
                </Resumo>
              </>
            )}
          </dl>
          <div className="ml-auto flex gap-2">
            <button type="button" className="botao-leve" onClick={props.aoTerminar}>
              Cancelar
            </button>
            <button className="botao" disabled={criar.isPending || !pronto}>
              {criar.isPending
                ? 'Salvando…'
                : tipo === 'COMPROMISSO'
                  ? 'Criar compromisso'
                  : lote.length > 1
                    ? `Marcar ${lote.length} consultas`
                    : 'Marcar consulta'}
            </button>
          </div>
        </footer>
      </form>
    </>
  )
}

const LISTRA =
  'bg-[repeating-linear-gradient(135deg,color-mix(in_srgb,var(--perigo)_22%,transparent)_0_3px,transparent_3px_8px)]'

function Passo(props: {
  n: number
  id: string
  titulo: string
  feito: boolean
  extra?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section aria-labelledby={props.id} className={props.className}>
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <h3 id={props.id} className="flex items-center gap-2 font-bold">
          <span
            aria-hidden
            className={`grid size-6 place-items-center rounded-full text-xs font-extrabold transition ${
              props.feito ? 'bg-sucesso text-superficie' : 'bg-primaria-clara text-primaria'
            }`}
          >
            {props.feito ? '✓' : props.n}
          </span>
          {props.titulo}
        </h3>
        {props.extra}
      </div>
      {props.children}
    </section>
  )
}

function Horario(props: {
  h: string
  estado: Estado
  carregando: boolean
  quem?: Agendamento
  encaixe: boolean
  naFaixa: boolean
  ponta: boolean
  naPrevia: boolean
  aoEscolher: () => void
  aoPassar: () => void
}) {
  const { estado, quem } = props
  const bloqueado = props.carregando || (!props.encaixe && estado === 'ocupado')
  const aparencia = props.carregando
    ? 'animate-pulse border-transparent bg-borda/50 text-transparent'
    : props.ponta
      ? 'border-primaria bg-primaria text-sobre-primaria shadow-md ring-4 ring-primaria/20'
      : props.naFaixa
        ? 'border-primaria/60 bg-primaria-clara text-primaria'
        : props.naPrevia
          ? 'border-dashed border-primaria bg-primaria-clara/60 text-primaria'
          : estado === 'livre'
            ? 'border-sucesso/50 bg-superficie hover:-translate-y-px hover:border-sucesso hover:shadow-sm'
            : estado === 'ocupado'
              ? `border-perigo/30 text-suave ${LISTRA}`
              : 'border-borda/60 bg-transparent text-suave opacity-45 hover:opacity-100'
  const dica = quem
    ? `Ocupado: ${quem.paciente?.nome ?? quem.titulo} (${quem.inicio}–${quem.fim})`
    : estado === 'passou'
      ? 'Horário já passou'
      : undefined
  return (
    <button
      type="button"
      disabled={bloqueado}
      aria-pressed={props.naFaixa}
      title={dica}
      onClick={props.aoEscolher}
      onMouseEnter={props.aoPassar}
      className={`flex h-11 flex-col items-center justify-center rounded-lg border-2 text-sm font-bold tabular-nums transition ${aparencia}`}
    >
      {props.h}
      {quem && quem.inicio === props.h && !props.naFaixa && !props.carregando && (
        <span className="max-w-full truncate px-1 text-[10px] leading-none font-medium">
          {(quem.paciente?.nome ?? quem.titulo ?? '').split(' ')[0]}
        </span>
      )}
    </button>
  )
}

function Legenda(props: { classe: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`size-3.5 rounded border-2 ${props.classe}`} />
      {props.children}
    </span>
  )
}

function Resumo(props: { rotulo: string; children?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <dt className="text-xs text-suave">{props.rotulo}</dt>
      <dd className={`truncate font-bold ${props.children ? '' : 'font-normal text-suave italic'}`}>
        {props.children || '—'}
      </dd>
    </div>
  )
}

function Vazio(props: { icone: 'profissionais' | 'agenda'; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-borda px-4 py-10 text-center text-suave">
      <Icone nome={props.icone} className="h-8 w-8" />
      <p className="max-w-60 text-sm">{props.children}</p>
    </div>
  )
}

const SUGESTOES_DE_COR = [
  '#ec4899',
  '#f97316',
  '#eab308',
  '#84cc16',
  '#14b8a6',
  '#3b82f6',
  '#6366f1',
  '#64748b',
]

/** Bolinha "+" no fim das categorias: cria uma nova (nome e cor) e já escolhe. */
function NovaCategoria(props: { aoCriar: (nome: string) => void }) {
  const qc = useQueryClient()
  const [aberta, setAberta] = useState(false)
  const [nome, setNome] = useState('')
  const [cor, setCor] = useState(SUGESTOES_DE_COR[0])
  const fechar = () => {
    setAberta(false)
    setNome('')
  }
  const criar = useMutation({
    mutationFn: async () =>
      (await api.post<Record<string, string>>('/agenda/categorias', { nome, cor })).data,
    onSuccess: (cats) => {
      qc.setQueryData(['config', 'categorias'], cats)
      avisar('Categoria criada')
      props.aoCriar(nome.trim())
      fechar()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })

  if (!aberta)
    return (
      <button
        type="button"
        aria-label="Nova categoria"
        title="Nova categoria"
        onClick={() => setAberta(true)}
        className="grid size-7 place-items-center rounded-full border-2 border-dashed border-borda text-suave/60 transition hover:border-primaria/50 hover:bg-primaria-clara hover:text-primaria"
      >
        <Icone nome="mais" className="h-4 w-4" />
      </button>
    )
  return (
    <div className="mt-1 w-full space-y-2 rounded-xl border border-borda bg-superficie-2 p-2.5">
      <div className="flex items-center gap-2">
        <span className="size-3.5 shrink-0 rounded-full" style={{ backgroundColor: cor }} />
        <input
          autoFocus
          aria-label="Nome da nova categoria"
          className="campo py-1.5 text-sm"
          placeholder="Nome da categoria"
          maxLength={40}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => {
            // Enter não envia a consulta; Esc fecha só esta caixa, não o modal.
            if (e.key === 'Enter') {
              e.preventDefault()
              if (nome.trim()) criar.mutate()
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              e.stopPropagation()
              fechar()
            }
          }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {SUGESTOES_DE_COR.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Cor ${c}`}
            aria-pressed={cor === c}
            onClick={() => setCor(c)}
            className={`size-6 rounded-full transition ${cor === c ? 'ring-2 ring-primaria ring-offset-2 ring-offset-superficie-2' : 'hover:scale-110'}`}
            style={{ backgroundColor: c }}
          />
        ))}
        <label
          className="relative grid size-6 cursor-pointer place-items-center rounded-full border-2 border-dashed border-borda text-[10px] font-bold text-suave hover:border-primaria"
          title="Outra cor"
        >
          <input
            type="color"
            aria-label="Outra cor"
            value={cor}
            onChange={(e) => setCor(e.target.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
          ···
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="botao-leve botao-pequeno" onClick={fechar}>
          Cancelar
        </button>
        <button
          type="button"
          className="botao botao-pequeno"
          disabled={!nome.trim() || criar.isPending}
          onClick={() => criar.mutate()}
        >
          Adicionar
        </button>
      </div>
    </div>
  )
}
