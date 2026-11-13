// Dashboard Analítico (R-088): cartões com os indicadores do período (comparados com o período
// anterior) e gráficos de faturamento, agenda e pacientes. Os gráficos são os do Financeiro.
import { useMemo, useState, type ReactNode } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api, dataBR, mensagemDeErro, somarDias } from '../api'
import { reais } from '../../../shared/financeiro'
import { PeriodoSuspenso, periodoAnterior, useIntervalo } from './FinanceiroAbas'
import { Visual, milReais, type Dados, type Tipo } from './FinanceiroGraficos'
import { dataCurta } from '../componentes/CalendarioIntervalo'
import { Icone } from '../componentes/Icones'

interface Item {
  rotulo: string
  valor: number
}
interface Resumo {
  consultas: {
    total: number
    atendidas: number
    faltas: number
    desmarcadas: number
    comparecimento: number
    ocupacao: number
  }
  /** Faturamento = orçamentos aprovados (só se aprovam pagos), como no Financeiro. */
  financeiro: {
    faturamento: number
    faturados: number
    ticketMedio: number
    porPaciente: number
  }
  orcamentos: {
    criados: number
    aprovados: number
    conversao: number
  }
  pacientesNovos: number
  atendidos: number
}
interface DadosPainel extends Resumo {
  anterior: Resumo | null
  consultas: Resumo['consultas'] & {
    status: Item[]
    porCategoria: Item[]
    porProfissional: { nome: string; consultas: number; faltas: number; faturamento: number }[]
  }
  financeiro: Resumo['financeiro'] & {
    porForma: Item[]
    porDia: { data: string; valor: number }[]
    tendencia: { mes: string; faturamento: number }[]
  }
  inadimplencia: { valor: number; parcelas: number; pacientes: number; porAtraso: Item[] }
  orcamentos: Resumo['orcamentos'] & {
    funil: Item[]
    porEspecialidade: Item[]
    porProcedimento: Item[]
  }
  pacientes: {
    novos: number
    atendidos: number
    origem: Item[]
    faixaEtaria: Item[]
    semIdade: number
  }
  retornosVencidos: number
  /** [dia da semana 0=dom][hora] → consultas */
  mapaCalor: number[][]
  /** [dia da semana 0=dom] → faltas */
  faltasSemana: number[]
}

