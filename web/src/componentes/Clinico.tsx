// Odontograma, Plano e Ficha Clínica e Fichas de Especialidade (R-019, R-061, R-068, R-069, R-078).
import { useId, useLayoutEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import {
  api,
  consultaEu,
  consultaProfissionais,
  dataBR,
  errosDosCampos,
  isoLocal,
  mensagemDeErro,
  type Paciente,
} from '../api'
import { avisar } from '../estado'
import { pode } from '../../../shared/permissoes'
import { reais } from '../../../shared/financeiro'
import { DENTES_DECIDUOS, DENTES_PERMANENTES } from '../../../shared/orcamentos'
import {
  DENTES_VALIDOS,
  ESPECIALIDADES_FICHA,
  LIMITE_OBSERVACAO,
  NOME_FACE,
  STATUS_CLINICO,
  STATUS_DENTE_FICHA,
  agruparProcedimentos,
  denteComFaces,
  facesDoDente,
} from '../../../shared/prontuario'
import { Dialogo } from './Dialogo'
import { Icone } from './Icones'
import {
  ALTURAS,
  VistaDente,
  arcada,
  coroa,
  ladoEsquerdo,
  larguraDente,
  posicao,
  regioes,
  type TipoDenticao,
} from './Dentes'
import { CampoData } from './CampoData'
import { CampoReais } from './CampoReais'
import { CampoSelect } from './CampoSelect'
import { confirmar } from './Confirmar'
import { CampoSugestoes } from './CampoSugestoes'

const LISTA_DENTES = [...DENTES_VALIDOS].map(String)

type Status = 'A_REALIZAR' | 'EXECUTADO' | 'EXISTENTE'
interface ItemClinico {
  origem: 'CLINICO' | 'ORCAMENTO'
  id: number
  procedimentoId: number | null
  nome: string
  dente: string | null
  faces: string | null
  status: Status
  data: string
  profissional: { id: number; nome: string }
  observacao: string | null
  observacaoPaciente: string | null
  orcamentoId: number | null
  orcamentoStatus: string | null
  /** Valor do item no orçamento (só origem ORCAMENTO). */
  valorCentavos: number | null
}

// Cores do dente pintado: vermelho, verde e azul.
const STATUS: Record<Status, { rotulo: string; cor: string }> = {
  A_REALIZAR: { rotulo: 'A realizar', cor: '#dc2626' },
  EXECUTADO: { rotulo: 'Executado', cor: '#16a34a' },
  EXISTENTE: { rotulo: 'Existente', cor: '#2563eb' },
}
// Ao pintar o dente, "A realizar" vence "Executado", que vence "Existente".
const PRIORIDADE: Status[] = ['A_REALIZAR', 'EXECUTADO', 'EXISTENTE']
const vence = (a: Status | undefined, b: Status) =>
  a && PRIORIDADE.indexOf(a) < PRIORIDADE.indexOf(b) ? a : b
/** Extração: "a realizar" marca um X; executada ou existente, o dente some do desenho. */
const EXTRACAO = /exodontia|extra[çc][ãa]o|ausente/i

const chaveProcedimentos = (id: number) => ['procedimentos', id]

/** X vermelho; "caixa" limita ao pedaço da imagem (ex.: só a coroa). */
function MarcaX(p: { caixa?: React.CSSProperties }) {
  return (
    <svg
      className="pointer-events-none absolute"
      style={p.caixa ?? { inset: 0, width: '100%', height: '100%' }}
      viewBox="0 0 10 10"
      preserveAspectRatio="none"
    >
      <path
        d="M1.5 2l7 6M8.5 2l-7 6"
        stroke={STATUS.A_REALIZAR.cor}
        strokeWidth={3}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

interface EstadoDentes {
  semCoroa: string[]
  removidos: string[]
}

/** Dentes sem coroa e removidos: marcados pelos botões, não são procedimentos. */
function useEstadoDentes(pacienteId: number) {
  const estado = useQuery({
    queryKey: ['odontograma', pacienteId],
    queryFn: async () => (await api.get<EstadoDentes>(`/pacientes/${pacienteId}/odontograma`)).data,
  })
  return {
    semCoroa: new Set(estado.data?.semCoroa),
    removidos: new Set(estado.data?.removidos),
  }
}

function useProcedimentos(pacienteId: number) {
  return useQuery({
    queryKey: chaveProcedimentos(pacienteId),
    queryFn: async () =>
      (await api.get<ItemClinico[]>(`/pacientes/${pacienteId}/procedimentos`)).data,
  })
}

function Selo({ status }: { status: Status }) {
  const { rotulo, cor } = STATUS[status]
  // Texto na cor do tema (legível em claro e escuro); a cor da situação vai na bolinha e no fundo.
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold text-texto"
      style={{ background: `${cor}1f` }}
    >
      <span className="size-2 rounded-full" style={{ background: cor }} />
      {rotulo}
    </span>
  )
}

interface Denticao {
  tipo: TipoDenticao
  mista: string[]
  /** Última dentição mista aplicada: dá para voltar a ela pelo seletor. */
  anterior?: { tipo: TipoDenticao; mista: string[] }
}
const NOME_TIPO: Record<TipoDenticao, string> = { PERMANENTE: 'Permanente', DECIDUA: 'Decídua' }

/** Tipo de dentição e dentes da mista ficam neste navegador, por paciente. */
function useDenticao(pacienteId: number) {
  const chave = `odontograma-${pacienteId}`
  const [den, setDen] = useState<Denticao>(() => {
    try {
      return JSON.parse(localStorage.getItem(chave) ?? '') as Denticao
    } catch {
      return { tipo: 'PERMANENTE', mista: [] }
    }
  })
  const mudar = (n: Denticao) => {
    setDen(n)
    try {
      localStorage.setItem(chave, JSON.stringify(n))
    } catch {
      /* sem armazenamento: vale só enquanto a tela estiver aberta */
    }
  }
  return [den, mudar] as const
}

// ── Odontograma ─────────────────────────────────────────────────────────────
export function Odontograma({ paciente }: { paciente: Paciente }) {
  const { data: eu } = useSuspenseQuery(consultaEu)
  const lista = useProcedimentos(paciente.id)
  // Seleção no desenho: dente → faces marcadas ('' = dente inteiro, marcado pelo número).
  const [sel, setSel] = useState(new Map<string, string>())
  const marcarFace = (d: string, f: string) => {
    const n = new Map(sel)
    const fs = n.get(d) ?? ''
    const novo = fs.includes(f) ? fs.replace(f, '') : fs + f
    if (novo) n.set(d, novo)
    else n.delete(d)
    setSel(n)
  }
  const marcarDente = (d: string) => {
    const n = new Map(sel)
    if (sel.get(d) === '') n.delete(d)
    else n.set(d, '')
    setSel(n)
  }
  const [dialogo, setDialogo] = useState<{
    itens?: ItemClinico[]
    linhas?: { dente: string; faces: string }[]
  } | null>(null)
  const [den, setDen] = useDenticao(paciente.id)
  const [escolhendoMista, setEscolhendoMista] = useState(false)
  const [foco, setFoco] = useState<string | null>(null)
  const [telaCheia, setTelaCheia] = useState(false)
  const podeEditar = pode(eu.perfis, 'prontuario.editar')
  const qc = useQueryClient()
  const chaveEstado = ['odontograma', paciente.id]
  const { semCoroa, removidos } = useEstadoDentes(paciente.id)
  const salvarEstado = useMutation({
    mutationFn: async (n: EstadoDentes) =>
      (await api.put<EstadoDentes>(`/pacientes/${paciente.id}/odontograma`, n)).data,
    onSuccess: (n) => {
      qc.setQueryData(chaveEstado, n)
      setSel(new Map())
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  // Com todos os marcados já nesse estado, o botão desfaz; senão, marca.
  const marcados = [...sel.keys()]
  const alternarEstado = (lista: Set<string>) => {
    const tirar = marcados.every((d) => lista.has(d))
    const n = new Set(lista)
    for (const d of marcados) {
      if (tirar) n.delete(d)
      else n.add(d)
    }
    return [...n]
  }
  const todosSemCoroa = !!marcados.length && marcados.every((d) => semCoroa.has(d))
  const todosRemovidos = !!marcados.length && marcados.every((d) => removidos.has(d))

  const porFace = new Map<string, Status>()
  const porDente = new Map<string, Status>()
  const extracao = new Map<string, Set<Status>>()
  for (const i of lista.data ?? []) {
    if (!i.dente) continue
    if (EXTRACAO.test(i.nome))
      extracao.set(i.dente, (extracao.get(i.dente) ?? new Set()).add(i.status))
    else if (i.faces)
      for (const f of i.faces) porFace.set(i.dente + f, vence(porFace.get(i.dente + f), i.status))
    else porDente.set(i.dente, vence(porDente.get(i.dente), i.status))
  }
  const [filtro, setFiltro] = useState<Status | null>(null)
  // Com dentes marcados, a lista mostra o lançamento inteiro de que eles fazem parte.
  const doDente = agruparProcedimentos(lista.data ?? []).filter(
    (g) => !sel.size || g.some((i) => i.dente && sel.has(i.dente)),
  )
  const visiveis = doDente.filter((g) => !filtro || g[0].status === filtro)
  const [superior, inferior] = arcada(den.tipo, den.mista)

  // O desenho encolhe para caber na largura do cartão; abaixo de 60% aparece a rolagem.
  const caixa = useRef<HTMLDivElement>(null)
  const [largura, setLargura] = useState(0)
  useLayoutEffect(() => {
    const o = new ResizeObserver(([e]) => setLargura(e.contentRect.width))
    o.observe(caixa.current!)
    return () => o.disconnect()
  }, [])
  // Dentes de uma metade, da linha média para fora.
  const doMeio = (ds: string[], k: number) =>
    k ? ds.filter((d) => !ladoEsquerdo(d)) : ds.filter(ladoEsquerdo).reverse()
  // A coluna tem a mesma largura em cima e embaixo, para os números ficarem alinhados;
  // o dente a mais de um lado (dentição mista) só sobra para fora.
  const largCol = (k: number, i: number, z: number) =>
    Math.max(
      30,
      ...[superior, inferior].flatMap((ds) => {
        const d = doMeio(ds, k)[i]
        return d ? [larguraDente(d, z)] : []
      }),
    )

  // Rótulos (80) + margens (32) + as duas metades (coluna + 4 de espaço), que têm a mesma largura.
  // O número do dente não encolhe, por isso a conta é repetida.
  const ocupa = (z: number) =>
    112 +
    2 *
      Math.max(
        ...[0, 1].map((k) =>
          Array.from(
            { length: Math.max(doMeio(superior, k).length, doMeio(inferior, k).length) },
            (_, i) => largCol(k, i, z) + 4,
          ).reduce((a, b) => a + b, 0),
        ),
      )
  // Em tela grande, odontograma e lista cabem na altura da janela, sem rolar a página:
  // a página toma a altura que sobra e a lista rola por dentro.
  const pagina = useRef<HTMLDivElement>(null)
  const [altura, setAltura] = useState(0)
  const [janela, setJanela] = useState(innerHeight)
  // Janela larga: odontograma à esquerda e lista numa coluna à direita.
  const [lado, setLado] = useState(false)
  useLayoutEffect(() => {
    const el = pagina.current!
    const medir = () => {
      const livre = innerHeight - (el.getBoundingClientRect().top + scrollY) - 16 // respiro do <main>
      // Celular/tablet ou janela muito baixa: volta ao fluxo normal da página.
      setAltura(innerWidth >= 1024 && livre >= 560 ? livre : 0)
      setLado(innerWidth >= 1280)
      setJanela(innerHeight)
    }
    medir()
    // Avisos acima (ex.: alertas da anamnese) empurram a página: a coluna muda de tamanho.
    const o = new ResizeObserver(medir)
    o.observe(el.parentElement!)
    addEventListener('resize', medir)
    return () => {
      o.disconnect()
      removeEventListener('resize', medir)
    }
  }, [])

  // Começa grande e encolhe até caber na largura e na altura disponíveis.
  let z = telaCheia ? 1.5 : 1.3
  for (let i = 0; i < 6 && largura && ocupa(z) > largura; i++) z *= largura / ocupa(z)
  // Reserva da altura: barra e bordas do cartão (120 com a lista ao lado, cuja barra pode
  // quebrar em duas linhas; 90 com ela embaixo) + as duas fileiras de números (60); com a
  // lista embaixo, mais ~2 linhas dela (220) e o espaço entre cartões (16).
  // Pela altura o desenho pode ir até 50%; pela largura, até 60% (abaixo disso, rola de lado).
  const reserva = lado ? 180 : 386
  const zAltura = (altura - reserva) / (2 * ALTURAS.reduce((a, b) => a + b))
  // Tela cheia: tudo aparece de cara, sem rolagem. Reserva: barra com os botões, margens do
  // cartão e as duas fileiras de números.
  if (telaCheia) z = Math.min(z, (janela - 190) / (2 * ALTURAS.reduce((a, b) => a + b)))
  else z = Math.max(0.6, z)
  if (altura && !telaCheia) z = Math.min(z, Math.max(0.5, zAltura))

  const vista = (d: string, v: 0 | 1 | 2) => {
    const ext = extracao.get(d)
    const removido = removidos.has(d) || (!!ext && (ext.has('EXECUTADO') || ext.has('EXISTENTE')))
    const marcarX = !removido && !!ext?.has('A_REALIZAR')
    const xNaCoroa = !removido && !marcarX && semCoroa.has(d)
    const faces = facesDoDente(d)
    // Removido pelo botão: fica bem apagado; clicar marca o dente para "Repor dente".
    if (removidos.has(d))
      return (
        <button
          key={v}
          type="button"
          aria-label={`Dente ${d} removido`}
          aria-pressed={sel.has(d)}
          title={`${d} · removido (clique e use "Repor dente")`}
          onClick={() => marcarDente(d)}
          className={`block cursor-pointer ${sel.has(d) ? 'opacity-50' : 'opacity-15 hover:opacity-35'}`}
        >
          <VistaDente d={d} v={v} z={z} altura={ALTURAS[v] * z} />
        </button>
      )
    return (
      <div key={v} className="relative">
        <VistaDente
          d={d}
          v={v}
          z={z}
          altura={ALTURAS[v] * z}
          oculto={removido || ((marcarX || xNaCoroa) && v === 1)}
        >
          {/* Sem coroa: não há face para marcar; o dente inteiro vai pelo número. */}
          {!xNaCoroa &&
            regioes(d, v).map((r) => {
              const f = faces[r.k]
              const status = porFace.get(d + f)
              const emFoco = foco === d + f
              const marcada = !!sel.get(d)?.includes(f)
              return (
                <button
                  key={r.k}
                  type="button"
                  aria-label={`Dente ${d}, ${NOME_FACE[f]}`}
                  aria-pressed={marcada}
                  title={`${d} · ${NOME_FACE[f]}`}
                  onMouseEnter={() => setFoco(d + f)}
                  onMouseLeave={() => setFoco(null)}
                  onClick={() => marcarFace(d, f)}
                  className="absolute cursor-pointer"
                  style={{
                    ...posicao(d, r),
                    // Sem cantos: o contorno vem da máscara do dente.
                    background: marcada
                      ? 'color-mix(in srgb, var(--primaria) 55%, transparent)'
                      : status
                        ? `${STATUS[status].cor}d9`
                        : emFoco
                          ? 'color-mix(in srgb, var(--primaria) 18%, transparent)'
                          : undefined,
                    boxShadow: marcada || emFoco ? 'inset 0 0 0 2px var(--primaria)' : undefined,
                  }}
                />
              )
            })}
          {xNaCoroa && v !== 1 && <MarcaX caixa={posicao(d, coroa(d, v))} />}
        </VistaDente>
        {marcarX && v !== 1 && <MarcaX />}
      </div>
    )
  }

  const numero = (d: string) => {
    const status = porDente.get(d)
    const inteiro = sel.get(d) === ''
    return (
      <button
        type="button"
        aria-pressed={inteiro}
        title="Marcar o dente inteiro"
        onClick={() => marcarDente(d)}
        className={`relative my-1 min-w-[30px] rounded-md border px-1 py-0.5 text-xs font-semibold ${inteiro ? 'border-primaria bg-primaria text-sobre-primaria' : sel.has(d) ? 'border-primaria text-primaria' : 'border-borda bg-superficie hover:border-primaria'}`}
      >
        {d}
        {status && (
          <span
            className="absolute -top-1 -right-1 size-2.5 rounded-full border border-superficie"
            style={{ background: STATUS[status].cor }}
            title={`Procedimento no dente inteiro: ${STATUS[status].rotulo}`}
          />
        )}
      </button>
    )
  }

  const rotulos = (nomes: string[]) => (
    <div className="w-20 shrink-0 text-xs font-medium text-suave">
      {nomes.map((n, v) => (
        <div key={v} className="flex items-center" style={{ height: ALTURAS[v] * z }}>
          {n}
        </div>
      ))}
    </div>
  )

  const metades = (dentes: string[], numeroEmbaixo: boolean) =>
    [0, 1].map((k) => {
      const m = doMeio(dentes, k).map((d, i) => ({ d, i }))
      return (
        <div
          key={k}
          className={`flex flex-1 gap-1 px-2 ${k ? 'justify-start' : 'justify-end border-r border-dashed border-borda'}`}
        >
          {(k ? m : m.reverse()).map(({ d, i }) => (
            <div
              key={d}
              className="flex shrink-0 flex-col items-center"
              style={{ width: largCol(k, i, z) }}
            >
              {!numeroEmbaixo && numero(d)}
              {([0, 1, 2] as const).map((v) => vista(d, v))}
              {numeroEmbaixo && numero(d)}
            </div>
          ))}
        </div>
      )
    })

  return (
    <div
      ref={pagina}
      className={
        lado
          ? 'grid grid-cols-[minmax(0,1fr)_22rem] grid-rows-[minmax(0,1fr)] gap-4'
          : 'flex flex-col gap-4'
      }
      style={altura ? { height: altura } : undefined}
    >
      <section
        className={`cartao flex shrink-0 flex-col gap-3 ${telaCheia ? 'fixed inset-0 z-40 overflow-auto rounded-none' : ''}`}
      >
        {/* Uma barra só: título, dentição, legenda e ações, para sobrar altura aos dentes. */}
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 font-semibold">Odontograma</h2>
          <div className="w-44">
            <CampoSelect
              aria-label="Tipo de dentição"
              vazio={false}
              value={den.tipo}
              // Trocar o tipo desfaz a mista (ela fica guardada como anterior);
              // os procedimentos continuam salvos em cada dente.
              onChange={(e) =>
                e.target.value === 'ANTERIOR'
                  ? setDen({ ...den, ...den.anterior! })
                  : setDen({ ...den, tipo: e.target.value as TipoDenticao, mista: [] })
              }
              opcoes={[
                ['PERMANENTE', 'Permanente'],
                ['DECIDUA', 'Decídua'],
                ...(den.anterior ? [['ANTERIOR', 'Dentição mista anterior'] as const] : []),
              ]}
            />
          </div>
          <button
            type="button"
            className={`botao-leve flex items-center gap-1.5 py-1.5 ${den.mista.length ? 'border-primaria text-primaria' : ''}`}
            onClick={() => setEscolhendoMista(true)}
          >
            <Icone nome="dente" className="h-4 w-4" />
            Dentição mista{den.mista.length ? ` (${den.mista.length})` : ''}
          </button>
          {/* Legenda ocupa o meio; tela cheia e o botão principal ficam colados à direita. */}
          <div className="mx-auto flex flex-wrap gap-4 px-2 text-xs text-suave">
            {PRIORIDADE.map((s) => (
              <span key={s} className="flex items-center gap-1.5">
                <span className="size-3 rounded" style={{ background: STATUS[s].cor }} />
                {STATUS[s].rotulo}
              </span>
            ))}
          </div>
          <button
            type="button"
            className="botao-leve p-2"
            aria-label={telaCheia ? 'Sair da tela cheia' : 'Tela cheia'}
            title={telaCheia ? 'Sair da tela cheia' : 'Tela cheia'}
            onClick={() => setTelaCheia(!telaCheia)}
          >
            <Icone nome={telaCheia ? 'fechar' : 'telaCheia'} className="h-4 w-4" />
          </button>
          {podeEditar && (
            <div className="flex flex-col items-stretch gap-1">
              <button
                className="botao py-1.5"
                disabled={marcados.some((d) => removidos.has(d))}
                title={
                  marcados.some((d) => removidos.has(d))
                    ? 'Dente removido não recebe procedimento: reponha o dente antes'
                    : undefined
                }
                onClick={() =>
                  setDialogo({ linhas: [...sel].map(([dente, faces]) => ({ dente, faces })) })
                }
              >
                Adicionar procedimento
              </button>
              {/* Valem para os dentes marcados no desenho. */}
              <div className="flex gap-1">
                <button
                  type="button"
                  className="botao-leve flex-1 px-2 py-0.5 text-xs whitespace-nowrap"
                  disabled={!marcados.length || salvarEstado.isPending}
                  title={marcados.length ? undefined : 'Marque os dentes no desenho'}
                  onClick={() =>
                    salvarEstado.mutate({
                      semCoroa: alternarEstado(semCoroa),
                      removidos: [...removidos],
                    })
                  }
                >
                  {todosSemCoroa ? 'Repor coroa' : 'Remover coroa'}
                </button>
                <button
                  type="button"
                  className="botao-leve flex-1 px-2 py-0.5 text-xs whitespace-nowrap"
                  disabled={!marcados.length || salvarEstado.isPending}
                  title={marcados.length ? undefined : 'Marque os dentes no desenho'}
                  onClick={() =>
                    salvarEstado.mutate({
                      semCoroa: [...semCoroa],
                      removidos: alternarEstado(removidos),
                    })
                  }
                >
                  {todosRemovidos ? 'Repor dente' : 'Remover dente'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Com a lista ao lado, o desenho fica centralizado na altura do cartão. */}
        <div ref={caixa} className="my-auto overflow-x-auto pb-1">
          <div className="mx-auto w-max min-w-full">
            <div className="flex items-start">
              {rotulos(['Vestibular', 'Oclusal', 'Palatina'])}
              {metades(superior, true)}
            </div>
            <div className="ml-20 border-t border-dashed border-borda" />
            <div className="flex items-end">
              {rotulos(['Lingual', 'Oclusal', 'Vestibular'])}
              {metades(inferior, false)}
            </div>
          </div>
        </div>
      </section>

      <section className="cartao flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">Procedimentos</h2>
          {!!sel.size && (
            <button
              className="etiqueta etiqueta-primaria"
              title="Limpar a seleção e ver todos os dentes"
              onClick={() => setSel(new Map())}
            >
              {[...sel].map(([d, f]) => d + f).join(', ')}
              <Icone nome="fechar" className="h-3 w-3" />
            </button>
          )}
        </div>
        {/* Filtro por situação, com a contagem de cada uma (respeita o dente escolhido). */}
        {!!doDente.length && (
          <div role="group" aria-label="Filtrar por situação" className="flex flex-wrap gap-1.5">
            {([null, ...PRIORIDADE] as const).map((s) => {
              const ativo = filtro === s
              return (
                <button
                  key={s ?? 'todos'}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => setFiltro(s)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${ativo ? 'border-primaria bg-primaria-clara text-primaria' : 'border-borda text-suave hover:border-primaria/50 hover:text-texto'}`}
                >
                  {s && (
                    <span className="size-2 rounded-full" style={{ background: STATUS[s].cor }} />
                  )}
                  {s ? STATUS[s].rotulo : 'Todos'}
                  <span className="rounded-full bg-superficie-2 px-1.5 text-[11px]">
                    {s ? doDente.filter((g) => g[0].status === s).length : doDente.length}
                  </span>
                </button>
              )
            })}
          </div>
        )}
        {lista.isPending && <p className="text-suave">Carregando…</p>}
        {lista.data && !visiveis.length && (
          <div className="grid flex-1 place-items-center rounded-xl border-2 border-dashed border-borda p-6 text-center">
            <div className="space-y-1">
              <Icone nome="dente" className="mx-auto h-8 w-8 text-primaria" />
              <p className="font-bold">
                {doDente.length
                  ? 'Nenhum procedimento com essa situação'
                  : 'Nenhum procedimento ainda'}
              </p>
              {podeEditar && !doDente.length && (
                <p className="text-xs text-suave">
                  Marque as partes ou os números dos dentes e use “Adicionar procedimento”.
                </p>
              )}
            </div>
          </div>
        )}
        {!!visiveis.length && (
          // A lista rola dentro deste espaço.
          <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)]">
            <TabelaProcedimentos
              paciente={paciente}
              grupos={visiveis}
              aoEditar={(itens) => setDialogo({ itens })}
            />
          </div>
        )}
      </section>

      <Dialogo
        aberto={!!dialogo}
        aoFechar={() => setDialogo(null)}
        titulo={dialogo?.itens ? 'Editar procedimento' : 'Adicionar procedimento'}
        largo
      >
        {dialogo && (
          <EditarLancamento
            paciente={paciente}
            itens={dialogo.itens}
            linhas={dialogo.linhas}
            aoTerminar={(salvo) => {
              // Lançou o que estava marcado: a seleção acaba.
              if (salvo && !dialogo.itens) setSel(new Map())
              setDialogo(null)
            }}
          />
        )}
      </Dialogo>

      <Dialogo
        aberto={escolhendoMista}
        aoFechar={() => setEscolhendoMista(false)}
        titulo="Dentição mista"
        largo
      >
        {escolhendoMista && (
          <EscolherMista
            denticao={den}
            aoAplicar={(mista) => {
              setDen({
                ...den,
                mista,
                anterior: mista.length ? { tipo: den.tipo, mista } : den.anterior,
              })
              setEscolhendoMista(false)
            }}
            aoCancelar={() => setEscolhendoMista(false)}
          />
        )}
      </Dialogo>
    </div>
  )
}

/** Escolhe os dentes do outro tipo que entram no lugar (ou ao lado) dos da dentição atual. */
function EscolherMista(props: {
  denticao: Denticao
  aoAplicar: (mista: string[]) => void
  aoCancelar: () => void
}) {
  const [marcados, setMarcados] = useState(new Set(props.denticao.mista))
  const outros = props.denticao.tipo === 'PERMANENTE' ? DENTES_DECIDUOS : DENTES_PERMANENTES
  const alternar = (d: string) => {
    const n = new Set(marcados)
    if (!n.delete(d)) n.add(d)
    setMarcados(n)
  }
  const z = 0.55
  return (
    <div className="space-y-4 p-5">
      <p className="text-suave">
        Selecione os dentes {props.denticao.tipo === 'PERMANENTE' ? 'decíduos' : 'permanentes'} que
        devem aparecer no lugar dos atuais.
      </p>
      {/* Mista nova (não é edição da atual): ao aplicar, ela toma o lugar da anterior. */}
      {props.denticao.anterior && !props.denticao.mista.length && (
        <p className="alerta-aviso" role="alert">
          Ao aplicar, a dentição mista anterior ({NOME_TIPO[props.denticao.anterior.tipo]} com os
          dentes {props.denticao.anterior.mista.join(', ')}) será apagada e substituída por esta.
        </p>
      )}
      <div className="overflow-x-auto">
        {outros.map((linha, l) => {
          const dentes = linha.map(String)
          return (
            <div
              key={l}
              className={`flex w-max min-w-full ${l ? 'border-t border-dashed border-borda pt-2' : 'pb-2'}`}
            >
              {[dentes.filter(ladoEsquerdo), dentes.filter((d) => !ladoEsquerdo(d))].map((m, k) => (
                <div
                  key={k}
                  className={`flex flex-1 justify-center gap-1 px-2 ${k ? '' : 'border-r border-dashed border-borda'}`}
                >
                  {m.map((d) => {
                    const marcado = marcados.has(d)
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={marcado}
                        aria-label={`Dente ${d}`}
                        onClick={() => alternar(d)}
                        className={`flex items-center gap-1 rounded-lg p-1 ${l ? 'flex-col-reverse' : 'flex-col'} ${marcado ? 'bg-primaria-clara' : 'hover:bg-superficie-2'}`}
                      >
                        <VistaDente d={d} v={l ? 2 : 0} z={z} altura={ALTURAS[l ? 2 : 0] * z} />
                        <span
                          className={`rounded-md px-1.5 text-xs font-semibold ${marcado ? 'bg-primaria text-sobre-primaria' : 'bg-superficie-2 text-suave'}`}
                        >
                          {d}
                        </span>
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          )
        })}
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="botao-leve" onClick={props.aoCancelar}>
          Cancelar
        </button>
        <button type="button" className="botao" onClick={() => props.aoAplicar([...marcados])}>
          Aplicar
        </button>
      </div>
    </div>
  )
}

/**
 * Lista do odontograma e da ficha clínica: "16MO", procedimento, status e ações.
 * Cada linha é um lançamento: os vários dentes ou faces dele aparecem juntos e as ações valem para todos.
 */
function TabelaProcedimentos(props: {
  paciente: Paciente
  grupos: ItemClinico[][]
  aoEditar: (itens: ItemClinico[]) => void
  comObservacoes?: boolean
}) {
  const { data: eu } = useSuspenseQuery(consultaEu)
  const qc = useQueryClient()
  const atualizar = () => {
    qc.invalidateQueries({ queryKey: chaveProcedimentos(props.paciente.id) })
    qc.invalidateQueries({ queryKey: ['orcamentos', props.paciente.id] })
  }
  // ponytail: um pedido por dente, sem transação; uma rota de lote se falha parcial virar problema.
  const excluir = useMutation({
    mutationFn: async (g: ItemClinico[]) =>
      Promise.all(g.map((i) => api.delete(`/prontuario/procedimentos/${i.id}`))),
    onSuccess: () => {
      avisar('Procedimento excluído')
      atualizar()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const executar = useMutation({
    mutationFn: async (g: ItemClinico[]) =>
      Promise.all(g.map((i) => api.post(`/orcamentos/itens/${i.id}/executar`))),
    onSuccess: () => {
      avisar('Procedimento atualizado')
      atualizar()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  // Troca só a situação, reenviando o resto do procedimento como está (mesma rota do Editar).
  const mudarSituacao = useMutation({
    mutationFn: async ({ g, status }: { g: ItemClinico[]; status: Status }) =>
      Promise.all(
        g.map((i) =>
          api.put(`/prontuario/procedimentos/${i.id}`, {
            procedimentoId: i.procedimentoId,
            nome: i.nome,
            profissionalId: i.profissional.id,
            status,
            dente: i.dente ?? '',
            faces: i.faces ?? '',
            data: i.data,
            observacao: i.observacao,
            observacaoPaciente: i.observacaoPaciente,
          }),
        ),
      ),
    onSuccess: () => {
      avisar('Procedimento atualizado')
      atualizar()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const podeEditar = pode(eu.perfis, 'prontuario.editar')
  const podeExecutar = pode(eu.perfis, 'procedimento.executar')
  const podeOrcar = pode(eu.perfis, 'orcamento.editar')
  const detalhes = (g: ItemClinico[]) => {
    const i = g[0]
    const valor = g.reduce((s, x) => s + (x.valorCentavos ?? 0), 0)
    return (
      <>
        {i.orcamentoId && (
          <span
            className={`etiqueta mt-2 ${i.orcamentoStatus === 'ABERTO' ? 'etiqueta-aviso' : ''}`}
          >
            Orçamento nº {i.orcamentoId}
            {i.orcamentoStatus === 'ABERTO' && ' (em aberto)'}
            {i.valorCentavos != null && ` · ${reais(valor)}`}
          </span>
        )}
        {props.comObservacoes && i.observacao && (
          <p className="mt-2 rounded-lg bg-superficie-2 px-2.5 py-1.5 text-xs">
            <span className="font-bold text-suave">Interna: </span>
            {i.observacao}
          </p>
        )}
        {props.comObservacoes && i.observacaoPaciente && (
          <p className="mt-2 rounded-lg bg-superficie-2 px-2.5 py-1.5 text-xs">
            <span className="font-bold text-suave">Ao paciente: </span>
            {i.observacaoPaciente}
          </p>
        )}
      </>
    )
  }
  const acoes = (g: ItemClinico[]) => {
    const i = g[0]
    return (
      <>
        {i.origem === 'CLINICO' && podeEditar && (
          <MenuAcoes rotulo={`Ações de ${i.nome}`}>
            <OpcoesSituacao
              atual={i.status}
              opcoes={['A_REALIZAR', 'EXECUTADO', 'EXISTENTE']}
              ocupado={mudarSituacao.isPending}
              aoEscolher={(status) => mudarSituacao.mutate({ g, status })}
            />
            <hr className="my-1 border-borda" />
            <button role="menuitem" className={ITEM_MENU} onClick={() => props.aoEditar(g)}>
              Editar
            </button>
            <hr className="my-1 border-borda" />
            <button
              role="menuitem"
              className={`${ITEM_MENU} text-perigo`}
              disabled={excluir.isPending}
              onClick={async () =>
                (await confirmar(
                  `Excluir "${i.nome}"${g.length > 1 ? ` dos ${g.length} dentes` : ''} do prontuário? Ele sai da lista, mas fica no histórico.`,
                )) && excluir.mutate(g)
              }
            >
              Excluir
            </button>
          </MenuAcoes>
        )}
        {i.origem === 'ORCAMENTO' && (podeExecutar || podeOrcar) && (
          <MenuAcoes rotulo={`Ações de ${i.nome}`}>
            {podeExecutar && (
              <OpcoesSituacao
                atual={i.status}
                opcoes={['A_REALIZAR', 'EXECUTADO']}
                ocupado={executar.isPending}
                aoEscolher={() => executar.mutate(g)}
              />
            )}
            {podeExecutar && podeOrcar && <hr className="my-1 border-borda" />}
            {/* Aprovado já gerou venda e parcelas: só muda pelo orçamento. */}
            {podeOrcar &&
              (i.orcamentoStatus === 'ABERTO' ? (
                <button role="menuitem" className={ITEM_MENU} onClick={() => props.aoEditar(g)}>
                  Editar
                </button>
              ) : (
                <p className="px-3 py-1 text-xs text-suave">
                  Orçamento aprovado: para tirar dentes, desaprove ou cancele em Orçamentos.
                </p>
              ))}
          </MenuAcoes>
        )}
      </>
    )
  }

  // Um cartão por lançamento: os dentes em destaque à esquerda, na cor da situação.
  // Serve tanto na coluna estreita ao lado do odontograma quanto na largura toda.
  return (
    <ul className="-mx-1 space-y-2 overflow-auto px-1 pb-1">
      {props.grupos.map((g) => {
        const i = g[0]
        const cor = STATUS[i.status].cor
        const dentes = g
          .filter((x) => x.dente)
          .map((x) => denteComFaces(x.dente, x.faces))
          .sort()
        return (
          <li
            key={`${i.origem}-${i.id}`}
            className="flex items-start gap-3 rounded-xl border border-borda bg-superficie p-3 transition-shadow hover:border-primaria/40 hover:shadow-sm"
          >
            {/* Vários dentes: a caixa só conta; os dentes vão em fichas abaixo do nome. */}
            <div
              className="flex size-12 shrink-0 flex-col items-center justify-center rounded-xl border text-center leading-none font-extrabold text-titulo"
              style={{ background: `${cor}14`, borderColor: `${cor}59` }}
              title={dentes.join(', ') || 'Sem dente'}
            >
              {dentes.length > 1 ? (
                <>
                  <span className="text-lg">{dentes.length}</span>
                  <span className="mt-0.5 text-[10px] font-bold text-suave">dentes</span>
                </>
              ) : dentes.length ? (
                <span className="text-base">{dentes[0]}</span>
              ) : (
                <Icone nome="dente" className="h-5 w-5 text-suave" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="font-bold text-titulo">{i.nome}</p>
                <Selo status={i.status} />
              </div>
              {dentes.length > 1 && (
                <p className="mt-2 flex flex-wrap gap-1">
                  {dentes.map((d) => (
                    <span
                      key={d}
                      className="rounded-md bg-superficie-2 px-1.5 text-[11px] font-extrabold text-titulo"
                    >
                      {d}
                    </span>
                  ))}
                </p>
              )}
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-suave">
                <span className="inline-flex items-center gap-1">
                  <Icone nome="agenda" className="h-3.5 w-3.5" />
                  {dataBR(i.data)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Icone nome="profissionais" className="h-3.5 w-3.5" />
                  {i.profissional.nome}
                </span>
              </p>
              {detalhes(g)}
            </div>
            <div className="shrink-0">{acoes(g)}</div>
          </li>
        )
      })}
    </ul>
  )
}

const ITEM_MENU =
  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left font-semibold hover:bg-superficie-2 disabled:cursor-not-allowed disabled:opacity-50'

/** Situações no menu ⋯, cada uma na sua cor; a atual vem marcada. */
function OpcoesSituacao(props: {
  atual: Status
  opcoes: Status[]
  ocupado: boolean
  aoEscolher: (s: Status) => void
}) {
  return (
    <>
      <p className="px-3 pt-1 pb-0.5 text-xs font-bold text-suave uppercase">Situação</p>
      {props.opcoes.map((s) => {
        const atual = s === props.atual
        return (
          <button
            key={s}
            role="menuitemradio"
            aria-checked={atual}
            className={`${ITEM_MENU} ${atual ? 'bg-superficie-2' : ''}`}
            style={{ color: STATUS[s].cor }}
            disabled={atual || props.ocupado}
            onClick={() => props.aoEscolher(s)}
          >
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: STATUS[s].cor }}
            />
            <span className="flex-1">{STATUS[s].rotulo}</span>
            {atual && <span aria-hidden>✓</span>}
          </button>
        )
      })}
    </>
  )
}

/**
 * Botão ⋯ que abre as ações da linha. Usa o popover nativo: fecha com Esc, clique fora ou
 * ao escolher uma ação, e fica por cima de tudo (a tabela tem rolagem e cortaria um menu comum).
 */
function MenuAcoes(props: { rotulo: string; children: React.ReactNode }) {
  const id = useId()
  const botao = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button
        ref={botao}
        type="button"
        popoverTarget={id}
        aria-label={props.rotulo}
        title="Ações"
        className="botao-leve botao-icone inline-grid place-items-center text-primaria"
      >
        <Icone nome="reticencias" className="h-5 w-5 stroke-[3]" />
      </button>
      <div
        id={id}
        popover="auto"
        role="menu"
        className="inset-auto m-0 w-56 rounded-xl border border-borda bg-superficie p-1.5 text-left text-texto shadow-lg"
        onToggle={(e) => {
          if (e.newState !== 'open' || !botao.current) return
          const b = botao.current.getBoundingClientRect()
          const m = e.currentTarget
          // A posição vale para onde o botão está agora: rolou a página ou a lista, o menu fecha.
          addEventListener('scroll', () => m.matches(':popover-open') && m.hidePopover(), {
            capture: true,
            once: true,
          })
          const cabeAbaixo = b.bottom + 4 + m.offsetHeight <= innerHeight
          m.style.top = `${cabeAbaixo ? b.bottom + 4 : b.top - 4 - m.offsetHeight}px`
          m.style.left = `${Math.max(8, b.right - m.offsetWidth)}px`
        }}
        onClick={(e) => e.currentTarget.hidePopover()}
      >
        {props.children}
      </div>
    </>
  )
}

/** Faces do dente como fichas: com aoAlternar viram botões de marcar; sem, só mostram. */
function Faces(props: { dente: string; faces: string; aoAlternar?: (f: string) => void }) {
  return (
    <>
      {facesDoDente(props.dente).map((f) => {
        const marcada = props.faces.includes(f)
        const cor = marcada ? 'bg-primaria text-sobre-primaria' : 'bg-superficie-2 text-suave'
        const classe = `min-w-7 rounded-md px-1.5 py-0.5 text-center text-xs font-extrabold ${cor}`
        return props.aoAlternar ? (
          <button
            key={f}
            type="button"
            aria-pressed={marcada}
            title={NOME_FACE[f]}
            onClick={() => props.aoAlternar!(f)}
            className={`${classe} ${marcada ? '' : 'hover:text-texto'}`}
          >
            {f}
          </button>
        ) : (
          <span key={f} title={NOME_FACE[f]} className={classe}>
            {f}
          </span>
        )
      })}
      {!props.faces && <span className="ml-1 text-xs text-suave">Dente inteiro</span>}
    </>
  )
}

/** Uma linha de dente do formulário; id é o registro já salvo (ao editar). */
type Linha = { id?: number; dente: string; faces: string; sai?: boolean }

interface Procedimento {
  id: number
  nome: string
  valorCentavos: number
}

type PropsForm = Parameters<typeof FormProcedimento>[0]
/** Editar um lançamento: o do prontuário muda tudo; o do orçamento só tira dentes. */
function EditarLancamento(props: PropsForm) {
  return props.itens?.[0]?.origem === 'ORCAMENTO' ? (
    <TirarDoOrcamento paciente={props.paciente} itens={props.itens} aoTerminar={props.aoTerminar} />
  ) : (
    <FormProcedimento {...props} />
  )
}

/** Tira dentes de um procedimento de orçamento em aberto; o total do orçamento é recalculado. */
function TirarDoOrcamento(props: {
  paciente: Paciente
  itens: ItemClinico[]
  aoTerminar: (salvo?: boolean) => void
}) {
  const qc = useQueryClient()
  const [sai, setSai] = useState(new Set<number>())
  const alternar = (id: number) => {
    const n = new Set(sai)
    if (!n.delete(id)) n.add(id)
    setSai(n)
  }
  const i = props.itens[0]
  const tirar = useMutation({
    // Um por vez: o último a sair leva o orçamento junto (no servidor).
    mutationFn: async (sair: ItemClinico[]) => {
      for (const x of sair) await api.delete(`/orcamentos/itens/${x.id}`)
    },
    onSuccess: () => {
      avisar('Orçamento atualizado')
      qc.invalidateQueries({ queryKey: chaveProcedimentos(props.paciente.id) })
      qc.invalidateQueries({ queryKey: ['orcamentos', props.paciente.id] })
      props.aoTerminar(true)
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const aviso = 'Se o orçamento ficar sem procedimentos, ele é excluído.'
  const total = props.itens.reduce((s, x) => s + (sai.has(x.id) ? 0 : (x.valorCentavos ?? 0)), 0)
  return (
    <div className="space-y-3">
      {/* Mesmo visual do editar do prontuário; nome e profissional só mudam em Orçamentos. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="rotulo">Procedimento</span>
          <input className="campo" value={i.nome} readOnly />
        </label>
        <label>
          <span className="rotulo">Profissional</span>
          <input className="campo" value={i.profissional.nome} readOnly />
        </label>
      </div>
      <div>
        <p className="rotulo">
          Dentes e faces
          {!!sai.size && ` · ${props.itens.length - sai.size} de ${props.itens.length}`}
        </p>
        <ul className="mt-1 divide-y divide-borda rounded-xl border border-borda">
          {props.itens.map((x) => {
            const saindo = sai.has(x.id)
            if (saindo)
              return (
                <li key={x.id} className="flex items-center gap-3 bg-perigo/5 px-3 py-2">
                  <span className="w-24 font-extrabold text-suave line-through">
                    {denteComFaces(x.dente, x.faces) || 'Sem dente'}
                  </span>
                  <span className="flex-1 text-xs text-perigo">Sai do orçamento ao salvar</span>
                  <button
                    type="button"
                    className="text-xs font-bold text-primaria hover:underline"
                    onClick={() => alternar(x.id)}
                  >
                    Desfazer
                  </button>
                </li>
              )
            return (
              <li key={x.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <input
                  className="campo w-24"
                  aria-label={`Dente ${x.dente ?? ''}`}
                  value={x.dente ?? 'Sem dente'}
                  readOnly
                />
                <div className="flex flex-1 flex-wrap items-center gap-1">
                  {x.dente && <Faces dente={x.dente} faces={x.faces ?? ''} />}
                </div>
                {x.valorCentavos != null && (
                  <span className="text-xs text-suave">{reais(x.valorCentavos)}</span>
                )}
                <button
                  type="button"
                  className="botao-leve botao-icone inline-grid place-items-center text-perigo"
                  aria-label={`Tirar ${x.dente ? `o dente ${x.dente}` : 'o procedimento'}`}
                  title="Tirar"
                  onClick={() => alternar(x.id)}
                >
                  <Icone nome="fechar" className="h-4 w-4" />
                </button>
              </li>
            )
          })}
        </ul>
      </div>
      <p className="rounded-lg bg-primaria-clara p-3 text-suave">
        Orçamento nº {i.orcamentoId} (em aberto) · total deste procedimento{' '}
        <strong className="text-texto">{reais(total)}</strong>. Tirar um dente recalcula o
        orçamento; nome, valor e profissional se mudam em Orçamentos.
      </p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          className="botao-leve mr-auto text-perigo"
          disabled={tirar.isPending}
          onClick={async () =>
            (await confirmar(`Tirar "${i.nome}" do orçamento nº ${i.orcamentoId}? ${aviso}`)) &&
            tirar.mutate(props.itens)
          }
        >
          {props.itens.length > 1 ? `Excluir os ${props.itens.length} dentes` : 'Excluir'}
        </button>
        <button type="button" className="botao-leve" onClick={() => props.aoTerminar()}>
          Cancelar
        </button>
        <button
          type="button"
          className="botao"
          disabled={!sai.size || tirar.isPending}
          onClick={() => tirar.mutate(props.itens.filter((x) => sai.has(x.id)))}
        >
          Salvar
        </button>
      </div>
    </div>
  )
}

/** Diálogo "Adicionar procedimento": vai direto ao prontuário, sem cobrança (R-061). */
function FormProcedimento(props: {
  paciente: Paciente
  /** Lançamento sendo editado: um registro por dente. */
  itens?: ItemClinico[]
  /** Dentes e faces marcados no desenho, já preenchidos. */
  linhas?: { dente: string; faces: string }[]
  aoTerminar: (salvo?: boolean) => void
}) {
  const qc = useQueryClient()
  const { data: eu } = useSuspenseQuery(consultaEu)
  const { data: prof } = useQuery(consultaProfissionais)
  const i = props.itens?.[0]
  const [nome, setNome] = useState(i?.nome ?? '')
  const [profissionalId, setProfissionalId] = useState<number | ''>(
    i?.profissional.id ?? prof?.meuId ?? '',
  )
  const [status, setStatus] = useState(i?.status ?? 'EXECUTADO')
  // Um procedimento pode ir para vários dentes, cada um com suas faces. Ao editar, cada linha
  // guarda o registro dela; "sai" marca o que será excluído ao salvar (dá para desfazer).
  const [linhas, setLinhas] = useState<Linha[]>(
    props.itens?.map((x) => ({ id: x.id, dente: x.dente ?? '', faces: x.faces ?? '' })) ??
      (props.linhas?.length ? props.linhas : [{ dente: '', faces: '' }]),
  )
  const mudarLinha = (k: number, n: Partial<Linha>) =>
    setLinhas(linhas.map((l, j) => (j === k ? { ...l, ...n } : l)))
  const ativas = linhas.filter((l) => !l.sai)
  // Lançamento novo não vai em dente removido, nem nas faces de dente sem coroa.
  const { semCoroa, removidos } = useEstadoDentes(props.paciente.id)
  const bloqueado = (l: Linha) => !l.id && removidos.has(l.dente)
  const semFaces = (l: Linha) => !l.id && semCoroa.has(l.dente)
  const denteInvalido = ativas.some(
    (l) => (l.dente && !DENTES_VALIDOS.has(l.dente)) || bloqueado(l),
  )
  const [data, setData] = useState(i?.data ?? isoLocal(new Date()))
  const [observacao, setObservacao] = useState(i?.observacao ?? '')
  const [observacaoPaciente, setObservacaoPaciente] = useState(i?.observacaoPaciente ?? '')
  const tabela = useQuery({
    queryKey: ['procedimentos-tabela', nome],
    queryFn: async () =>
      (await api.get<Procedimento[]>('/procedimentos', { params: { busca: nome } })).data,
    enabled: !i,
  })
  const achado = tabela.data?.find((t) => t.nome === nome)
  // Só as faces que existem no dente (trocar o dente pode deixar sobra).
  const normal = (l: Linha) => ({
    dente: l.dente,
    faces:
      DENTES_VALIDOS.has(l.dente) && !semFaces(l)
        ? facesDoDente(l.dente)
            .filter((f) => l.faces.includes(f))
            .join('')
        : '',
  })
  const dentes = ativas.filter((l) => DENTES_VALIDOS.has(l.dente)).map(normal)
  // "A realizar" novo vira orçamento em aberto: precisa de preço, então só procedimento da tabela.
  const podeOrcar = pode(eu.perfis, 'orcamento.editar')
  const orcar = !i && status === 'A_REALIZAR'
  const [valorEditado, setValorEditado] = useState<{ nome: string; v: number } | null>(null)
  const valor = valorEditado?.nome === nome ? valorEditado.v : (achado?.valorCentavos ?? 0)
  const quantidade = Math.max(1, dentes.length)
  const salvar = useMutation({
    mutationFn: async () => {
      if (orcar)
        return (
          await api.post<{ id: number }>('/orcamentos', {
            pacienteId: props.paciente.id,
            profissionalId,
            itens: (dentes.length ? dentes : [{ dente: null, faces: null }]).map((d) => ({
              procedimentoId: achado!.id,
              ...d,
              valorCentavos: valor,
            })),
            observacoes: observacao,
          })
        ).data
      const corpo = {
        procedimentoId: achado?.id ?? (i && nome === i.nome ? i.procedimentoId : null),
        nome,
        profissionalId,
        status,
        data,
        observacao,
        observacaoPaciente,
      }
      const criar = async (ds: typeof dentes) =>
        (await api.post(`/pacientes/${props.paciente.id}/procedimentos`, { ...corpo, dentes: ds }))
          .data
      if (!props.itens) return criar(dentes)
      // Editar o lançamento: um registro por dente; os tirados saem (ficam no histórico)
      // e os dentes novos são criados. ponytail: pedidos em sequência, sem transação.
      for (const l of linhas)
        if (l.id)
          await (l.sai
            ? api.delete(`/prontuario/procedimentos/${l.id}`)
            : api.put(`/prontuario/procedimentos/${l.id}`, { ...corpo, ...normal(l) }))
      const novas = ativas.filter((l) => !l.id && DENTES_VALIDOS.has(l.dente)).map(normal)
      if (novas.length) await criar(novas)
      return {}
    },
    onSuccess: (r) => {
      avisar(
        orcar
          ? `Orçamento nº ${r.id} criado em Orçamentos`
          : i
            ? 'Procedimento atualizado'
            : 'Procedimento adicionado ao prontuário',
      )
      qc.invalidateQueries({ queryKey: chaveProcedimentos(props.paciente.id) })
      qc.invalidateQueries({ queryKey: ['orcamentos', props.paciente.id] })
      props.aoTerminar(true)
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  // Excluir o lançamento inteiro: todos os dentes saem da lista (ficam no histórico).
  const excluirTudo = useMutation({
    mutationFn: async () =>
      Promise.all(props.itens!.map((x) => api.delete(`/prontuario/procedimentos/${x.id}`))),
    onSuccess: () => {
      avisar('Procedimento excluído')
      qc.invalidateQueries({ queryKey: chaveProcedimentos(props.paciente.id) })
      props.aoTerminar(true)
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const erros = errosDosCampos(salvar.error)
  const erro = (c: string) => erros[c] && <p className="mt-1 text-perigo">{erros[c]}</p>

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        salvar.mutate()
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="rotulo">Procedimento *</span>
          <CampoSugestoes
            sugestoes={tabela.data?.map((t) => t.nome) ?? []}
            value={nome}
            onChange={setNome}
            placeholder="Busque na tabela ou escreva"
            autoFocus
            required
          />
          {erro('procedimentoId')}
        </label>
        <label>
          <span className="rotulo">Profissional *</span>
          <CampoSelect
            value={profissionalId}
            onChange={(e) => setProfissionalId(Number(e.target.value) || '')}
            opcoes={prof?.profissionais.map((p) => [p.id, p.nome] as const)}
          />
          {erro('profissionalId')}
        </label>
      </div>

      <fieldset className="flex flex-wrap gap-4">
        <legend className="rotulo">Situação</legend>
        {(Object.keys(STATUS_CLINICO) as Status[])
          // Sem permissão de orçar, "A realizar" só aparece para editar um que já existe.
          .filter((s) => s !== 'A_REALIZAR' || podeOrcar || i?.status === s)
          .map((s) => (
            <label key={s} className="flex items-center gap-2">
              <input type="radio" checked={status === s} onChange={() => setStatus(s)} />
              {STATUS[s].rotulo}
            </label>
          ))}
      </fieldset>

      <fieldset>
        <div className="flex items-baseline justify-between gap-2">
          <legend className="rotulo">
            Dentes e faces (opcional)
            {ativas.length < linhas.length && ` · ${ativas.length} de ${linhas.length}`}
          </legend>
          <button
            type="button"
            className="text-xs font-bold text-primaria hover:underline"
            onClick={() => setLinhas([...linhas, { dente: '', faces: '' }])}
          >
            + Adicionar dente
          </button>
        </div>
        <div className="mt-1 divide-y divide-borda rounded-xl border border-borda">
          {linhas.map((l, k) => {
            const valido = DENTES_VALIDOS.has(l.dente)
            if (l.sai)
              return (
                <div key={k} className="flex items-center gap-3 bg-perigo/5 px-3 py-2">
                  <span className="w-24 font-extrabold text-suave line-through">
                    {denteComFaces(l.dente, normal(l).faces)}
                  </span>
                  <span className="flex-1 text-xs text-perigo">
                    Sai ao salvar (fica no histórico)
                  </span>
                  <button
                    type="button"
                    className="text-xs font-bold text-primaria hover:underline"
                    onClick={() => mudarLinha(k, { sai: false })}
                  >
                    Desfazer
                  </button>
                </div>
              )
            return (
              <div key={k} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <div className="w-24">
                  <CampoSugestoes
                    aria-label={`Dente ${k + 1}`}
                    sugestoes={LISTA_DENTES}
                    inputMode="numeric"
                    value={l.dente}
                    onChange={(v) => mudarLinha(k, { dente: v.trim() })}
                    placeholder="Ex.: 16"
                  />
                </div>
                <div className="flex flex-1 flex-wrap items-center gap-1">
                  {!valido && (
                    <span className={`text-xs ${l.dente ? 'text-perigo' : 'text-suave'}`}>
                      {l.dente ? 'Dente inválido' : 'Escolha o dente para marcar as faces'}
                    </span>
                  )}
                  {valido && bloqueado(l) && (
                    <span className="text-xs text-perigo">
                      Dente removido: reponha o dente no odontograma antes
                    </span>
                  )}
                  {valido && !bloqueado(l) && semFaces(l) && (
                    <span className="text-xs text-suave">Sem coroa: só o dente inteiro</span>
                  )}
                  {valido && !bloqueado(l) && !semFaces(l) && (
                    <Faces
                      dente={l.dente}
                      faces={l.faces}
                      aoAlternar={(f) =>
                        mudarLinha(k, {
                          faces: l.faces.includes(f) ? l.faces.replace(f, '') : l.faces + f,
                        })
                      }
                    />
                  )}
                </div>
                {linhas.length > 1 && (
                  <button
                    type="button"
                    className="botao-leve botao-icone inline-grid place-items-center text-perigo"
                    aria-label={`Tirar ${l.dente ? `o dente ${l.dente}` : `a linha ${k + 1}`}`}
                    title="Tirar"
                    // Dente já salvo fica riscado até salvar; linha nova só some.
                    onClick={() =>
                      l.id
                        ? mudarLinha(k, { sai: true })
                        : setLinhas(linhas.filter((_, j) => j !== k))
                    }
                  >
                    <Icone nome="fechar" className="h-4 w-4" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
        {erro('dente')}
      </fieldset>

      {orcar ? (
        <div className="space-y-2 rounded-lg bg-primaria-clara p-3">
          {!achado && (
            <p className="text-perigo">
              Escolha um procedimento da tabela para ver o preço e gerar o orçamento.
            </p>
          )}
          {achado && (
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="w-44">
                <CampoReais
                  id="valor-a-realizar"
                  rotulo="Valor por dente"
                  valor={valor}
                  aoMudar={(v) => setValorEditado({ nome, v })}
                />
              </div>
              <p className="text-lg">
                {quantidade > 1 && (
                  <span className="text-suave">
                    {quantidade} × {reais(valor)} ={' '}
                  </span>
                )}
                Total: <strong>{reais(valor * quantidade)}</strong>
              </p>
            </div>
          )}
          <p className="text-suave">
            Vai para Orçamentos como um orçamento em aberto, um item por dente. Aprove lá para gerar
            a cobrança.
          </p>
        </div>
      ) : (
        <label className="block sm:w-1/3">
          <span className="rotulo">Data</span>
          <CampoData value={data} onChange={setData} />
          {erro('data')}
        </label>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <CampoObservacao
          rotulo="Observação interna"
          ajuda="Não sai no documento do paciente."
          valor={observacao}
          aoMudar={setObservacao}
          erro={erros.observacao}
        />
        {!orcar && (
          <CampoObservacao
            rotulo="Observação para o paciente"
            ajuda="Sai no documento que o paciente assina."
            valor={observacaoPaciente}
            aoMudar={setObservacaoPaciente}
            erro={erros.observacaoPaciente}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {props.itens && (
          <button
            type="button"
            className="botao-leve mr-auto text-perigo"
            disabled={excluirTudo.isPending || salvar.isPending}
            onClick={async () =>
              (await confirmar(
                props.itens!.length > 1
                  ? `Excluir "${nome}" dos ${props.itens!.length} dentes? Sai da lista, mas fica no histórico.`
                  : `Excluir "${nome}" do prontuário? Sai da lista, mas fica no histórico.`,
              )) && excluirTudo.mutate()
            }
          >
            {props.itens.length > 1 ? `Excluir os ${props.itens.length} dentes` : 'Excluir'}
          </button>
        )}
        <button type="button" className="botao-leve" onClick={() => props.aoTerminar()}>
          Cancelar
        </button>
        <button
          className="botao"
          disabled={
            excluirTudo.isPending ||
            !nome.trim() ||
            !profissionalId ||
            denteInvalido ||
            (orcar && !achado) ||
            salvar.isPending
          }
        >
          Salvar
        </button>
      </div>
    </form>
  )
}

function CampoObservacao(props: {
  rotulo: string
  ajuda: string
  valor: string
  aoMudar: (v: string) => void
  erro?: string
}) {
  return (
    <label>
      <span className="rotulo">{props.rotulo}</span>
      <textarea
        className="campo"
        rows={3}
        maxLength={LIMITE_OBSERVACAO}
        value={props.valor}
        onChange={(e) => props.aoMudar(e.target.value)}
      />
      <span className="flex justify-between text-xs text-suave">
        <span>{props.ajuda}</span>
        <span>
          {props.valor.length}/{LIMITE_OBSERVACAO}
        </span>
      </span>
      {props.erro && <p className="mt-1 text-perigo">{props.erro}</p>}
    </label>
  )
}

// ── Plano e Ficha Clínica ───────────────────────────────────────────────────
interface Plano {
  id: number
  status: string
  aprovadoEm: string | null
  profissional: { nome: string }
  itens: { id: number; nome: string; dente: string | null; executadoEm: string | null }[]
}

export function PlanoFichaClinica({ paciente }: { paciente: Paciente }) {
  const { data: eu } = useSuspenseQuery(consultaEu)
  const procedimentos = useProcedimentos(paciente.id)
  const orcamentos = useQuery({
    queryKey: ['orcamentos', paciente.id],
    queryFn: async () =>
      (await api.get<Plano[]>('/orcamentos', { params: { pacienteId: paciente.id } })).data,
  })
  const [dialogo, setDialogo] = useState<{ itens?: ItemClinico[] } | null>(null)
  const planos = orcamentos.data?.filter((o) => o.status === 'APROVADO') ?? []
  const executados = procedimentos.data?.filter((i) => i.status === 'EXECUTADO') ?? []
  const aFazer = procedimentos.data?.filter((i) => i.status === 'A_REALIZAR') ?? []

  return (
    <div className="space-y-4">
      <section className="cartao space-y-3">
        <h2 className="font-semibold">Plano de tratamento</h2>
        {orcamentos.data && !planos.length && (
          <p className="text-suave">
            Nenhum plano ainda. O plano nasce quando um orçamento é aprovado.
          </p>
        )}
        {planos.map((o) => {
          const feitos = o.itens.filter((i) => i.executadoEm).length
          return (
            <div key={o.id} className="rounded-md border border-borda p-3">
              <p className="font-medium">
                Orçamento nº {o.id} · {o.profissional.nome}
                <span className="font-normal text-suave">
                  {' '}
                  · aprovado em {dataBR(o.aprovadoEm)} · {feitos} de {o.itens.length} feitos
                </span>
              </p>
              <div
                className="mt-2 h-1.5 rounded-full bg-borda"
                role="progressbar"
                aria-valuenow={feitos}
                aria-valuemax={o.itens.length}
                aria-label={`Andamento do orçamento nº ${o.id}`}
              >
                <div
                  className="h-full rounded-full bg-sucesso"
                  style={{ width: `${(feitos / o.itens.length) * 100}%` }}
                />
              </div>
            </div>
          )
        })}
        {!!aFazer.length && (
          <TabelaProcedimentos
            paciente={paciente}
            grupos={agruparProcedimentos(aFazer)}
            aoEditar={(itens) => setDialogo({ itens })}
          />
        )}
      </section>

      <section className="cartao space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Ficha clínica</h2>
          {pode(eu.perfis, 'prontuario.editar') && (
            <button className="botao py-1.5" onClick={() => setDialogo({})}>
              Adicionar procedimento
            </button>
          )}
        </div>
        {procedimentos.data && !executados.length && (
          <p className="text-suave">Nenhum procedimento executado ainda.</p>
        )}
        {!!executados.length && (
          <TabelaProcedimentos
            paciente={paciente}
            grupos={agruparProcedimentos(executados)}
            aoEditar={(itens) => setDialogo({ itens })}
            comObservacoes
          />
        )}
      </section>

      <Dialogo
        aberto={!!dialogo}
        aoFechar={() => setDialogo(null)}
        titulo={dialogo?.itens ? 'Editar procedimento' : 'Adicionar procedimento'}
        largo
      >
        {dialogo && (
          <EditarLancamento
            paciente={paciente}
            itens={dialogo.itens}
            aoTerminar={() => setDialogo(null)}
          />
        )}
      </Dialogo>
    </div>
  )
}

// ── Fichas de especialidade (R-068) ─────────────────────────────────────────
interface Ficha {
  id: number
  especialidade: string
  observacoes: string | null
  criadoEm: string
  profissional: { nome: string }
  itens: {
    id: number
    dente: string
    procedimento: string
    status: string
    observacao: string | null
  }[]
}

export function FichasEspecialidade({ paciente }: { paciente: Paciente }) {
  const { data: eu } = useSuspenseQuery(consultaEu)
  const [nova, setNova] = useState(false)
  const lista = useQuery({
    queryKey: ['fichas', paciente.id],
    queryFn: async () => (await api.get<Ficha[]>(`/pacientes/${paciente.id}/fichas`)).data,
  })
  const podeEditar = pode(eu.perfis, 'prontuario.editar')
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Fichas de especialidade</h2>
        {podeEditar && (
          <button className="botao py-1.5" onClick={() => setNova(true)}>
            Nova ficha
          </button>
        )}
      </div>
      {lista.data?.length === 0 && (
        <p className="cartao text-suave">
          Nenhuma ficha. Crie uma para acompanhar um tratamento de especialidade dente a dente.
        </p>
      )}
      {lista.data?.map((f) => (
        <FichaCartao key={f.id} ficha={f} paciente={paciente} podeEditar={podeEditar} />
      ))}
      <Dialogo aberto={nova} aoFechar={() => setNova(false)} titulo="Nova ficha de especialidade">
        <NovaFicha paciente={paciente} aoTerminar={() => setNova(false)} />
      </Dialogo>
    </div>
  )
}

function NovaFicha(props: { paciente: Paciente; aoTerminar: () => void }) {
  const qc = useQueryClient()
  const { data: prof } = useQuery(consultaProfissionais)
  const criar = useMutation({
    mutationFn: async (d: Record<string, unknown>) =>
      (await api.post(`/pacientes/${props.paciente.id}/fichas`, d)).data,
    onSuccess: () => {
      avisar('Ficha criada')
      qc.invalidateQueries({ queryKey: ['fichas', props.paciente.id] })
      props.aoTerminar()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        const f = Object.fromEntries(new FormData(e.currentTarget))
        criar.mutate({ ...f, profissionalId: Number(f.profissionalId) })
      }}
    >
      <label className="block">
        <span className="rotulo">Especialidade *</span>
        <CampoSelect name="especialidade" required defaultValue="" opcoes={ESPECIALIDADES_FICHA} />
      </label>
      <label className="block">
        <span className="rotulo">Profissional *</span>
        <CampoSelect
          name="profissionalId"
          required
          defaultValue={prof?.meuId ?? ''}
          opcoes={prof?.profissionais.map((p) => [p.id, p.nome] as const)}
        />
      </label>
      <label className="block">
        <span className="rotulo">Observações</span>
        <textarea name="observacoes" className="campo" rows={3} maxLength={LIMITE_OBSERVACAO} />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" className="botao-leve" onClick={props.aoTerminar}>
          Cancelar
        </button>
        <button className="botao" disabled={criar.isPending}>
          Criar ficha
        </button>
      </div>
    </form>
  )
}

function FichaCartao({
  ficha: f,
  paciente,
  podeEditar,
}: {
  ficha: Ficha
  paciente: Paciente
  podeEditar: boolean
}) {
  const qc = useQueryClient()
  const [dente, setDente] = useState('')
  const [procedimento, setProcedimento] = useState('')
  const atualizar = () => qc.invalidateQueries({ queryKey: ['fichas', paciente.id] })
  const aoErrar = (e: unknown) => avisar(mensagemDeErro(e), true)
  const adicionar = useMutation({
    mutationFn: async () =>
      (await api.post(`/prontuario/fichas/${f.id}/itens`, { dente, procedimento })).data,
    onSuccess: () => {
      setDente('')
      setProcedimento('')
      atualizar()
    },
    onError: aoErrar,
  })
  const mudarStatus = useMutation({
    mutationFn: async (d: { id: number; status: string }) =>
      (await api.patch(`/prontuario/fichas/itens/${d.id}`, { status: d.status })).data,
    onSuccess: atualizar,
    onError: aoErrar,
  })
  const remover = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/prontuario/fichas/itens/${id}`)).data,
    onSuccess: atualizar,
    onError: aoErrar,
  })
  return (
    <section className="cartao space-y-3">
      <div>
        <h3 className="font-semibold">{f.especialidade}</h3>
        <p className="text-suave">
          {f.profissional.nome} · criada em {dataBR(f.criadoEm)}
          {f.observacoes && ` · ${f.observacoes}`}
        </p>
      </div>
      {!f.itens.length && <p className="text-suave">Nenhum dente nesta ficha ainda.</p>}
      {!!f.itens.length && (
        <table className="w-full text-left">
          <thead className="border-b border-borda text-suave">
            <tr>
              {['Dente', 'Procedimento', 'Situação', ''].map((t) => (
                <th key={t} className="px-3 py-2 font-medium">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {f.itens.map((i) => (
              <tr key={i.id} className="border-b border-borda last:border-0">
                <td className="px-3 py-2 font-medium">{i.dente}</td>
                <td className="px-3 py-2">{i.procedimento}</td>
                <td className="px-3 py-2">
                  <CampoSelect
                    className="py-1"
                    value={i.status}
                    disabled={!podeEditar}
                    aria-label={`Situação do dente ${i.dente}`}
                    onChange={(e) => mudarStatus.mutate({ id: i.id, status: e.target.value })}
                    vazio={false}
                    opcoes={STATUS_DENTE_FICHA}
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  {podeEditar && (
                    <button
                      className="text-perigo hover:underline"
                      onClick={async () =>
                        (await confirmar(`Tirar o dente ${i.dente} desta ficha?`, {
                          botao: 'Remover',
                        })) && remover.mutate(i.id)
                      }
                    >
                      Remover
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {podeEditar && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            adicionar.mutate()
          }}
        >
          <label className="w-28">
            <span className="rotulo">Dente *</span>
            <CampoSugestoes
              sugestoes={LISTA_DENTES}
              inputMode="numeric"
              value={dente}
              onChange={(v) => setDente(v.trim())}
              required
            />
          </label>
          <label className="min-w-48 flex-1">
            <span className="rotulo">Procedimento *</span>
            <input
              className="campo"
              value={procedimento}
              onChange={(e) => setProcedimento(e.target.value)}
              required
            />
          </label>
          <button className="botao" disabled={adicionar.isPending}>
            Adicionar dente
          </button>
        </form>
      )}
    </section>
  )
}
