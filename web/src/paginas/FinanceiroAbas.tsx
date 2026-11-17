// Partes do Financeiro: lateral de filtros (calendário + profissionais) e a análise dos
// orçamentos aprovados.
import { useState, type CSSProperties, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, consultaProfissionais, isoLocal, somarDias } from '../api'
import { reais } from '../../../shared/financeiro'
import {
  CalendarioIntervalo,
  CartaoPeriodo,
  dataCurta,
  meio,
} from '../componentes/CalendarioIntervalo'
import { Icone } from '../componentes/Icones'
import { normalizar } from '../../../shared/regras'
import { COR_PADRAO } from './Profissionais'

// ── Análise: orçamentos aprovados (o faturamento) e os pagamentos ───────────
export interface OrcamentoAnalise {
  id: number
  aprovadoEm: string
  paciente: { id: number; nome: string }
  profissional: { id: number; nome: string }
  descontoCentavos: number
  totalCentavos: number
  recebidoCentavos: number
  itens: {
    nome: string
    valorCentavos: number
    especialidade: string | null
  }[]
}
export interface EntradaAnalise {
  id: number
  data: string
  valorCentavos: number
  forma: string | null
  profissional: { id: number; nome: string }
}
export interface Analise {
  orcamentos: OrcamentoAnalise[]
  entradas: EntradaAnalise[]
}
export interface FiltroAnalise {
  de: string
  ate: string
  profissionalId: number | ''
}

export const consultaAnalise = (f: FiltroAnalise) => ({
  queryKey: ['analise', f],
  queryFn: async () =>
    (
      await api.get<Analise>('/financeiro/analise', {
        params: { de: f.de, ate: f.ate, profissionalId: f.profissionalId || undefined },
      })
    ).data,
})

/** Período anterior para comparar: o mês anterior se o filtro é um mês cheio; senão, o mesmo nº de dias antes. */
export function periodoAnterior(de: string, ate: string) {
  const fimMes = (iso: string) => {
    const [a, m] = iso.split('-').map(Number)
    return isoLocal(new Date(a, m, 0))
  }
  if (de.endsWith('-01-01') && ate === `${de.slice(0, 4)}-12-31`)
    return andarIntervalo({ de, ate }, -1)
  if (de.endsWith('-01') && ate === fimMes(de)) {
    const ini = isoLocal(new Date(Number(de.slice(0, 4)), Number(de.slice(5, 7)) - 2, 1))
    return { de: ini, ate: fimMes(ini) }
  }
  const dias = Math.round((Date.parse(ate) - Date.parse(de)) / 86_400_000) + 1
  return { de: somarDias(de, -dias), ate: somarDias(de, -1) }
}

/** Período escolhido no calendário (padrão: o mês atual; 'tudo' começa vendo todos; 'ano', o ano atual). */
export function useIntervalo(inicio: 'mes' | 'tudo' | 'ano' = 'mes') {
  const hoje = isoLocal(new Date())
  const [intervalo, setIntervalo] = useState(() =>
    inicio === 'ano'
      ? { de: `${hoje.slice(0, 4)}-01-01`, ate: `${hoje.slice(0, 4)}-12-31` }
      : mesDe(hoje),
  )
  const [pendente, setPendente] = useState<string | null>(null)
  const [tudo, setTudo] = useState(inicio === 'tudo')
  const clicarDia = (d: string) => {
    setTudo(false)
    if (!pendente) return setPendente(d)
    setIntervalo(d < pendente ? { de: d, ate: pendente } : { de: pendente, ate: d })
    setPendente(null)
  }
  const verTudo = () => {
    setPendente(null)
    setTudo(!tudo)
  }
  const verAno = () => {
    const ano = new Date(Date.now()).getFullYear()
    setPendente(null)
    setTudo(false)
    setIntervalo({ de: `${ano}-01-01`, ate: `${ano}-12-31` })
  }
  const passo = (n: -1 | 1) => setIntervalo(andarIntervalo(intervalo, n))
  const resumo = tudo
    ? 'Todo o período'
    : pendente
      ? `De ${dataCurta(pendente)} até…`
      : `${dataCurta(intervalo.de)} – ${dataCurta(intervalo.ate)}`
  const cartao = (
    <CartaoPeriodo
      resumo={resumo}
      de={intervalo.de}
      ate={intervalo.ate}
      pendente={pendente}
      tudo={tudo}
      hoje={hoje}
      aoClicar={clicarDia}
      aoVerTudo={verTudo}
    />
  )
  /** "Ver todo o período": a API pede um intervalo, então vai um bem largo. */
  const consulta = tudo ? TUDO : intervalo
  return {
    intervalo,
    tudo,
    hoje,
    pendente,
    consulta,
    cartao,
    resumo,
    clicarDia,
    verTudo,
    verAno,
    passo,
  }
}
const TUDO = { de: '2000-01-01', ate: '2100-12-31' }