const pct = (v: number) => `${Math.round(v * 100)}%`
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const mesCurto = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`
const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/** Uma série só, no formato dos gráficos do Financeiro. */
const serie = (eixo: string, rotulo: string, itens: Item[], emReais: boolean, n = 99): Dados => ({
  eixo,
  categorias: itens.slice(0, n).map((i) => i.rotulo),
  series: [
    {
      rotulo,
      cor: 'var(--serie-1)',
      reais: emReais,
      valores: itens.slice(0, n).map((i) => i.valor),
    },
  ],
})

/** Faturamento no eixo do tempo: por dia (até 31 dias), semana (até ~4 meses) ou mês. */
function fluxo(porDia: DadosPainel['financeiro']['porDia'], de: string, ate: string): Dados {
  const vazio = { eixo: 'Data', categorias: [], series: [] }
  if (!porDia.length) return vazio
  // "Todo o período" vai de 2000 a 2100: o eixo fica só entre o 1º e o último movimento.
  const ini = de > porDia[0].data ? de : porDia[0].data
  const fim = ate < porDia.at(-1)!.data ? ate : porDia.at(-1)!.data
  const dias = Math.round((Date.parse(fim) - Date.parse(ini)) / 86_400_000) + 1
  const grupo = dias <= 31 ? 'dia' : dias <= 120 ? 'semana' : 'mes'
  const chave = (iso: string) => {
    if (grupo === 'mes') return iso.slice(0, 7)
    if (grupo === 'dia') return iso
    const d = new Date(`${iso}T12:00:00`).getDay()
    return somarDias(iso, -((d + 6) % 7))
  }
  const soma = new Map<string, number>()
  for (let d = ini; d <= fim; d = somarDias(d, 1)) soma.set(chave(d), 0)
  for (const x of porDia) {
    const k = chave(x.data)
    if (soma.has(k)) soma.set(k, soma.get(k)! + x.valor)
  }
  const ks = [...soma.keys()]
  return {
    eixo: grupo === 'mes' ? 'Mês' : grupo === 'semana' ? 'Semana de' : 'Dia',
    categorias: ks.map((k) => (grupo === 'mes' ? mesCurto(k) : dataBR(k).slice(0, 5))),
    series: [
      {
        rotulo: 'Faturamento',
        cor: 'var(--serie-3)',
        reais: true,
        valores: ks.map((k) => soma.get(k)!),
      },
    ],
  }
}

export function Painel() {
  const p = useIntervalo()
  const { de, ate } = p.consulta
  const ant = p.tudo ? null : periodoAnterior(de, ate)
  const r = useQuery({
    queryKey: ['painel', de, ate],
    queryFn: async () =>
      (
        await api.get<DadosPainel>('/painel', {
          params: { de, ate, anteriorDe: ant?.de, anteriorAte: ant?.ate },
        })
      ).data,
    placeholderData: keepPreviousData,
  })
  const d = r.data
  const a = d?.anterior ?? null

  const graficos = useMemo(() => {
    if (!d) return null
    const t = d.financeiro.tendencia
    return {
      fluxo: fluxo(d.financeiro.porDia, de, ate),
      tendencia: {
        eixo: 'Mês',
        categorias: t.map((x) => mesCurto(x.mes)),
        series: [
          {
            rotulo: 'Faturamento',
            cor: 'var(--serie-3)',
            reais: true,
            valores: t.map((x) => x.faturamento),
          },
        ],
      } satisfies Dados,
      status: serie('Situação', 'Consultas', d.consultas.status, false),
      atraso: serie('Atraso', 'Em atraso', d.inadimplencia.porAtraso, true),
      forma: serie('Forma', 'Faturamento', d.financeiro.porForma, true),
      especialidade: serie('Especialidade', 'Faturamento', d.orcamentos.porEspecialidade, true),
      procedimento: serie('Procedimento', 'Faturamento', d.orcamentos.porProcedimento, true, 8),
      origem: serie('Como conheceu', 'Pacientes novos', d.pacientes.origem, false),
      idade: serie('Faixa de idade', 'Pacientes', d.pacientes.faixaEtaria, false),
      categoria: serie('Categoria', 'Consultas', d.consultas.porCategoria, false, 10),
      faltasSemana: serie(
        'Dia da semana',
        'Faltas (%)',
        // Seg a Sáb; domingo só se tiver consulta.
        [1, 2, 3, 4, 5, 6, ...(d.mapaCalor[0].some(Boolean) ? [0] : [])].map((dia) => {
          const total = d.mapaCalor[dia].reduce((t, v) => t + v, 0)
          return {
            rotulo: SEMANA[dia],
            valor: total ? Math.round((d.faltasSemana[dia] / total) * 1000) / 10 : 0,
          }
        }),
        false,
      ),
    }
  }, [d, de, ate])

  const [ordem, setOrdem] = useState(lerOrdem)
  const [arrastando, setArrastando] = useState<IdBloco | null>(null)
  const salvarOrdem = (n: IdBloco[]) => {
    setOrdem(n)
    try {
      localStorage.setItem(CHAVE_ORDEM, JSON.stringify(n))
    } catch {
      /* sem armazenamento: vale só nesta visita */
    }
  }
  const mover = (id: IdBloco, para: number) => {
    const atual = ordem.indexOf(id)
    if (para < 0 || para >= ordem.length || atual === para) return
    const n = [...ordem]
    n.splice(para, 0, n.splice(atual, 1)[0])
    salvarOrdem(n)
  }
  const blocos = d && graficos ? montarBlocos(d, graficos) : null

  return (
    <div className="mx-auto flex max-w-[1320px] flex-col gap-4 lg:h-[calc(100dvh-2rem)]">
      <header className="flex shrink-0 flex-wrap items-center gap-3.5">
        <h1 className="titulo">Painel</h1>
        <span aria-hidden="true" className="h-6 w-px bg-borda" />
        <span className="text-base text-suave">Indicadores de gestão da clínica</span>
      </header>

      <div className="cartao flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 py-2">
        <PeriodoSuspenso p={p} />
        {ant && (
          <span className="text-xs text-suave">
            Comparado com {dataCurta(ant.de)} – {dataCurta(ant.ate)}
          </span>
        )}
      </div>

      <div className="relative min-h-0 flex-1 space-y-4 lg:-mr-2 lg:overflow-y-auto lg:pr-2">
        {r.isError && <p className="alerta-perigo">{mensagemDeErro(r.error)}</p>}
        {r.isPending && <p className="cartao py-16 text-center text-suave">Carregando…</p>}

        {d && graficos && (
          <div className={`flex flex-col gap-4 ${r.isFetching ? 'opacity-60' : ''}`}>
            {/* ---------- Cartões principais ---------- */}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <Cartao
                rotulo="Faturamento"
                valor={reais(d.financeiro.faturamento)}
                variacao={
                  a && (
                    <Variacao atual={d.financeiro.faturamento} antes={a.financeiro.faturamento} />
                  )
                }
                nota={`Ticket médio ${reais(d.financeiro.ticketMedio)} · ${d.financeiro.faturados} orçamento(s)`}
                tendencia={d.financeiro.tendencia.map((x) => x.faturamento)}
                cor="var(--serie-3)"
              />
              <Cartao
                rotulo="Inadimplência hoje"
                valor={reais(d.inadimplencia.valor)}
                tom={d.inadimplencia.valor ? 'perigo' : 'sucesso'}
                nota={`${d.inadimplencia.parcelas} parcela(s) de ${d.inadimplencia.pacientes} paciente(s)`}
              />
              <Medidor
                rotulo="Conversão de orçamentos"
                v={d.orcamentos.conversao}
                variacao={
                  a && (
                    <Variacao
                      atual={d.orcamentos.conversao}
                      antes={a.orcamentos.conversao}
                      pontos
                    />
                  )
                }
                nota={`${d.orcamentos.aprovados} aprovados de ${d.orcamentos.criados} criados`}
                meta={0.7}
              />
              <Medidor
                rotulo="Comparecimento"
                v={d.consultas.comparecimento}
                variacao={
                  a && (
                    <Variacao
                      atual={d.consultas.comparecimento}
                      antes={a.consultas.comparecimento}
                      pontos
                    />
                  )
                }
                nota={`${d.consultas.faltas} falta(s) · ${d.consultas.desmarcadas} desmarcação(ões)`}
                meta={0.9}
              />
              <Medidor
                rotulo="Ocupação da agenda"
                v={d.consultas.ocupacao}
                variacao={
                  a && <Variacao atual={d.consultas.ocupacao} antes={a.consultas.ocupacao} pontos />
                }
                nota={`${d.consultas.total} consulta(s) nos dias atendidos`}
                meta={0.8}
              />
            </div>

            {/* ---------- Cartões menores ---------- */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Mini
                rotulo="Pacientes novos"
                valor={d.pacientes.novos}
                variacao={a && <Variacao atual={d.pacientesNovos} antes={a.pacientesNovos} />}
              />
              <Mini
                rotulo="Pacientes atendidos"
                valor={d.pacientes.atendidos}
                variacao={a && <Variacao atual={d.atendidos} antes={a.atendidos} />}
              />
              <Mini
                rotulo="Faturamento por paciente"
                valor={reais(Math.round(d.financeiro.porPaciente))}
                variacao={
                  a && (
                    <Variacao atual={d.financeiro.porPaciente} antes={a.financeiro.porPaciente} />
                  )
                }
              />
              <Mini
                rotulo="Retornos atrasados"
                valor={d.retornosVencidos}
                tom={d.retornosVencidos ? 'aviso' : undefined}
                nota="pacientes a chamar de volta"
              />
            </div>

            {/* ---------- Gráficos (arrastáveis; a ordem fica salva neste navegador) ---------- */}
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-suave">
                Arraste pelo <Icone nome="arrastar" className="inline h-3.5 w-3.5" /> para mudar a
                ordem dos gráficos.
              </p>
              {ordem.join() !== ORDEM_PADRAO.join() && (
                <button
                  className="botao-leve botao-pequeno"
                  onClick={() => salvarOrdem([...ORDEM_PADRAO])}
                >
                  Restaurar ordem
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {ordem.map((id, i) => {
                const b = blocos![id]
                return (
                  <Secao
                    key={id}
                    titulo={b.titulo}
                    dica={b.dica}
                    largo={b.largo}
                    arrastando={arrastando === id}
                    aoArrastar={(ativo) => setArrastando(ativo ? id : null)}
                    aoPassar={() => arrastando && arrastando !== id && mover(arrastando, i)}
                    aoMover={(passo) => mover(id, i + passo)}
                  >
                    {b.corpo}
                  </Secao>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Gráficos arrastáveis ────────────────────────────────────────────────────
const ORDEM_PADRAO = [
  'fluxo',
  'tendencia',
  'funil',
  'status',
  'mapaCalor',
  'profissionais',
  'atraso',
  'forma',
  'especialidade',
  'procedimento',
  'origem',
  'idade',
  'categoria',
  'faltasSemana',
] as const
type IdBloco = (typeof ORDEM_PADRAO)[number]
const CHAVE_ORDEM = 'painel-ordem-v1'

/** Ordem salva; gráfico novo (fora da lista salva) entra no fim. */
function lerOrdem(): IdBloco[] {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_ORDEM) ?? '[]') as string[]
    const ok = salvo.filter((x): x is IdBloco => (ORDEM_PADRAO as readonly string[]).includes(x))
    return [...new Set([...ok, ...ORDEM_PADRAO])]
  } catch {
    return [...ORDEM_PADRAO]
  }
}

interface Bloco {
  titulo: string
  dica: string
  largo?: boolean
  corpo: ReactNode
}
const grafico = (tipo: Tipo, dados: Dados) => (
  <Visual tipo={tipo} dados={dados} tabela={false} porCategoria />
)

function montarBlocos(d: DadosPainel, g: Record<string, Dados>): Record<IdBloco, Bloco> {
  return {
    fluxo: {
      titulo: 'Faturamento no tempo',
      dica: 'Faturamento em queda por vários períodos seguidos pede atenção ao caixa.',
      corpo: grafico('colunas', g.fluxo),
    },
    tendencia: {
      titulo: 'Últimos 12 meses',
      dica: 'A tendência mostra sazonalidade: planeje campanhas nos meses fracos.',
      corpo: grafico('linha', g.tendencia),
    },
    funil: {
      titulo: 'Funil dos orçamentos',
      dica: 'Orçamentos criados no período e até onde chegaram.',
      corpo: <Funil itens={d.orcamentos.funil} />,
    },
    status: {
      titulo: 'Situação das consultas',
      dica: 'Faltas acima de 10% indicam que vale reforçar a confirmação.',
      corpo: grafico('rosca', g.status),
    },
    mapaCalor: {
      titulo: 'Mapa de calor da agenda',
      dica: 'Consultas por dia da semana e hora: horários vazios são onde encaixar retornos.',
      largo: true,
      corpo: <MapaCalor m={d.mapaCalor} />,
    },
    profissionais: {
      titulo: 'Desempenho por profissional',
      dica: 'Consultas, faltas e faturamento (orçamentos aprovados) de cada profissional.',
      largo: true,
      corpo: <TabelaProfissionais linhas={d.consultas.porProfissional} />,
    },
    atraso: {
      titulo: 'Inadimplência por tempo de atraso',
      dica: 'Quanto mais antigo o atraso, menor a chance de receber: cobre primeiro as faixas da esquerda.',
      corpo: grafico('colunas', g.atraso),
    },
    forma: {
      titulo: 'Faturamento por forma de pagamento',
      dica: 'Ajuda a negociar taxas de cartão e prever o dinheiro em caixa.',
      corpo: grafico('rosca', g.forma),
    },
    especialidade: {
      titulo: 'Faturamento por especialidade',
      dica: 'Quais especialidades sustentam o faturamento.',
      corpo: grafico('pizza', g.especialidade),
    },
    procedimento: {
      titulo: 'Procedimentos que mais faturam',
      dica: 'Os 8 procedimentos que mais faturaram em orçamentos aprovados.',
      corpo: grafico('barras', g.procedimento),
    },
    origem: {
      titulo: 'Como os pacientes novos conheceram a clínica',
      dica: 'Mostra quais canais de divulgação trazem pacientes.',
      corpo: grafico('barras', g.origem),
    },
    idade: {
      titulo: 'Faixa de idade dos pacientes atendidos',
      dica: d.pacientes.semIdade
        ? `${d.pacientes.semIdade} paciente(s) sem data de nascimento ficaram de fora.`
        : 'Perfil do público atendido no período.',
      corpo: grafico('colunas', g.idade),
    },
    categoria: {
      titulo: 'Consultas por categoria',
      dica: 'Tipos de atendimento que mais ocupam a agenda.',
      corpo: grafico('barras', g.categoria),
    },
    faltasSemana: {
      titulo: 'Taxa de faltas por dia da semana',
      dica: 'Em que dia os pacientes mais faltam: reforce a confirmação e encaixe nesses dias.',
      corpo: grafico('colunas', g.faltasSemana),
    },
  }
}

const SETAS: Record<string, number> = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }

/** Cartão de gráfico: arrasta pelo botão (ou setas do teclado), como em Financeiro › Gráficos. */
function Secao(props: {
  titulo: string
  dica: string
  largo?: boolean
  arrastando: boolean
  aoArrastar: (ativo: boolean) => void
  aoPassar: () => void
  aoMover: (passo: number) => void
  children: ReactNode
}) {
  const [pega, setPega] = useState(false)
  return (
    <section
      draggable={pega}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', props.titulo) // o Firefox só arrasta com algum dado
        props.aoArrastar(true)
      }}
      onDragEnd={() => {
        setPega(false)
        props.aoArrastar(false)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        props.aoPassar()
      }}
      onDrop={(e) => e.preventDefault()}
      className={`cartao viz flex flex-col gap-3 ${props.largo ? 'xl:col-span-2' : ''} ${props.arrastando ? 'opacity-50 ring-2 ring-primaria' : ''}`}
    >
      <header className="flex items-start gap-1.5">
        <button
          type="button"
          className="botao-fantasma botao-icone -ml-1 size-7 shrink-0 cursor-grab text-suave active:cursor-grabbing"
          aria-label={`Mover o gráfico ${props.titulo}`}
          title="Arraste para mudar a posição (ou use as setas do teclado)"
          onPointerDown={() => setPega(true)}
          onPointerUp={() => setPega(false)}
          onKeyDown={(e) => {
            if (!SETAS[e.key]) return
            e.preventDefault()
            const botao = e.currentTarget
            props.aoMover(SETAS[e.key])
            requestAnimationFrame(() => botao.focus()) // o cartão muda de lugar e o foco vai junto
          }}
        >
          <Icone nome="arrastar" className="h-5 w-5 [stroke-width:3]" />
        </button>
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 className="text-base">{props.titulo}</h2>
          <p className="text-xs text-suave">{props.dica}</p>
        </div>
      </header>
      {props.children}
    </section>
  )
}

// ── Cartões ─────────────────────────────────────────────────────────────────
type Tom = 'perigo' | 'sucesso' | 'aviso'
const COR_TOM: Record<Tom, string> = {
  perigo: 'text-perigo',
  sucesso: 'text-sucesso',
  aviso: 'text-aviso',
}

/** ▲/▼ em relação ao período anterior: % para valores, pontos percentuais para taxas. */
function Variacao({ atual, antes, pontos }: { atual: number; antes: number; pontos?: boolean }) {
  const dif = pontos
    ? (atual - antes) * 100
    : antes
      ? ((atual - antes) / Math.abs(antes)) * 100
      : null
  if (dif === null) return atual ? <span className="etiqueta">novo</span> : null
  const n = Math.round(dif)
  const texto = `${Math.abs(n).toLocaleString('pt-BR')}${pontos ? ' p.p.' : '%'}`
  if (!n) return <span className="etiqueta">= anterior</span>
  return (
    <span
      className={`etiqueta shrink-0 whitespace-nowrap ${n > 0 ? 'etiqueta-sucesso' : 'etiqueta-perigo'}`}
      title="Comparado com o período anterior"
    >
      {n > 0 ? '▲' : '▼'} {texto}
    </span>
  )
}

/** Linha pequena dos últimos 12 meses, só para ver a direção. */
function Linhazinha({ valores, cor }: { valores: number[]; cor: string }) {
  const min = Math.min(...valores)
  const max = Math.max(...valores)
  if (max === min) return null
  const pts = valores.map(
    (v, i) => `${(i / (valores.length - 1)) * 100},${28 - ((v - min) / (max - min)) * 24}`,
  )
  return (
    <svg
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      className="viz h-8 w-full"
      aria-hidden="true"
    >
      <polygon points={`0,30 ${pts.join(' ')} 100,30`} fill={cor} opacity={0.14} />
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={cor}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Cartao(props: {
  rotulo: string
  valor: ReactNode
  variacao?: ReactNode
  nota?: string
  tom?: Tom
  tendencia?: number[]
  cor?: string
}) {
  return (
    <section className="cartao viz flex flex-col gap-1">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-bold text-suave">{props.rotulo}</h2>
        {props.variacao}
      </div>
      <p
        className={`text-2xl font-extrabold tabular-nums ${props.tom ? COR_TOM[props.tom] : 'text-titulo'}`}
      >
        {props.valor}
      </p>
      {props.nota && <p className="text-xs text-suave">{props.nota}</p>}
      {props.tendencia && props.cor && (
        <div className="mt-auto pt-1" title="Últimos 12 meses">
          <Linhazinha valores={props.tendencia} cor={props.cor} />
        </div>
      )}
    </section>
  )
}

/** Taxa de 0 a 1 com barra de progresso e, se houver, a marca da meta. */
function Medidor(props: {
  rotulo: string
  v: number
  variacao?: ReactNode
  nota: string
  meta?: number
}) {
  const ok = props.meta === undefined || props.v >= props.meta
  return (
    <section className="cartao flex flex-col gap-1">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-bold text-suave">{props.rotulo}</h2>
        {props.variacao}
      </div>
      <p className="text-2xl font-extrabold text-titulo tabular-nums">{pct(props.v)}</p>
      <p className="text-xs text-suave">{props.nota}</p>
      <div className="relative mt-auto pt-2">
        <div className="h-2.5 overflow-hidden rounded-full bg-borda/60">
          <div
            className={`h-full rounded-full ${ok ? 'bg-primaria' : 'bg-aviso'}`}
            style={{ width: `${Math.min(100, Math.max(0, props.v * 100))}%` }}
          />
        </div>
        {props.meta !== undefined && (
          <span
            className="absolute top-1 h-4.5 w-0.5 rounded bg-titulo"
            style={{ left: `${props.meta * 100}%` }}
            title={`Referência: ${pct(props.meta)}`}
          />
        )}
      </div>
      {props.meta !== undefined && (
        <p className="text-[11px] text-suave">Referência de mercado: {pct(props.meta)}</p>
      )}
    </section>
  )
}

function Mini(props: {
  rotulo: string
  valor: ReactNode
  variacao?: ReactNode
  nota?: string
  tom?: Tom
}) {
  return (
    <section className="cartao flex flex-col gap-0.5 py-3">
      <h2 className="text-xs font-bold text-suave">{props.rotulo}</h2>
      <div className="flex flex-wrap items-center gap-2">
        <p
          className={`text-xl font-extrabold tabular-nums ${props.tom ? COR_TOM[props.tom] : 'text-titulo'}`}
        >
          {props.valor}
        </p>
        {props.variacao}
      </div>
      {props.nota && <p className="text-xs text-suave">{props.nota}</p>}
    </section>
  )
}

// ── Gráficos ────────────────────────────────────────────────────────────────
/** Funil: cada etapa com a barra proporcional à primeira e a passagem da etapa anterior. */
function Funil({ itens }: { itens: Item[] }) {
  const topo = itens[0]?.valor ?? 0
  if (!topo) return <p className="py-16 text-center text-suave">Sem orçamentos no período.</p>
  return (
    <ol className="flex flex-col gap-2 py-2">
      {itens.map((it, i) => (
        <li key={it.rotulo} className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-right text-sm font-bold">{it.rotulo}</span>
          <div className="flex-1">
            <div
              className="mx-auto flex h-10 min-w-12 items-center justify-center rounded-xl font-extrabold text-white tabular-nums"
              style={{
                width: `${Math.max(8, (it.valor / topo) * 100)}%`,
                background: `var(--serie-${[1, 7, 4, 3][i]})`,
              }}
            >
              {it.valor}
            </div>
          </div>
          <span className="w-20 shrink-0 text-xs text-suave tabular-nums">
            {i
              ? `${itens[i - 1].valor ? pct(it.valor / itens[i - 1].valor) : '—'} da anterior`
              : '100%'}
          </span>
        </li>
      ))}
    </ol>
  )
}

/** Grade dia da semana × hora; a cor mais forte é o horário mais cheio. */
function MapaCalor({ m }: { m: number[][] }) {
  const max = Math.max(...m.flat())
  if (!max) return <p className="py-16 text-center text-suave">Sem consultas no período.</p>
  const horas = m[0].map((_, h) => h).filter((h) => m.some((d) => d[h]))
  const de = Math.min(8, horas[0])
  const ate = Math.max(18, horas.at(-1)!)
  const colunas = Array.from({ length: ate - de + 1 }, (_, i) => de + i)
  // Seg a Sáb; domingo só aparece se tiver consulta.
  const dias = [1, 2, 3, 4, 5, 6, ...(m[0].some(Boolean) ? [0] : [])]
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th />
            {colunas.map((h) => (
              <th key={h} className="font-bold text-suave tabular-nums">
                {h}h
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dias.map((d) => (
            <tr key={d}>
              <th className="pr-1 text-right font-bold text-suave">{SEMANA[d]}</th>
              {colunas.map((h) => {
                const v = m[d][h]
                return (
                  <td
                    key={h}
                    title={`${SEMANA[d]}, ${h}h: ${v} consulta(s)`}
                    className="h-9 rounded-lg text-center font-bold tabular-nums"
                    style={{
                      background: v
                        ? `color-mix(in srgb, var(--primaria) ${15 + (v / max) * 85}%, var(--superficie))`
                        : 'var(--superficie-2)',
                      color: v / max > 0.5 ? 'var(--sobre-primaria)' : 'var(--texto)',
                    }}
                  >
                    {v || ''}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TabelaProfissionais({ linhas }: { linhas: DadosPainel['consultas']['porProfissional'] }) {
  if (!linhas.length) return <p className="py-16 text-center text-suave">Nada no período.</p>
  const maxV = Math.max(1, ...linhas.map((l) => l.faturamento))
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="text-xs font-bold text-suave uppercase">
            <th className="border-b border-borda px-3 py-2">Profissional</th>
            <th className="border-b border-borda px-3 py-2 text-right">Consultas</th>
            <th className="border-b border-borda px-3 py-2 text-right">Faltas</th>
            <th className="w-2/5 border-b border-borda px-3 py-2">Faturamento</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const taxa = l.consultas ? l.faltas / l.consultas : 0
            return (
              <tr key={l.nome} className="border-b border-borda last:border-0">
                <td className="px-3 py-2 font-bold">{l.nome}</td>
                <td className="px-3 py-2 text-right tabular-nums">{l.consultas}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {l.faltas}{' '}
                  <span
                    className={`text-xs ${taxa > 0.1 ? 'font-bold text-perigo' : 'text-suave'}`}
                  >
                    ({pct(taxa)})
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 flex-1 rounded-full bg-borda/60">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(l.faturamento / maxV) * 100}%`,
                          background: 'var(--serie-1)',
                        }}
                      />
                    </div>
                    <span
                      className="w-24 shrink-0 text-right font-bold tabular-nums"
                      title={reais(l.faturamento)}
                    >
                      R$ {milReais(l.faturamento)}
                    </span>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
