// Financeiro > Gráficos: análises dos orçamentos aprovados e do que entrou, cada uma editável
// (tipo, agrupamento e métricas) ou montada com SQL/Python; favoritável, reordenável e exportável.
// SVG próprio, sem biblioteca de gráficos.
import { useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { dataBR, mensagemDeErro, somarDias } from '../api'
import { avisar } from '../estado'
import { reais } from '../../../shared/financeiro'
import { CampoSelect } from '../componentes/CampoSelect'
import { Icone } from '../componentes/Icones'
import { confirmar } from '../componentes/Confirmar'
import { Dialogo } from '../componentes/Dialogo'
import { EditorCodigo } from '../componentes/EditorCodigo'
import {
  MODELOS,
  VARIAVEIS,
  executar,
  promptModelo,
  tipoLegivel,
  type Linguagem,
  type Resultado,
} from '../componentes/codigoGrafico'
import {
  PeriodoSuspenso,
  ProfissionaisSuspenso,
  consultaAnalise,
  faturamentoPorProfissional,
  useIntervalo,
  type Analise,
} from './FinanceiroAbas'

// ── Configuração de um gráfico ──────────────────────────────────────────────
const METRICAS = {
  faturamento: { rotulo: 'Faturamento', cor: 'var(--serie-1)', reais: true },
  custo: { rotulo: 'Custo', cor: 'var(--serie-2)', reais: true },
  lucro: { rotulo: 'Lucro', cor: 'var(--serie-3)', reais: true },
  recebido: { rotulo: 'Recebido', cor: 'var(--serie-4)', reais: true },
  quantidade: { rotulo: 'Quantidade', cor: 'var(--serie-1)', reais: false },
} as const
type Metrica = keyof typeof METRICAS

/** fonte: de onde sai o dado (orçamentos, entradas ou os dois). */
const GRUPOS = {
  mes: { rotulo: 'Mês', fonte: 'ambas', tempo: true },
  semana: { rotulo: 'Semana', fonte: 'ambas', tempo: true },
  dia: { rotulo: 'Dia', fonte: 'ambas', tempo: true },
  profissional: { rotulo: 'Profissional', fonte: 'ambas', tempo: false },
  procedimento: { rotulo: 'Procedimento', fonte: 'orc', tempo: false },
  especialidade: { rotulo: 'Especialidade', fonte: 'orc', tempo: false },
  forma: { rotulo: 'Forma de pagamento', fonte: 'entrada', tempo: false },
  faixa: { rotulo: 'Faixa de valor (histograma)', fonte: 'orc', tempo: true },
} as const
type Grupo = keyof typeof GRUPOS

const TIPOS = {
  colunas: 'Colunas',
  barras: 'Barras',
  linha: 'Linha',
  area: 'Área',
  pizza: 'Pizza',
  rosca: 'Rosca',
} as const
export type Tipo = keyof typeof TIPOS
const EM_FATIAS = (t: Tipo) => t === 'pizza' || t === 'rosca'

interface Config {
  id: string
  tipo: Tipo
  grupo: Grupo
  metricas: Metrica[]
  /** Vazio: título montado das métricas e do agrupamento. */
  titulo?: string
  /** Gráfico personalizado: os dados saem deste código (grupo e métricas não valem). */
  codigo?: { linguagem: Linguagem; fonte: string; reais: boolean }
}

/** Métricas que fazem sentido no agrupamento (recebido não tem procedimento; forma só tem recebido). */
const disponiveis = (g: Grupo): Metrica[] =>
  GRUPOS[g].fonte === 'orc'
    ? ['faturamento', 'custo', 'lucro', 'quantidade']
    : GRUPOS[g].fonte === 'entrada'
      ? ['recebido', 'quantidade']
      : ['faturamento', 'custo', 'lucro', 'recebido', 'quantidade']

/** Deixa a configuração coerente depois de qualquer mudança. */
function ajustar(c: Config): Config {
  let m = c.metricas.filter((x) => disponiveis(c.grupo).includes(x))
  if (!m.length) m = [disponiveis(c.grupo)[0]]
  if (EM_FATIAS(c.tipo)) m = m.slice(0, 1)
  return { ...c, metricas: m }
}

const PADRAO: Config[] = [
  { id: 'a', tipo: 'colunas', grupo: 'dia', metricas: ['faturamento', 'custo', 'lucro'] },
  { id: 'b', tipo: 'barras', grupo: 'profissional', metricas: ['lucro'] },
  { id: 'c', tipo: 'rosca', grupo: 'forma', metricas: ['recebido'] },
  { id: 'd', tipo: 'colunas', grupo: 'faixa', metricas: ['quantidade'] },
  { id: 'e', tipo: 'pizza', grupo: 'especialidade', metricas: ['faturamento'] },
  { id: 'f', tipo: 'area', grupo: 'dia', metricas: ['faturamento', 'recebido'] },
]
const CHAVE_LOCAL = 'financeiro-graficos-v2'
const CHAVE_FAV = 'financeiro-graficos-favoritos'
const CHAVE_FAV_SEMEADO = 'financeiro-graficos-favoritos-semeado'
const valida = (c: Config) =>
  !!c && c.tipo in TIPOS && c.grupo in GRUPOS && Array.isArray(c.metricas)

/** Favorito: gráfico guardado para adicionar de novo; noPadrao = entra no "Restaurar padrão". */
interface Favorito {
  config: Config
  noPadrao: boolean
}

function ler<T>(chave: string, ok: (v: unknown) => boolean, padrao: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(chave) ?? 'null')
    if (Array.isArray(v) && v.every(ok)) return v as T
  } catch {
    /* sem armazenamento: usa o padrão */
  }
  return padrao
}
function gravar(chave: string, v: unknown) {
  try {
    localStorage.setItem(chave, JSON.stringify(v))
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
}
const lerSalvo = () => ler<Config[]>(CHAVE_LOCAL, (c) => valida(c as Config), PADRAO).map(ajustar)
/** "Gráficos 2": sempre as 6 análises padrão; só tipo, métricas e ordem mudam. */
const CHAVE_FIXO = 'financeiro-graficos-fixo-v1'
function lerFixo() {
  const cs = ler<Config[]>(CHAVE_FIXO, (c) => valida(c as Config), PADRAO)
  const ok =
    cs.length === PADRAO.length &&
    PADRAO.every((p) => cs.some((c) => c.id === p.id && c.grupo === p.grupo && !c.codigo))
  return (ok ? cs : PADRAO).map(ajustar)
}
/**
 * Os gráficos padrão já vêm como favoritos (e formando o padrão). Entram uma vez só:
 * se a pessoa tirar algum dos favoritos depois, ele não volta sozinho.
 */
function lerFavoritos() {
  const fs = ler<Favorito[]>(CHAVE_FAV, (f) => valida((f as Favorito)?.config), [])
  try {
    if (localStorage.getItem(CHAVE_FAV_SEMEADO)) return fs
  } catch {
    /* sem armazenamento: semeia de novo a cada visita, sem problema */
  }
  const padrao = PADRAO.filter((c) => !fs.some((f) => assinatura(f.config) === assinatura(c)))
  const novos = [...padrao.map((config) => ({ config, noPadrao: true })), ...fs]
  gravar(CHAVE_FAV, novos)
  gravar(CHAVE_FAV_SEMEADO, true)
  return novos
}

/** Dois gráficos iguais (fora o id) são o mesmo favorito. */
const assinatura = (c: Config) =>
  JSON.stringify([c.tipo, c.grupo, c.metricas, c.titulo ?? '', c.codigo ?? null])
let seq = 0
const novoId = () => `${Date.now()}-${seq++}`

// ── Agregação ───────────────────────────────────────────────────────────────
interface Serie {
  rotulo: string
  cor: string
  /** Valores em centavos (mostra em R$) ou números simples. */
  reais: boolean
  valores: number[]
}
export interface Dados {
  /** Nome do que está no eixo (1ª coluna da tabela). */
  eixo: string
  categorias: string[]
  series: Serie[]
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const segundaDa = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`).getDay()
  return somarDias(iso, -((d + 6) % 7))
}
const chaveTempo = (g: Grupo, iso: string) =>
  g === 'mes' ? iso.slice(0, 7) : g === 'semana' ? segundaDa(iso) : iso
const rotuloTempo = (g: Grupo, chave: string) =>
  g === 'mes'
    ? `${MESES[Number(chave.slice(5, 7)) - 1]}/${chave.slice(2, 4)}`
    : dataBR(chave).slice(0, 5)

/** Faixas "redondas" para o histograma do valor dos orçamentos (até ~10 barras). */
function passoFaixa(max: number) {
  for (const p of [5000, 10000, 20000, 25000, 50000, 100000, 200000, 250000, 500000, 1000000])
    if (max / p <= 10) return p
  return 2000000
}
export const milReais = (c: number) =>
  (c / 100).toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })

function agregar(a: Analise, c: Config, de: string, ate: string): Dados {
  const soma = new Map<string, Record<Metrica, number>>()
  const orcsPor = new Map<string, Set<number>>()
  const zero = () => ({ faturamento: 0, custo: 0, lucro: 0, recebido: 0, quantidade: 0 })
  const somar = (k: string, m: Partial<Record<Metrica, number>>) => {
    const v = soma.get(k) ?? zero()
    for (const [x, n] of Object.entries(m)) v[x as Metrica] += n
    soma.set(k, v)
  }
  const passo = passoFaixa(Math.max(1, ...a.orcamentos.map((o) => o.totalCentavos)))

  if (GRUPOS[c.grupo].fonte !== 'entrada')
    for (const o of a.orcamentos) {
      const sub = o.itens.reduce((s, i) => s + i.valorCentavos, 0)
      // O desconto se divide entre os itens na proporção do valor.
      const fator = sub ? o.totalCentavos / sub : 0
      for (const i of o.itens) {
        const k =
          c.grupo === 'profissional'
            ? o.profissional.nome
            : c.grupo === 'procedimento'
              ? i.nome
              : c.grupo === 'especialidade'
                ? (i.especialidade ?? 'Sem especialidade')
                : c.grupo === 'faixa'
                  ? String(Math.floor(o.totalCentavos / passo))
                  : chaveTempo(c.grupo, o.aprovadoEm)
        const fat = Math.round(i.valorCentavos * fator)
        somar(k, { faturamento: fat, custo: i.custoCentavos, lucro: fat - i.custoCentavos })
        if (!orcsPor.has(k)) orcsPor.set(k, new Set())
        orcsPor.get(k)!.add(o.id)
      }
    }
  if (GRUPOS[c.grupo].fonte !== 'orc')
    for (const e of a.entradas) {
      const k =
        c.grupo === 'profissional'
          ? e.profissional.nome
          : c.grupo === 'forma'
            ? (e.forma ?? 'Não informada')
            : chaveTempo(c.grupo, e.data)
      somar(k, { recebido: e.valorCentavos, ...(c.grupo === 'forma' && { quantidade: 1 }) })
    }
  // Quantidade = orçamentos distintos (ou entradas, por forma de pagamento).
  if (c.grupo !== 'forma') for (const [k, s] of orcsPor) soma.get(k)!.quantidade = s.size

  let chaves: string[]
  let rotulos: string[]
  if (c.grupo === 'faixa') {
    const max = Math.max(-1, ...[...soma.keys()].map(Number))
    chaves = Array.from({ length: max + 1 }, (_, i) => String(i))
    rotulos = chaves.map(
      (k) => `R$ ${milReais(Number(k) * passo)}–${milReais((Number(k) + 1) * passo)}`,
    )
  } else if (GRUPOS[c.grupo].tempo) {
    // Todos os períodos entre De e Até, mesmo os vazios.
    const set = new Set<string>()
    for (let d = de; d <= ate; d = somarDias(d, 1)) set.add(chaveTempo(c.grupo, d))
    chaves = [...set]
    rotulos = chaves.map((k) => rotuloTempo(c.grupo, k))
  } else {
    const m0 = c.metricas[0]
    chaves = [...soma.keys()].sort((x, y) => soma.get(y)![m0] - soma.get(x)![m0])
    // Mais de 8 categorias: as menores viram "Outros".
    if (chaves.length > 8) {
      const outros = zero()
      for (const k of chaves.slice(7))
        for (const m of Object.keys(outros) as Metrica[]) outros[m] += soma.get(k)![m]
      chaves = [...chaves.slice(0, 7), 'Outros']
      soma.set('Outros', outros)
    }
    rotulos = chaves
  }
  return {
    categorias: rotulos,
    eixo: GRUPOS[c.grupo].rotulo.replace(' (histograma)', ''),
    series: c.metricas.map((m) => ({
      rotulo: METRICAS[m].rotulo,
      cor: METRICAS[m].cor,
      reais: METRICAS[m].reais,
      valores: chaves.map((k) => soma.get(k)?.[m] ?? 0),
    })),
  }
}

// ── Formatação e escala ─────────────────────────────────────────────────────
const formatar = (emReais: boolean, v: number) => (emReais ? reais(v) : v.toLocaleString('pt-BR'))
const formatarEixo = (emReais: boolean, v: number) =>
  emReais ? `R$ ${milReais(v)}` : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })

function escala(min: number, max: number) {
  const lo = Math.min(0, min)
  const hi = Math.max(lo + 1, max)
  const bruto = (hi - lo) / 4
  const pot = 10 ** Math.floor(Math.log10(bruto))
  const passo = [1, 2, 2.5, 5, 10].map((x) => x * pot).find((x) => x >= bruto)!
  const ini = Math.floor(lo / passo) * passo
  const fim = Math.ceil(hi / passo) * passo
  const marcas: number[] = []
  for (let v = ini; v <= fim + passo / 2; v += passo) marcas.push(v)
  return { ini, fim, marcas }
}

/** Barra com a ponta arredondada (4px) e a base reta, presa na linha do zero. */
function barra(x: number, y: number, w: number, h: number, horizontal: boolean, negativo: boolean) {
  const r = Math.min(4, (horizontal ? h : w) / 2, Math.abs(horizontal ? w : h))
  if (horizontal) {
    // Cresce para a direita (ou esquerda, se negativo) a partir de x.
    const s = negativo ? -1 : 1
    const fim = x + s * w
    return `M${x},${y}H${fim - s * r}Q${fim},${y} ${fim},${y + r}V${y + h - r}Q${fim},${y + h} ${fim - s * r},${y + h}H${x}Z`
  }
  const s = negativo ? 1 : -1
  const topo = y + s * h
  return `M${x},${y}V${topo - s * r}Q${x},${topo} ${x + r},${topo}H${x + w - r}Q${x + w},${topo} ${x + w},${topo - s * r}V${y}Z`
}

// ── Dica ao passar o mouse ──────────────────────────────────────────────────
interface Dica {
  x: number
  y: number
  titulo: string
  linhas: { cor: string; rotulo: string; valor: string }[]
}
function CaixaDica({ d }: { d: Dica | null }) {
  if (!d) return null
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 min-w-40 rounded-xl border border-borda bg-superficie px-3 py-2 text-xs shadow-lg"
      style={{ left: d.x, top: d.y, transform: `translate(${d.x > 300 ? '-105%' : '12px'}, -50%)` }}
    >
      <p className="mb-1 font-bold text-titulo">{d.titulo}</p>
      {d.linhas.map((l) => (
        <p key={l.rotulo} className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-sm" style={{ background: l.cor }} />
          <span className="text-suave">{l.rotulo}</span>
          <span className="ml-auto pl-3 font-bold tabular-nums">{l.valor}</span>
        </p>
      ))}
    </div>
  )
}

// ── Gráficos ────────────────────────────────────────────────────────────────
const L = 640
const A = 260
/** Largura mínima de cada coluna: com mais rótulos que isso, o gráfico rola para o lado. */
const POR_COLUNA = 18

/** Cor de cada categoria pela ordem alfabética (não pelo ranking): a mesma categoria tem a mesma cor. */
function coresDe(categorias: string[]) {
  const ordem = categorias.filter((c) => c !== 'Outros').sort((a, b) => a.localeCompare(b, 'pt-BR'))
  return (c: string) =>
    c === 'Outros' ? 'var(--serie-outros)' : `var(--serie-${(ordem.indexOf(c) % 8) + 1})`
}

/** porCategoria: com uma série só, cada coluna/barra ganha a cor da sua categoria. */
function Cartesiano(props: {
  dados: Dados
  tipo: Tipo
  porCategoria?: boolean
  aoDica: (d: Dica | null) => void
}) {
  const { categorias, series } = props.dados
  const corDe = coresDe([...categorias])
  const colorir =
    props.porCategoria &&
    series.length === 1 &&
    (props.tipo === 'colunas' || props.tipo === 'barras')
  const horizontal = props.tipo === 'barras'
  const todos = series.flatMap((s) => s.valores)
  const { ini, fim, marcas } = escala(Math.min(...todos), Math.max(...todos))
  const r0 = series[0].reais
  const n = categorias.length
  const esq = horizontal ? 130 : 64
  const base = horizontal ? 24 : 28
  // Muitas categorias: as colunas não encolhem abaixo de POR_COLUNA; o gráfico rola para o lado.
  const largura = horizontal ? L : Math.max(L, esq + 12 + n * POR_COLUNA)
  const larguraUtil = largura - esq - (horizontal ? 34 : 12)
  const alturaUtil = (horizontal ? Math.max(A, n * (14 * series.length + 14)) : A) - base - 10
  const altura = alturaUtil + base + 10
  const valorPara = (v: number) =>
    horizontal
      ? esq + ((v - ini) / (fim - ini)) * larguraUtil
      : 10 + alturaUtil - ((v - ini) / (fim - ini)) * alturaUtil
  const banda = (horizontal ? alturaUtil : larguraUtil) / n
  const pos = (i: number) => (horizontal ? 10 : esq) + i * banda
  const zero = valorPara(0)
  // Pula rótulos até caberem sem encostar (~6,5px por letra no tamanho 11).
  const maiorRotulo = Math.max(...categorias.map((c) => c.length))
  // Nas barras deitadas todos aparecem: com muitas, a caixa rola para baixo.
  const cada = horizontal ? 1 : Math.max(1, Math.ceil((maiorRotulo * 6.5 + 8) / banda))
  const [foco, setFoco] = useState<number | null>(null)

  const dica = (i: number, e: MouseEvent<SVGRectElement>) => {
    const r = e.currentTarget.closest('[data-dica]')!.getBoundingClientRect()
    setFoco(i)
    props.aoDica({
      x: e.clientX - r.left,
      y: e.clientY - r.top,
      titulo: categorias[i],
      linhas: series.map((s) => ({
        cor: colorir ? corDe(categorias[i]) : s.cor,
        rotulo: s.rotulo,
        valor: formatar(s.reais, s.valores[i]),
      })),
    })
  }

  const largo = largura > L
  return (
    // Passou do tamanho padrão: rola dentro do cartão em vez de esticá-lo.
    <div
      className={`${largo ? 'overflow-x-auto' : ''} ${horizontal ? 'max-h-[26rem] overflow-y-auto' : ''} print:max-h-none print:overflow-visible`}
    >
      <svg
        viewBox={`0 0 ${largura} ${altura}`}
        className={largo ? 'block' : 'block w-full'}
        style={largo ? { width: largura } : undefined}
        role="img"
        aria-label="Gráfico"
        onMouseLeave={() => {
          setFoco(null)
          props.aoDica(null)
        }}
      >
        {/* Grade e eixo de valores */}
        {marcas.map((v) => (
          <g key={v}>
            {horizontal ? (
              <>
                <line
                  x1={valorPara(v)}
                  x2={valorPara(v)}
                  y1={10}
                  y2={10 + alturaUtil}
                  stroke="var(--viz-grade)"
                />
                <text
                  x={valorPara(v)}
                  y={altura - 6}
                  textAnchor="middle"
                  fontSize={11}
                  fill="var(--suave)"
                >
                  {formatarEixo(r0, v)}
                </text>
              </>
            ) : (
              <>
                <line
                  x1={esq}
                  x2={largura - 12}
                  y1={valorPara(v)}
                  y2={valorPara(v)}
                  stroke="var(--viz-grade)"
                />
                <text
                  x={esq - 8}
                  y={valorPara(v) + 4}
                  textAnchor="end"
                  fontSize={11}
                  fill="var(--suave)"
                >
                  {formatarEixo(r0, v)}
                </text>
              </>
            )}
          </g>
        ))}
        {/* Rótulos das categorias */}
        {categorias.map((c, i) =>
          i % cada ? null : horizontal ? (
            <text
              key={i}
              x={esq - 8}
              y={pos(i) + banda / 2 + 4}
              textAnchor="end"
              fontSize={11}
              fill="var(--texto)"
            >
              {c.length > 20 ? `${c.slice(0, 19)}…` : c}
            </text>
          ) : (
            <text
              key={i}
              x={pos(i) + banda / 2}
              y={altura - 8}
              textAnchor="middle"
              fontSize={11}
              fill="var(--suave)"
            >
              {c}
            </text>
          ),
        )}
        {/* Destaque da categoria em foco */}
        {foco !== null &&
          (props.tipo === 'linha' || props.tipo === 'area' ? (
            <line
              x1={pos(foco) + banda / 2}
              x2={pos(foco) + banda / 2}
              y1={10}
              y2={10 + alturaUtil}
              stroke="var(--suave)"
              strokeDasharray="3 3"
            />
          ) : horizontal ? (
            <rect
              x={esq}
              y={pos(foco)}
              width={larguraUtil}
              height={banda}
              fill="var(--primaria-clara)"
            />
          ) : (
            <rect
              x={pos(foco)}
              y={10}
              width={banda}
              height={alturaUtil}
              fill="var(--primaria-clara)"
            />
          ))}

        {/* Marcas */}
        {props.tipo === 'linha' || props.tipo === 'area'
          ? series.map((s) => {
              const pts = s.valores.map((v, i) => [pos(i) + banda / 2, valorPara(v)] as const)
              const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join('')
              return (
                <g key={s.rotulo}>
                  {props.tipo === 'area' && (
                    <path
                      d={`${d}L${pts.at(-1)![0]},${zero}L${pts[0][0]},${zero}Z`}
                      fill={s.cor}
                      opacity={0.16}
                    />
                  )}
                  <path d={d} fill="none" stroke={s.cor} strokeWidth={2} strokeLinejoin="round" />
                  {(n <= 40 || foco !== null) &&
                    pts.map(([x, y], i) =>
                      n <= 40 || i === foco ? (
                        <circle
                          key={i}
                          cx={x}
                          cy={y}
                          r={i === foco ? 5 : 3.5}
                          fill={s.cor}
                          stroke="var(--superficie)"
                          strokeWidth={2}
                        />
                      ) : null,
                    )}
                </g>
              )
            })
          : series.map((s, si) => {
              const gap = 2
              const larg = Math.max(1, (banda * 0.78 - gap * (series.length - 1)) / series.length)
              return (
                <g key={s.rotulo} fill={s.cor}>
                  {s.valores.map((v, i) => {
                    if (!v) return null
                    const off = pos(i) + banda * 0.11 + si * (larg + gap)
                    const tam = Math.abs(valorPara(v) - zero)
                    return horizontal ? (
                      <path
                        key={i}
                        d={barra(zero, off, tam, larg, true, v < 0)}
                        fill={colorir ? corDe(categorias[i]) : undefined}
                      />
                    ) : (
                      <path
                        key={i}
                        d={barra(off, zero, larg, tam, false, v < 0)}
                        fill={colorir ? corDe(categorias[i]) : undefined}
                      />
                    )
                  })}
                </g>
              )
            })}
        <line
          {...(horizontal
            ? { x1: zero, x2: zero, y1: 10, y2: 10 + alturaUtil }
            : { x1: esq, x2: largura - 12, y1: zero, y2: zero })}
          stroke="var(--suave)"
        />
        {/* Áreas de toque, maiores que as marcas */}
        {categorias.map((_, i) => (
          <rect
            key={i}
            {...(horizontal
              ? { x: esq, y: pos(i), width: larguraUtil, height: banda }
              : { x: pos(i), y: 10, width: banda, height: alturaUtil })}
            fill="transparent"
            onMouseMove={(e) => dica(i, e)}
          />
        ))}
      </svg>
    </div>
  )
}

function Fatias(props: { dados: Dados; rosca: boolean; aoDica: (d: Dica | null) => void }) {
  const s = props.dados.series[0]
  const itens = props.dados.categorias
    .map((c, i) => ({ c, v: Math.max(0, s.valores[i]) }))
    .filter((x) => x.v > 0)
  // Cor segue a categoria (ordem alfabética), não a posição no ranking.
  const corDe = coresDe(itens.map((x) => x.c))
  const total = itens.reduce((t, x) => t + x.v, 0)
  const negativos = s.valores.some((v) => v < 0)
  const R = 110
  const r = props.rosca ? 64 : 0
  // Ângulo onde cada fatia começa (soma das anteriores, a partir do topo).
  const inicio = itens.map(
    (_, i) => -Math.PI / 2 + (itens.slice(0, i).reduce((t, x) => t + x.v, 0) / total) * Math.PI * 2,
  )
  const ponto = (raio: number, a: number) => [130 + raio * Math.cos(a), 130 + raio * Math.sin(a)]
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <svg
        viewBox="0 0 260 260"
        className="w-full max-w-64 shrink-0"
        role="img"
        aria-label="Gráfico em fatias"
        onMouseLeave={() => props.aoDica(null)}
      >
        {itens.map((x, i) => {
          const fatia = (x.v / total) * Math.PI * 2
          const a0 = inicio[i]
          const a1 = a0 + fatia
          const grande = fatia > Math.PI ? 1 : 0
          const [x0, y0] = ponto(R, a0)
          const [x1, y1] = ponto(R, a1 - 1e-6)
          const [x2, y2] = ponto(r, a1 - 1e-6)
          const [x3, y3] = ponto(r, a0)
          const d = r
            ? `M${x0},${y0}A${R},${R} 0 ${grande} 1 ${x1},${y1}L${x2},${y2}A${r},${r} 0 ${grande} 0 ${x3},${y3}Z`
            : `M130,130L${x0},${y0}A${R},${R} 0 ${grande} 1 ${x1},${y1}Z`
          return (
            <path
              key={x.c}
              d={d}
              fill={corDe(x.c)}
              stroke="var(--superficie)"
              strokeWidth={2}
              className="hover:opacity-80"
              onMouseMove={(e) => {
                const b = (e.currentTarget.ownerSVGElement as SVGSVGElement)
                  .closest('[data-dica]')!
                  .getBoundingClientRect()
                props.aoDica({
                  x: e.clientX - b.left,
                  y: e.clientY - b.top,
                  titulo: x.c,
                  linhas: [
                    {
                      cor: corDe(x.c),
                      rotulo: s.rotulo,
                      valor: `${formatar(s.reais, x.v)} · ${Math.round((x.v / total) * 100)}%`,
                    },
                  ],
                })
              }}
            />
          )
        })}
        {props.rosca && (
          <>
            <text x={130} y={124} textAnchor="middle" fontSize={12} fill="var(--suave)">
              Total
            </text>
            <text
              x={130}
              y={146}
              textAnchor="middle"
              fontSize={17}
              fontWeight={800}
              fill="var(--titulo)"
            >
              {s.reais ? `R$ ${milReais(total)}` : total.toLocaleString('pt-BR')}
            </text>
          </>
        )}
      </svg>
      {/* Legenda com os valores: a cor nunca é a única pista. */}
      <ul className="max-h-64 w-full min-w-0 space-y-1.5 overflow-y-auto pr-1 text-sm print:max-h-none print:overflow-visible">
        {itens.map((x) => (
          <li key={x.c} className="flex items-center gap-2">
            <span className="size-3 shrink-0 rounded" style={{ background: corDe(x.c) }} />
            <span className="min-w-0 flex-1 truncate">{x.c}</span>
            <span className="font-bold tabular-nums">{formatar(s.reais, x.v)}</span>
            <span className="w-10 text-right text-xs text-suave tabular-nums">
              {Math.round((x.v / total) * 100)}%
            </span>
          </li>
        ))}
        {negativos && (
          <li className="text-xs text-suave">Valores negativos ficam fora das fatias.</li>
        )}
      </ul>
    </div>
  )
}

function Tabela({ dados }: { dados: Dados }) {
  return (
    <div className="max-h-72 overflow-auto rounded-xl border border-borda print:max-h-none print:overflow-visible">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-superficie">
          <tr>
            <th className="border-b border-borda px-3 py-2 text-xs font-bold text-suave uppercase">
              {dados.eixo}
            </th>
            {dados.series.map((s) => (
              <th
                key={s.rotulo}
                className="border-b border-borda px-3 py-2 text-right text-xs font-bold text-suave uppercase"
              >
                {s.rotulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dados.categorias.map((c, i) => (
            <tr key={c + i} className="border-b border-borda last:border-0">
              <td className="px-3 py-1.5">{c}</td>
              {dados.series.map((s) => (
                <td key={s.rotulo} className="px-3 py-1.5 text-right tabular-nums">
                  {formatar(s.reais, s.valores[i])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Desenho pequeno de cada tipo, para o seletor. */
const DESENHO: Record<Tipo, ReactNode> = {
  colunas: <path d="M5 20V12M10 20V6M15 20V10M20 20V4" />,
  barras: <path d="M4 5h10M4 10h16M4 15h7M4 20h13" />,
  linha: <path d="M3 18l5-6 4 3 8-10" />,
  area: <path d="M3 20V16l5-6 4 3 8-8v15z" />,
  pizza: <path d="M12 3a9 9 0 1 0 9 9h-9zM14 2v8h8a8 8 0 0 0-8-8z" />,
  rosca: <path d="M12 3a9 9 0 1 0 9 9M12 3v4a5 5 0 1 0 5 5h4M12 3a9 9 0 0 1 9 9" />,
}

const tituloAuto = (c: Config) => {
  if (c.codigo) return 'Gráfico personalizado'
  const nomes = c.metricas.map((m) => METRICAS[m].rotulo)
  const lista = nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}` : nomes[0]
  return `${lista} por ${GRUPOS[c.grupo].rotulo.toLowerCase().replace(' (histograma)', '')}`
}
const tituloDe = (c: Config) => c.titulo?.trim() || tituloAuto(c)

// ── Gráfico personalizado (código) ──────────────────────────────────────────
/** Resultado do código → dados do gráfico: 1ª coluna = rótulo, as outras = séries numéricas. */
function paraDados(r: Resultado, emReais: boolean): Dados {
  if (!r.linhas.length) return { eixo: r.colunas[0] ?? '', categorias: [], series: [] }
  if (r.colunas.length < 2)
    throw new Error('O resultado precisa de pelo menos 2 colunas: o rótulo e um número.')
  return {
    eixo: r.colunas[0],
    categorias: r.linhas.map((l) => String(l[0] ?? '—')),
    series: r.colunas.slice(1).map((col, j) => {
      const valores = r.linhas.map((l) => Number(l[j + 1] ?? 0))
      if (valores.some((v) => !Number.isFinite(v)))
        throw new Error(`A coluna “${col}” precisa ter só números.`)
      return {
        rotulo: col,
        cor: `var(--serie-${(j % 8) + 1})`,
        reais: emReais,
        valores: emReais ? valores.map((v) => Math.round(v * 100)) : valores,
      }
    }),
  }
}

/** Mesma chave no cartão e no exportar: o CSV reaproveita o resultado já calculado. */
const consultaCodigo = (
  c: Config,
  analise: Analise | undefined,
  de: string,
  ate: string,
  versao: string,
) => ({
  queryKey: ['grafico-codigo', c.codigo, de, ate, versao],
  queryFn: async () =>
    paraDados(await executar({ ...c.codigo!, analise: analise!, de, ate }), c.codigo!.reais),
  enabled: !!c.codigo && !!analise,
  retry: false,
  staleTime: Infinity,
})

// ── Peças da edição ─────────────────────────────────────────────────────────
function SeletorTipo({ tipo, aoMudar }: { tipo: Tipo; aoMudar: (t: Tipo) => void }) {
  return (
    <div role="group" aria-label="Tipo de gráfico" className="flex rounded-xl bg-superficie-2 p-1">
      {(Object.keys(TIPOS) as Tipo[]).map((t) => (
        <button
          key={t}
          type="button"
          aria-label={TIPOS[t]}
          aria-pressed={tipo === t}
          title={TIPOS[t]}
          onClick={() => aoMudar(t)}
          className={`grid size-8 place-items-center rounded-lg ${tipo === t ? 'bg-primaria text-sobre-primaria' : 'text-suave hover:text-texto'}`}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {DESENHO[t]}
          </svg>
        </button>
      ))}
    </div>
  )
}

/** Botões lado a lado, um marcado (SQL/Python, R$/Número). */
function Opcoes<T extends string>(props: {
  rotulo: string
  valor: T
  opcoes: [T, string][]
  aoMudar: (v: T) => void
}) {
  return (
    <div role="group" aria-label={props.rotulo} className="flex rounded-xl bg-superficie-2 p-1">
      {props.opcoes.map(([v, r]) => (
        <button
          key={v}
          type="button"
          aria-pressed={props.valor === v}
          onClick={() => props.aoMudar(v)}
          className={`rounded-lg px-3 py-1 text-sm font-bold ${props.valor === v ? 'bg-primaria text-sobre-primaria shadow-sm' : 'text-suave hover:text-texto'}`}
        >
          {r}
        </button>
      ))}
    </div>
  )
}

/** Tipo, agrupamento e métricas. No gráfico de código, só o tipo. */
function EditorConfig({
  c,
  aoMudar,
  semGrupo = false,
}: {
  c: Config
  aoMudar: (c: Config) => void
  /** Sem o seletor de agrupamento (análise fixa). */
  semGrupo?: boolean
}) {
  const mudar = (d: Partial<Config>) => aoMudar(ajustar({ ...c, ...d }))
  const alternar = (m: Metrica) => {
    if (EM_FATIAS(c.tipo)) return mudar({ metricas: [m] })
    const tem = c.metricas.includes(m)
    if (tem && c.metricas.length === 1) return
    // Quantidade não divide eixo com reais: um eixo só por gráfico.
    const ok = (x: Metrica) => METRICAS[x].reais === METRICAS[m].reais
    mudar({ metricas: tem ? c.metricas.filter((x) => x !== m) : [...c.metricas.filter(ok), m] })
  }
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <SeletorTipo tipo={c.tipo} aoMudar={(tipo) => mudar({ tipo })} />
        {semGrupo ? null : c.codigo ? (
          <span className="etiqueta etiqueta-primaria font-mono">
            {c.codigo.linguagem === 'sql' ? 'SQL' : 'Python'}
          </span>
        ) : (
          <label className="min-w-44 flex-1">
            <span className="sr-only">Agrupar por</span>
            <CampoSelect
              value={c.grupo}
              onChange={(e) => mudar({ grupo: e.target.value as Grupo })}
              vazio={false}
              opcoes={Object.fromEntries(
                Object.entries(GRUPOS).map(([k, g]) => [k, `Por ${g.rotulo.toLowerCase()}`]),
              )}
            />
          </label>
        )}
      </div>
      {!c.codigo && (
        <div role="group" aria-label="Métricas" className="flex flex-wrap gap-1.5">
          {(Object.keys(METRICAS) as Metrica[]).map((m) => {
            const ativo = c.metricas.includes(m)
            const pode = disponiveis(c.grupo).includes(m)
            return (
              <button
                key={m}
                type="button"
                aria-pressed={ativo}
                disabled={!pode}
                title={pode ? undefined : 'Não se aplica a este agrupamento'}
                onClick={() => alternar(m)}
                className={`inline-flex items-center gap-1.5 rounded-full border-2 px-2.5 py-0.5 text-xs font-bold ${ativo ? 'border-primaria bg-primaria-clara text-texto' : 'border-borda text-suave hover:border-primaria/50'} disabled:border-transparent disabled:bg-desativado disabled:text-desativado-texto`}
              >
                {ativo && !EM_FATIAS(c.tipo) && (
                  <span className="size-2.5 rounded-sm" style={{ background: METRICAS[m].cor }} />
                )}
                {METRICAS[m].rotulo}
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}

/** O desenho (ou a tabela) a partir dos dados já prontos. */
export function Visual(props: {
  tipo: Tipo
  dados: Dados | null
  tabela: boolean
  erro?: string
  /** Texto enquanto não há dados (padrão: "Carregando…"). */
  aviso?: string
  /** Barras/colunas de uma série: uma cor por categoria. */
  porCategoria?: boolean
}) {
  const { tipo, dados, tabela } = props
  const [dica, setDica] = useState<Dica | null>(null)
  const vazio = !dados || dados.series.every((s) => s.valores.every((v) => !v))
  return (
    <div data-dica className="relative min-h-40">
      {props.erro ? (
        <pre className="alerta-perigo text-xs whitespace-pre-wrap">{props.erro}</pre>
      ) : !dados ? (
        <p className="py-16 text-center text-suave">{props.aviso ?? 'Carregando…'}</p>
      ) : vazio ? (
        <p className="py-16 text-center text-suave">Sem dados no período.</p>
      ) : tabela ? (
        <Tabela dados={dados} />
      ) : EM_FATIAS(tipo) ? (
        <Fatias dados={dados} rosca={tipo === 'rosca'} aoDica={setDica} />
      ) : (
        <>
          {dados.series.length > 1 && (
            <ul className="mb-1 flex flex-wrap gap-3 text-xs">
              {dados.series.map((s) => (
                <li key={s.rotulo} className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm" style={{ background: s.cor }} />
                  {s.rotulo}
                  <strong className="tabular-nums">
                    {formatar(
                      s.reais,
                      s.valores.reduce((t, v) => t + v, 0),
                    )}
                  </strong>
                </li>
              ))}
            </ul>
          )}
          <Cartesiano
            dados={dados}
            tipo={tipo}
            porCategoria={props.porCategoria}
            aoDica={setDica}
          />
        </>
      )}
      {!tabela && <CaixaDica d={dica} />}
    </div>
  )
}

const SETAS: Record<string, number> = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }

function CartaoGrafico(props: {
  config: Config
  analise: Analise | undefined
  de: string
  ate: string
  /** Muda quando os dados da tela mudam (recalcula o código). */
  versao: string
  favorito: boolean
  /** Análise fixa: sem favoritar, remover nem trocar o agrupamento. */
  fixo: boolean
  /** Durante a impressão: fora = não sai no PDF; comTabela = sai também a tabela. */
  fora: boolean
  comTabela: boolean
  arrastando: boolean
  aoMudar: (c: Config) => void
  aoRemover: () => void
  aoEditar: () => void
  aoFavoritar: () => void
  aoMover: (passo: number) => void
  aoArrastar: (ativo: boolean) => void
  aoPassar: () => void
}) {
  const c = props.config
  const [tabela, setTabela] = useState(false)
  const [pega, setPega] = useState(false)
  const calculado = useMemo(
    () => (!c.codigo && props.analise ? agregar(props.analise, c, props.de, props.ate) : null),
    [props.analise, c, props.de, props.ate],
  )
  const doCodigo = useQuery(consultaCodigo(c, props.analise, props.de, props.ate, props.versao))
  const dados = c.codigo ? (doCodigo.data ?? null) : calculado
  const titulo = tituloDe(c)

  return (
    <section
      draggable={pega}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', c.id) // o Firefox só arrasta com algum dado
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
      className={`cartao viz flex flex-col gap-3 print:break-inside-avoid ${props.arrastando ? 'opacity-50 ring-2 ring-primaria' : ''} ${props.fora ? 'print:hidden' : ''}`}
    >
      <header className="flex items-start gap-1.5">
        <button
          type="button"
          className="botao-fantasma botao-icone -ml-1 size-7 shrink-0 cursor-grab text-suave active:cursor-grabbing print:hidden"
          aria-label={`Mover o gráfico ${titulo}`}
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
        <h2 className="min-w-0 flex-1 pt-0.5 text-base">{titulo}</h2>
        <div className="flex shrink-0 gap-1 print:hidden">
          {!props.fixo && (
            <button
              type="button"
              className={`botao-fantasma botao-icone size-7 ${props.favorito ? 'text-aviso' : 'text-suave'}`}
              aria-pressed={props.favorito}
              aria-label={`Favoritar o gráfico ${titulo}`}
              title={props.favorito ? 'Tirar dos favoritos' : 'Favoritar'}
              onClick={props.aoFavoritar}
            >
              <Icone nome="estrela" className={`h-4 w-4 ${props.favorito ? 'fill-current' : ''}`} />
            </button>
          )}
          <button
            type="button"
            className={`botao-fantasma botao-pequeno ${tabela ? 'bg-primaria-clara' : ''}`}
            aria-pressed={tabela}
            onClick={() => setTabela(!tabela)}
          >
            Tabela
          </button>
          {c.codigo && (
            <button
              type="button"
              className="botao-fantasma botao-icone size-7 text-suave"
              aria-label={`Editar o código do gráfico ${titulo}`}
              title="Editar o código"
              onClick={props.aoEditar}
            >
              <Icone nome="lapis" className="h-4 w-4" />
            </button>
          )}
          {!props.fixo && (
            <button
              type="button"
              className="botao-fantasma botao-icone size-7 text-suave hover:bg-perigo/10 hover:text-perigo"
              aria-label={`Remover o gráfico ${titulo}`}
              title="Remover gráfico"
              onClick={props.aoRemover}
            >
              <Icone nome="fechar" className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      <div className="space-y-3 print:hidden">
        <EditorConfig c={c} aoMudar={props.aoMudar} semGrupo={props.fixo} />
      </div>
      <Visual
        tipo={c.tipo}
        dados={dados}
        tabela={tabela}
        erro={doCodigo.error?.message}
        aviso={c.codigo ? 'Rodando o código…' : undefined}
      />
      {props.comTabela && !tabela && dados && (
        <div className="hidden print:block">
          <Tabela dados={dados} />
        </div>
      )}
    </section>
  )
}

// ── Janelas ─────────────────────────────────────────────────────────────────
function ListaFavoritos(props: {
  favoritos: Favorito[]
  aoAdicionar: (c: Config) => void
  aoDesfavoritar: (c: Config) => void
}) {
  return (
    <details className="rounded-xl border border-borda px-3 py-2">
      <summary className="cursor-pointer font-bold">
        <Icone
          nome="estrela"
          className="mr-1 inline h-4 w-4 fill-current align-[-3px] text-aviso"
        />
        Adicionar um favorito ({props.favoritos.length})
      </summary>
      <ul className="mt-2 space-y-1.5">
        {props.favoritos.map((f) => (
          <li
            key={assinatura(f.config)}
            className="flex items-center gap-2 rounded-xl bg-superficie-2 px-3 py-1.5"
          >
            <span className="min-w-0 flex-1 truncate font-bold">{tituloDe(f.config)}</span>
            <span className="text-xs text-suave">
              {f.config.codigo ? `${f.config.codigo.linguagem.toUpperCase()} · ` : ''}
              {TIPOS[f.config.tipo]}
            </span>
            <button
              type="button"
              className="botao-leve botao-pequeno"
              onClick={() => props.aoAdicionar(f.config)}
            >
              Adicionar
            </button>
            <button
              type="button"
              className="botao-fantasma botao-icone size-7 text-suave hover:text-perigo"
              aria-label={`Tirar ${tituloDe(f.config)} dos favoritos`}
              title="Tirar dos favoritos"
              onClick={() => props.aoDesfavoritar(f.config)}
            >
              <Icone nome="fechar" className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </details>
  )
}

/** Variáveis que o código enxerga, para consulta ao lado do editor. */
function PainelVariaveis({ linguagem }: { linguagem: Linguagem }) {
  const sql = linguagem === 'sql'
  return (
    <aside
      aria-label="Variáveis disponíveis"
      className="space-y-3 overflow-y-auto rounded-xl border border-borda bg-superficie-2 p-3 text-xs lg:h-80"
    >
      <div>
        <h3 className="text-sm">Variáveis disponíveis</h3>
        <p className="text-suave">
          {sql
            ? 'Tabelas que a consulta pode ler.'
            : 'Parâmetros de grafico(): listas de dicionários.'}{' '}
          Já vêm filtradas pelo período e pelos profissionais da tela. Dinheiro em reais.
        </p>
      </div>
      {VARIAVEIS.map((v) => (
        <div key={v.nome}>
          <p className="font-mono text-sm font-bold text-primaria">{v.nome}</p>
          <p className="mb-1 text-suave">{v.descricao}</p>
          <ul className="space-y-0.5">
            {v.colunas.map(([c, t, d]) => (
              <li key={c}>
                <code className="font-bold text-texto">{c}</code>{' '}
                <span className="text-suave">
                  {tipoLegivel(t)}
                  {d && ` · ${d}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div>
        <p className="font-mono text-sm font-bold text-primaria">{sql ? 'periodo' : 'de, ate'}</p>
        <p className="text-suave">
          {sql
            ? 'Uma linha só: de e ate (texto AAAA-MM-DD), o período escolhido.'
            : 'Texto AAAA-MM-DD: o período escolhido.'}
        </p>
      </div>
    </aside>
  )
}

/** Prompt modelo para pedir o código a uma IA: só a finalidade, no fim, muda. */
function PromptIA({ linguagem }: { linguagem: Linguagem }) {
  const [finalidade, setFinalidade] = useState('')
  const [copiado, setCopiado] = useState(false)
  const nome = linguagem === 'sql' ? 'SQL' : 'Python'
  const texto = promptModelo(linguagem, finalidade)
  return (
    <details className="rounded-xl border border-borda px-3 py-2">
      <summary className="cursor-pointer font-bold">
        Pedir o código a uma IA{' '}
        <span className="etiqueta etiqueta-primaria ml-1 font-mono">{nome}</span>
      </summary>
      <div className="mt-2 space-y-2">
        <p className="rounded-xl border-l-4 border-primaria bg-primaria-clara px-3 py-2 text-sm">
          A IA vai escrever{' '}
          <strong>
            {linguagem === 'sql'
              ? 'uma consulta SQL (SQLite)'
              : 'uma função Python 3 (só a biblioteca padrão)'}
          </strong>
          , porque é a linguagem escolhida lá em cima. Para pedir em{' '}
          {linguagem === 'sql' ? 'Python' : 'SQL'}, troque a opção “Linguagem” e copie de novo.
        </p>
        <p className="text-xs text-suave">
          Prompt pronto com as variáveis ao lado. Escreva só a finalidade, copie e cole na IA. Ele
          não leva nenhum dado, só os nomes das colunas.
        </p>
        <label className="block">
          <span className="rotulo">Finalidade do gráfico</span>
          <input
            className="campo"
            placeholder="Ex.: ticket médio por profissional em cada mês"
            value={finalidade}
            onChange={(e) => setFinalidade(e.target.value)}
          />
        </label>
        <textarea
          readOnly
          aria-label="Prompt para a IA"
          className="campo h-44 font-mono text-xs"
          value={texto}
        />
        <button
          type="button"
          className="botao-leve botao-pequeno"
          onClick={async () => {
            await navigator.clipboard.writeText(texto)
            setCopiado(true)
            setTimeout(() => setCopiado(false), 2000)
          }}
        >
          {copiado ? 'Copiado!' : `Copiar prompt em ${nome}`}
        </button>
      </div>
    </details>
  )
}

/** Gráfico personalizado: o código (SQL ou Python) gera os dados. Novo ou editando um. */
function CorpoCodigo(props: {
  inicial: Config | null
  favoritos: Favorito[]
  favorito: (c: Config) => boolean
  analise: Analise | undefined
  de: string
  ate: string
  aoSalvar: (c: Config, favoritar: boolean) => void
  aoAdicionarFavorito: (c: Config) => void
  aoDesfavoritar: (c: Config) => void
  aoFechar: () => void
}) {
  const ini = props.inicial?.codigo
  const [titulo, setTitulo] = useState(props.inicial?.titulo ?? '')
  const [linguagem, setLinguagem] = useState<Linguagem>(ini?.linguagem ?? 'sql')
  // Cada linguagem guarda o seu código: trocar e voltar não perde o que foi escrito.
  const [fontes, setFontes] = useState(() => ({
    ...MODELOS,
    ...(ini && { [ini.linguagem]: ini.fonte }),
  }))
  const [tipo, setTipo] = useState<Tipo>(props.inicial?.tipo ?? 'colunas')
  const [emReais, setEmReais] = useState(ini?.reais ?? true)
  const [fav, setFav] = useState(() => !!props.inicial && props.favorito(props.inicial))
  const [teste, setTeste] = useState<{ r?: Resultado; erro?: string; saida: string[] } | null>(null)
  const [rodando, setRodando] = useState(false)
  const fonte = fontes[linguagem]
  const montar = (): Config => ({
    id: props.inicial?.id ?? novoId(),
    tipo,
    grupo: 'mes',
    metricas: ['faturamento'],
    titulo: titulo.trim() || undefined,
    codigo: { linguagem, fonte, reais: emReais },
  })

  const testar = async () => {
    if (!props.analise || rodando) return null
    setRodando(true)
    try {
      const r = await executar({
        linguagem,
        fonte,
        analise: props.analise,
        de: props.de,
        ate: props.ate,
      })
      setTeste({ r, saida: r.saida })
      return r
    } catch (e) {
      setTeste({ erro: (e as Error).message, saida: (e as { saida?: string[] }).saida ?? [] })
      return null
    } finally {
      setRodando(false)
    }
  }
  // A prévia segue tipo e formato na hora, sem rodar de novo.
  let previa: Dados | null = null
  let erro = teste?.erro
  try {
    if (teste?.r) previa = paraDados(teste.r, emReais)
  } catch (e) {
    erro = (e as Error).message
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault()
        const r = await testar()
        if (!r) return
        try {
          paraDados(r, emReais)
        } catch {
          return // o erro já aparece na prévia
        }
        props.aoSalvar(montar(), fav)
      }}
    >
      {!props.inicial && props.favoritos.length > 0 && (
        <ListaFavoritos
          favoritos={props.favoritos}
          aoAdicionar={props.aoAdicionarFavorito}
          aoDesfavoritar={props.aoDesfavoritar}
        />
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-52 flex-1">
          <span className="rotulo">Título</span>
          <input
            className="campo"
            placeholder="Gráfico personalizado"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
          />
        </label>
        <div>
          <span className="rotulo">Linguagem</span>
          <Opcoes
            rotulo="Linguagem"
            valor={linguagem}
            opcoes={[
              ['sql', 'SQL'],
              ['python', 'Python'],
            ]}
            aoMudar={(l) => {
              setLinguagem(l)
              setTeste(null)
            }}
          />
        </div>
        <div>
          <span className="rotulo">Tipo</span>
          <SeletorTipo tipo={tipo} aoMudar={setTipo} />
        </div>
        <div>
          <span className="rotulo">Valores em</span>
          <Opcoes
            rotulo="Valores em"
            valor={emReais ? 'reais' : 'numero'}
            opcoes={[
              ['reais', 'R$'],
              ['numero', 'Número'],
            ]}
            aoMudar={(v) => setEmReais(v === 'reais')}
          />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 space-y-2">
          <EditorCodigo
            id="codigo-grafico"
            rotulo={linguagem === 'sql' ? 'Consulta SQL' : 'Função Python'}
            linguagem={linguagem}
            valor={fonte}
            aoMudar={(v) => setFontes({ ...fontes, [linguagem]: v })}
            aoRodar={testar}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="botao-leve"
              disabled={rodando || !props.analise}
              onClick={testar}
            >
              {rodando ? 'Rodando…' : '▶ Testar'}
            </button>
            <span className="text-xs text-suave">
              Ctrl+Enter também testa.{' '}
              {linguagem === 'sql'
                ? 'SQL no padrão SQLite.'
                : 'Python 3, só a biblioteca padrão. Na primeira vez o Python leva alguns segundos para carregar.'}
            </span>
          </div>
        </div>
        <PainelVariaveis linguagem={linguagem} />
      </div>

      {!!teste?.saida.length && (
        <div>
          <span className="rotulo">Saída do print()</span>
          <pre className="max-h-32 overflow-auto rounded-xl bg-[#1e1e1e] p-3 font-mono text-xs text-[#d4d4d4]">
            {teste.saida.join('\n')}
          </pre>
        </div>
      )}
      <div className="viz rounded-2xl border border-borda p-3">
        <p className="mb-2 text-xs font-extrabold tracking-wide text-suave uppercase">
          Prévia · {titulo.trim() || 'Gráfico personalizado'}
        </p>
        <Visual
          tipo={montar().tipo}
          dados={previa}
          tabela={false}
          erro={erro}
          aviso={rodando ? 'Rodando o código…' : 'Clique em “Testar” para ver o gráfico.'}
        />
      </div>

      <PromptIA linguagem={linguagem} />

      <label className="flex items-center gap-2 font-bold">
        <input type="checkbox" checked={fav} onChange={(e) => setFav(e.target.checked)} />
        <Icone nome="estrela" className="h-4 w-4 text-aviso" />
        Favoritar este gráfico
      </label>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" className="botao-leve" onClick={props.aoFechar}>
          Cancelar
        </button>
        <button className="botao" disabled={rodando || !props.analise}>
          {props.inicial ? 'Salvar' : 'Adicionar gráfico'}
        </button>
      </div>
    </form>
  )
}

/** Restaurar apaga a arrumação atual: pede para digitar "restaurar". */
function CorpoRestaurar(props: {
  /** Análises fixas: sem lista de favoritos, só volta ao original. */
  fixo?: boolean
  favoritos: Favorito[]
  aoConfirmar: (noPadrao: boolean[]) => void
  aoFechar: () => void
}) {
  const [marcados, setMarcados] = useState(() => props.favoritos.map((f) => f.noPadrao))
  const [texto, setTexto] = useState('')
  const ok = texto.trim().toLowerCase() === 'restaurar'
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (ok) props.aoConfirmar(marcados)
      }}
    >
      {props.fixo ? (
        <p>As 6 análises voltam ao tipo de gráfico, às métricas e à ordem originais.</p>
      ) : (
        <p>
          Os gráficos que estão na tela, com a ordem e as mudanças feitas neles, serão trocados
          pelos favoritos marcados abaixo. Os favoritos não são apagados.
        </p>
      )}
      {props.fixo ? null : props.favoritos.length ? (
        <fieldset className="space-y-1.5">
          <legend className="rotulo">Gráficos que formam o padrão (fica lembrado)</legend>
          {props.favoritos.map((f, i) => (
            <label
              key={assinatura(f.config)}
              className="flex cursor-pointer items-center gap-2 rounded-xl border border-borda px-3 py-2"
            >
              <input
                type="checkbox"
                checked={marcados[i]}
                onChange={() => setMarcados(marcados.map((m, j) => (j === i ? !m : m)))}
              />
              <Icone nome="estrela" className="h-4 w-4 shrink-0 fill-current text-aviso" />
              <span className="min-w-0 flex-1 truncate font-bold">{tituloDe(f.config)}</span>
              <span className="text-xs text-suave">{TIPOS[f.config.tipo]}</span>
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="text-sm text-suave">
          Sem favoritos: voltam os gráficos padrão do sistema. Favorite um gráfico (estrela no
          cartão) para poder escolhê-lo aqui.
        </p>
      )}
      <label className="block">
        <span className="rotulo">
          Para confirmar, digite <strong className="text-perigo">restaurar</strong>
        </span>
        <input
          className="campo"
          autoFocus
          autoComplete="off"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" className="botao-leve" onClick={props.aoFechar}>
          Voltar
        </button>
        <button className="botao-perigo" disabled={!ok}>
          Restaurar padrão
        </button>
      </div>
    </form>
  )
}

type Formato = 'pdf' | 'csv'
function CorpoExportar(props: {
  configs: Config[]
  aoExportar: (ids: string[], formato: Formato, tabelas: boolean) => void
  aoFechar: () => void
}) {
  const [sel, setSel] = useState(() => props.configs.map((c) => c.id))
  const [formato, setFormato] = useState<Formato>('pdf')
  const [tabelas, setTabelas] = useState(true)
  const todos = sel.length === props.configs.length
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        props.aoExportar(
          props.configs.filter((c) => sel.includes(c.id)).map((c) => c.id),
          formato,
          tabelas,
        )
      }}
    >
      <fieldset className="space-y-1.5">
        <legend className="flex w-full items-center justify-between">
          <span className="rotulo">Gráficos</span>
          <button
            type="button"
            className="botao-fantasma botao-pequeno"
            onClick={() => setSel(todos ? [] : props.configs.map((c) => c.id))}
          >
            {todos ? 'Desmarcar todos' : 'Marcar todos'}
          </button>
        </legend>
        <div className="max-h-64 space-y-1.5 overflow-auto">
          {props.configs.map((c) => (
            <label
              key={c.id}
              className="flex cursor-pointer items-center gap-2 rounded-xl border border-borda px-3 py-2"
            >
              <input
                type="checkbox"
                checked={sel.includes(c.id)}
                onChange={() =>
                  setSel(sel.includes(c.id) ? sel.filter((x) => x !== c.id) : [...sel, c.id])
                }
              />
              <span className="min-w-0 flex-1 truncate font-bold">{tituloDe(c)}</span>
              <span className="text-xs text-suave">{TIPOS[c.tipo]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-1.5">
        <legend className="rotulo">Formato</legend>
        {(
          [
            ['pdf', 'PDF ou impressão', 'Os gráficos como estão na tela.'],
            ['csv', 'Planilha (CSV)', 'Os números de cada gráfico, para abrir no Excel.'],
          ] as const
        ).map(([v, rotulo, desc]) => (
          <label
            key={v}
            className={`flex cursor-pointer items-start gap-2 rounded-xl border-2 px-3 py-2 ${formato === v ? 'border-primaria bg-primaria-clara' : 'border-borda'}`}
          >
            <input
              type="radio"
              name="formato"
              className="mt-1"
              checked={formato === v}
              onChange={() => setFormato(v)}
            />
            <span>
              <span className="block font-bold">{rotulo}</span>
              <span className="text-xs text-suave">{desc}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {formato === 'pdf' && (
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={tabelas} onChange={(e) => setTabelas(e.target.checked)} />
          Incluir a tabela de dados de cada gráfico
        </label>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className="botao-leve" onClick={props.aoFechar}>
          Cancelar
        </button>
        <button className="botao" disabled={!sel.length}>
          <Icone nome="baixar" className="h-4 w-4" />
          Exportar {sel.length} {sel.length === 1 ? 'gráfico' : 'gráficos'}
        </button>
      </div>
    </form>
  )
}

/** Uma planilha com um bloco por gráfico (ponto e vírgula e BOM: o Excel em português abre direto). */
function baixarCsv(partes: { titulo: string; dados: Dados }[], nome: string) {
  const cel = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const num = (s: Serie, v: number) =>
    s.reais ? (v / 100).toFixed(2).replace('.', ',') : String(v).replace('.', ',')
  const linhas = partes.flatMap(({ titulo, dados }) => [
    [titulo],
    [dados.eixo, ...dados.series.map((s) => `${s.rotulo}${s.reais ? ' (R$)' : ''}`)],
    ...dados.categorias.map((c, i) => [c, ...dados.series.map((s) => num(s, s.valores[i]))]),
    [],
  ])
  const texto = '﻿' + linhas.map((l) => l.map(cel).join(';')).join('\r\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }))
  a.download = nome
  a.click()
  URL.revokeObjectURL(a.href)
}

// ── Página ──────────────────────────────────────────────────────────────────
type Janela = null | 'novo' | 'restaurar' | 'exportar' | Config

/** fixo: "Gráficos 2", as 6 análises padrão sempre na tela (sem adicionar, favoritar ou remover). */
export function Graficos({ fixo = false }: { fixo?: boolean }) {
  const p = useIntervalo()
  const { intervalo, tudo, hoje, consulta, resumo } = p
  const analise = useQuery(consultaAnalise({ ...consulta, profissionalId: '' }))
  const clienteQuery = useQueryClient()
  // Profissionais filtrados aqui, para marcar vários de uma vez (como no Controle Financeiro).
  const [ocultos, setOcultos] = useState<number[]>([])
  const dados = useMemo(
    () =>
      analise.data && {
        orcamentos: analise.data.orcamentos.filter((o) => !ocultos.includes(o.profissional.id)),
        entradas: analise.data.entradas.filter((e) => !ocultos.includes(e.profissional.id)),
      },
    [analise.data, ocultos],
  )
  const versao = `${analise.dataUpdatedAt}:${ocultos.join(',')}`
  const porProf = useMemo(() => faturamentoPorProfissional(analise.data), [analise.data])
  // "Todo o período": o eixo vai da primeira à última data com movimento.
  const { de, ate } = useMemo(() => {
    if (!tudo) return intervalo
    const ds = [
      ...(dados?.orcamentos.map((o) => o.aprovadoEm) ?? []),
      ...(dados?.entradas.map((e) => e.data) ?? []),
    ].sort()
    return { de: ds[0] ?? hoje, ate: ds.at(-1) ?? hoje }
  }, [tudo, intervalo, dados, hoje])

  const [configs, setConfigs] = useState<Config[]>(fixo ? lerFixo : lerSalvo)
  const [favoritos, setFavoritos] = useState<Favorito[]>(() => (fixo ? [] : lerFavoritos()))
  const [janela, setJanela] = useState<Janela>(null)
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [impressao, setImpressao] = useState<{ ids: string[]; tabelas: boolean } | null>(null)

  const salvar = (f: (cs: Config[]) => Config[]) =>
    setConfigs((cs) => {
      const n = f(cs)
      gravar(fixo ? CHAVE_FIXO : CHAVE_LOCAL, n)
      return n
    })
  const salvarFavoritos = (fs: Favorito[]) => {
    setFavoritos(fs)
    gravar(CHAVE_FAV, fs)
  }
  const ehFavorito = (c: Config) => favoritos.some((f) => assinatura(f.config) === assinatura(c))
  const definirFavorito = (c: Config, sim: boolean) => {
    if (sim === ehFavorito(c)) return
    salvarFavoritos(
      sim
        ? [...favoritos, { config: c, noPadrao: false }]
        : favoritos.filter((f) => assinatura(f.config) !== assinatura(c)),
    )
  }
  const moverPara = (id: string, para: number) =>
    salvar((cs) => {
      const atual = cs.findIndex((x) => x.id === id)
      if (atual < 0 || para < 0 || para >= cs.length || atual === para) return cs
      const n = [...cs]
      n.splice(para, 0, n.splice(atual, 1)[0])
      return n
    })
  const remover = async (c: Config) => {
    const ok = await confirmar(
      `“${tituloDe(c)}” sai da tela. ${ehFavorito(c) ? 'Ele continua nos favoritos.' : 'Para tê-lo de novo será preciso montá-lo outra vez (ou favoritá-lo antes).'}`,
      { titulo: 'Excluir gráfico?' },
    )
    if (ok) salvar((cs) => cs.filter((x) => x.id !== c.id))
  }
  const exportar = async (ids: string[], formato: Formato, tabelas: boolean) => {
    setJanela(null)
    const escolhidos = configs.filter((c) => ids.includes(c.id))
    if (formato === 'csv') {
      try {
        const partes = await Promise.all(
          escolhidos.map(async (c) => ({
            titulo: tituloDe(c),
            dados: c.codigo
              ? await clienteQuery.fetchQuery(consultaCodigo(c, dados, de, ate, versao))
              : agregar(dados!, c, de, ate),
          })),
        )
        baixarCsv(partes, `graficos-${de}-a-${ate}.csv`)
      } catch (e) {
        avisar(`Não deu para exportar: ${(e as Error).message}`, true)
      }
      return
    }
    // Esconde (só na impressão) o que não foi escolhido; o "Salvar como PDF" é do navegador.
    flushSync(() => setImpressao({ ids, tabelas }))
    print()
    setImpressao(null)
  }
  const editando = typeof janela === 'object' ? janela : null
  const fechar = () => setJanela(null)

  return (
    // No computador só a área dos gráficos rola; título e filtros ficam parados.
    <div className="mx-auto flex max-w-[1320px] flex-col gap-3 lg:h-[calc(100dvh-6.5rem)] print:h-auto">
      <header className="flex flex-wrap items-center gap-3.5">
        <h1 className="titulo">{fixo ? 'Gráficos 2' : 'Gráficos'}</h1>
        <span aria-hidden="true" className="h-6 w-px bg-borda" />
        <span className="text-base text-suave">
          {configs.length} {configs.length === 1 ? 'gráfico' : 'gráficos'}
        </span>
        <p className="hidden w-full print:block">Período: {resumo}</p>
      </header>

      {/* ---------- Filtros (modelo de Orçamentos abertos) e ações à direita ---------- */}
      <div className="cartao flex flex-wrap items-center gap-2 py-2 print:hidden">
        <PeriodoSuspenso p={p} />
        <ProfissionaisSuspenso
          ocultos={ocultos}
          aoMudar={setOcultos}
          valor={(id) => reais(porProf.get(id) ?? 0)}
        />
        <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
          <button
            className="botao-leve py-1.5"
            disabled={!configs.length || !dados}
            onClick={() => setJanela('exportar')}
          >
            <Icone nome="baixar" className="h-4 w-4" />
            Exportar
          </button>
          <button className="botao-leve py-1.5" onClick={() => setJanela('restaurar')}>
            Restaurar padrão
          </button>
          {!fixo && (
            <button className="botao py-1.5" onClick={() => setJanela('novo')}>
              <Icone nome="mais" className="h-4 w-4" />
              Adicionar gráfico
            </button>
          )}
        </div>
      </div>

      {analise.isError && <p className="alerta-perigo">{mensagemDeErro(analise.error)}</p>}
      <div className="relative min-h-0 flex-1 lg:-mr-2 lg:overflow-y-auto lg:pr-2 print:overflow-visible">
        <div className={`grid gap-4 xl:grid-cols-2 ${analise.isFetching ? 'opacity-60' : ''}`}>
          {configs.map((c, i) => (
            <CartaoGrafico
              key={c.id}
              config={c}
              analise={dados}
              de={de}
              ate={ate}
              versao={versao}
              favorito={ehFavorito(c)}
              fixo={fixo}
              fora={!!impressao && !impressao.ids.includes(c.id)}
              comTabela={!!impressao?.tabelas}
              arrastando={arrastando === c.id}
              aoMudar={(n) => salvar((cs) => cs.map((x) => (x.id === c.id ? n : x)))}
              aoRemover={() => remover(c)}
              aoEditar={() => setJanela(c)}
              aoFavoritar={() => definirFavorito(c, !ehFavorito(c))}
              aoMover={(passo) => moverPara(c.id, i + passo)}
              aoArrastar={(ativo) => setArrastando(ativo ? c.id : null)}
              aoPassar={() => arrastando && arrastando !== c.id && moverPara(arrastando, i)}
            />
          ))}
        </div>
        {!configs.length && (
          <p className="cartao py-10 text-center text-suave">
            Nenhum gráfico. Use “Adicionar gráfico” ou “Restaurar padrão”.
          </p>
        )}
      </div>

      <Dialogo
        aberto={janela === 'novo' || !!editando}
        largo
        titulo={editando ? 'Editar gráfico personalizado' : 'Adicionar gráfico personalizado'}
        aoFechar={fechar}
      >
        <CorpoCodigo
          inicial={editando}
          favoritos={favoritos}
          favorito={ehFavorito}
          analise={dados}
          de={de}
          ate={ate}
          aoFechar={fechar}
          aoSalvar={(c, fav) => {
            salvar((cs) => (editando ? cs.map((x) => (x.id === c.id ? c : x)) : [...cs, c]))
            definirFavorito(c, fav)
            fechar()
          }}
          aoAdicionarFavorito={(c) => {
            salvar((cs) => [...cs, { ...c, id: novoId() }])
            fechar()
          }}
          aoDesfavoritar={(c) => definirFavorito(c, false)}
        />
      </Dialogo>

      <Dialogo aberto={janela === 'restaurar'} titulo="Restaurar o padrão?" aoFechar={fechar}>
        <CorpoRestaurar
          fixo={fixo}
          favoritos={favoritos}
          aoFechar={fechar}
          aoConfirmar={(noPadrao) => {
            if (fixo) {
              salvar(() => PADRAO)
              return fechar()
            }
            const fs = favoritos.map((f, i) => ({ ...f, noPadrao: noPadrao[i] }))
            salvarFavoritos(fs)
            // Nenhum marcado: voltam os gráficos padrão do sistema.
            const escolhidos = fs.filter((f) => f.noPadrao).map((f) => f.config)
            salvar(() =>
              (escolhidos.length ? escolhidos : PADRAO).map((c) => ({ ...c, id: novoId() })),
            )
            fechar()
          }}
        />
      </Dialogo>

      <Dialogo aberto={janela === 'exportar'} titulo="Exportar gráficos" aoFechar={fechar}>
        <CorpoExportar configs={configs} aoExportar={exportar} aoFechar={fechar} />
      </Dialogo>
    </div>
  )
}