/** Último dia do mês da data (o Date já sabe 28/29/30/31, inclusive ano bissexto). */
const fimDoMes = (iso: string) =>
  isoLocal(new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), 0))

/**
 * ◀ ▶ do período. Mês cheio (dia 1 até o último dia) anda de mês em mês: sempre do dia 1
 * ao último dia do mês novo. Outro intervalo anda pelo seu próprio nº de dias.
 */
export function andarIntervalo(i: { de: string; ate: string }, n: number) {
  // Ano cheio anda de ano em ano (contar dias erraria nos bissextos).
  if (i.de.endsWith('-01-01') && i.ate === `${i.de.slice(0, 4)}-12-31`) {
    const a = Number(i.de.slice(0, 4)) + n
    return { de: `${a}-01-01`, ate: `${a}-12-31` }
  }
  if (i.de.endsWith('-01') && i.ate === fimDoMes(i.de)) {
    const de = isoLocal(new Date(Number(i.de.slice(0, 4)), Number(i.de.slice(5, 7)) - 1 + n, 1))
    return { de, ate: fimDoMes(de) }
  }
  const dias = Math.round((Date.parse(i.ate) - Date.parse(i.de)) / 86_400_000) + 1
  return { de: somarDias(i.de, n * dias), ate: somarDias(i.ate, n * dias) }
}
export const mesDe = (iso: string) => {
  const d = meio(iso)
  return {
    de: isoLocal(new Date(d.getFullYear(), d.getMonth(), 1)),
    ate: isoLocal(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
  }
}

/** Lista de profissionais com caixa de marcar (vários de uma vez) e a barra do valor de cada um. */
export function CartaoProfissionais(props: {
  ocultos: number[]
  aoMudar: (ocultos: number[]) => void
  valores: Map<number, number>
  legenda: string
}) {
  const profs = useQuery(consultaProfissionais)
  const maior = Math.max(1, ...props.valores.values())
  return (
    <section className="cartao space-y-2.5" aria-labelledby="titulo-profs">
      <div className="flex items-center justify-between gap-2">
        <h2 id="titulo-profs" className="text-base">
          Profissionais
        </h2>
        <button
          type="button"
          className="botao-leve botao-pequeno"
          onClick={() => props.aoMudar([])}
        >
          Todos
        </button>
      </div>
      {profs.data?.profissionais.map((p) => {
        const valor = props.valores.get(p.id) ?? 0
        const cor = p.corAgenda ?? COR_PADRAO
        return (
          <label key={p.id} className="block cursor-pointer space-y-1.5">
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!props.ocultos.includes(p.id)}
                onChange={() =>
                  props.aoMudar(
                    props.ocultos.includes(p.id)
                      ? props.ocultos.filter((x) => x !== p.id)
                      : [...props.ocultos, p.id],
                  )
                }
                style={{ '--cor-check': cor } as CSSProperties}
              />
              <span className="flex-1 font-bold">{p.nome}</span>
              <span className="text-sm font-extrabold tabular-nums">{reais(valor)}</span>
            </span>
            <span
              aria-hidden="true"
              className="ml-7 block h-1.5 overflow-hidden rounded-full bg-superficie-2"
            >
              <span
                className="block h-full rounded-full"
                style={{ width: `${(valor / maior) * 100}%`, background: cor }}
              />
            </span>
          </label>
        )
      })}
      <p className="text-xs text-suave">{props.legenda}</p>
    </section>
  )
}

// ── Barra de filtros com janelas suspensas (modelo de Orçamentos abertos) ──
const ativo = (sim: boolean) => (sim ? 'border-primaria bg-primaria-clara text-titulo' : '')

/** Botão que abre uma janela embaixo dele; clicar fora fecha. */
export function Suspenso(props: {
  rotulo: ReactNode
  marcado?: boolean
  painel: string
  children: (fechar: () => void) => ReactNode
}) {
  const [aberto, setAberto] = useState(false)
  const fechar = () => setAberto(false)
  return (
    // basis-40: no celular cada filtro tem largura mínima e desce de linha em vez de espremer o rótulo.
    <div className="relative min-w-0 grow basis-40 sm:flex-none sm:basis-auto">
      {aberto && <div className="fixed inset-0 z-30" onClick={fechar} />}
      <button
        type="button"
        className={`botao-leve flex w-full items-center justify-center gap-2 px-3 py-1.5 whitespace-nowrap sm:w-auto sm:px-4 ${ativo(aberto || !!props.marcado)}`}
        aria-expanded={aberto}
        onClick={() => setAberto(!aberto)}
      >
        {props.rotulo}
      </button>
      {aberto && (
        <div
          className={`cartao absolute top-full left-0 z-40 mt-1 max-w-[calc(100vw-2rem)] shadow-lg ${props.painel}`}
        >
          {props.children(fechar)}
        </div>
      )}
    </div>
  )
}

/** ◀ período ▶ com o calendário de intervalo numa janela. */
export function PeriodoSuspenso({
  p,
  comAno,
}: {
  p: ReturnType<typeof useIntervalo>
  /** Mostra o botão "Nesse ano" embaixo de "Ver todo o período". */
  comAno?: boolean
}) {
  return (
    <div className="flex w-full items-center gap-1 sm:w-auto">
      <button
        type="button"
        className="botao-leve px-2.5 py-1.5"
        disabled={p.tudo}
        onClick={() => p.passo(-1)}
        aria-label="Período anterior"
      >
        <Icone nome="esquerda" className="h-4 w-4" />
      </button>
      <Suspenso
        marcado={!p.tudo}
        painel="w-72 p-3"
        rotulo={
          <>
            <Icone nome="agenda" className="h-4 w-4" />
            {p.resumo}
          </>
        }
      >
        {(fechar) => (
          <CalendarioIntervalo
            de={p.intervalo.de}
            ate={p.intervalo.ate}
            pendente={p.pendente}
            tudo={p.tudo}
            hoje={p.hoje}
            aoClicar={(d) => {
              p.clicarDia(d)
              if (p.pendente) fechar() // o segundo clique fecha o intervalo
            }}
            aoVerTudo={() => {
              p.verTudo()
              fechar()
            }}
            aoVerAno={
              comAno
                ? () => {
                    p.verAno()
                    fechar()
                  }
                : undefined
            }
          />
        )}
      </Suspenso>
      <button
        type="button"
        className="botao-leve px-2.5 py-1.5"
        disabled={p.tudo}
        onClick={() => p.passo(1)}
        aria-label="Próximo período"
      >
        <Icone nome="direita" className="h-4 w-4" />
      </button>
    </div>
  )
}

/**
 * Profissionais marcáveis (vários de uma vez), com busca e um valor ao lado de cada um.
 * `lista` e `titulo` trocam quem aparece (ex.: Aprovações lista todos os usuários).
 */
export function ProfissionaisSuspenso(props: {
  ocultos: number[]
  aoMudar: (ocultos: number[]) => void
  valor: (id: number) => ReactNode
  lista?: { id: number; nome: string; corAgenda?: string | null }[]
  titulo?: string
}) {
  const profs = useQuery(consultaProfissionais)
  const [busca, setBusca] = useState('')
  const lista = props.lista ?? profs.data?.profissionais ?? []
  const titulo = props.titulo ?? 'Profissionais'
  const vistos = lista.filter((p) => !props.ocultos.includes(p.id)).length
  const achados = lista.filter((p) => normalizar(p.nome).includes(normalizar(busca.trim())))
  const { ocultos, aoMudar } = props
  return (
    <Suspenso
      marcado={vistos < lista.length}
      painel="w-72 space-y-2"
      rotulo={
        <>
          <span className="hidden -space-x-1 sm:flex" aria-hidden>
            {lista.slice(0, 5).map((p) => (
              <span
                key={p.id}
                className="h-3 w-3 rounded-full ring-2 ring-superficie"
                style={{
                  backgroundColor: ocultos.includes(p.id)
                    ? 'var(--borda)'
                    : (p.corAgenda ?? COR_PADRAO),
                }}
              />
            ))}
          </span>
          {titulo}
          <span className="hidden text-suave sm:inline">
            {vistos < lista.length ? `${vistos} de ${lista.length}` : 'todos'}
          </span>
          ▾
        </>
      }
    >
      {(fechar) => (
        <>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base">{titulo}</h2>
            <button
              type="button"
              className="botao-leve botao-pequeno"
              onClick={() => {
                aoMudar([])
                setBusca('')
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
              placeholder="Buscar nome"
              aria-label="Buscar nome"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && fechar()}
            />
          </div>
          <div className="max-h-64 space-y-1.5 overflow-y-auto">
            {achados.map((p) => (
              <label key={p.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!ocultos.includes(p.id)}
                  onChange={() =>
                    aoMudar(
                      ocultos.includes(p.id)
                        ? ocultos.filter((x) => x !== p.id)
                        : [...ocultos, p.id],
                    )
                  }
                  style={{ '--cor-check': p.corAgenda ?? COR_PADRAO } as CSSProperties}
                />
                <span className="flex-1">{p.nome}</span>
                <span className="text-sm text-suave tabular-nums">{props.valor(p.id)}</span>
              </label>
            ))}
            {!achados.length && <p className="text-suave">Ninguém encontrado.</p>}
          </div>
        </>
      )}
    </Suspenso>
  )
}

/** Faturamento (orçamentos aprovados) de cada profissional, para a barra do CartaoProfissionais. */
export function faturamentoPorProfissional(a: Analise | undefined) {
  const m = new Map<number, number>()
  for (const o of a?.orcamentos ?? [])
    m.set(o.profissional.id, (m.get(o.profissional.id) ?? 0) + o.totalCentavos)
  return m
}
