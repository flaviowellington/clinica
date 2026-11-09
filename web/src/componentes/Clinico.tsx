// Odontograma e a aba Plano e Ficha Clínica: aprovação de procedimentos e planejamentos
// (R-019, R-061, R-068, R-069, R-078).
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
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
  LIMITE_ETAPAS,
  LIMITE_OBSERVACAO,
  NOME_FACE,
  STATUS_CLINICO,
  STATUS_DENTE_FICHA,
  STATUS_FICHA,
  agruparProcedimentos,
  denteComFaces,
  facesDoDente,
  type TipoEtapa,
} from '../../../shared/prontuario'
import { Dialogo } from './Dialogo'
import { Icone, type NomeIcone } from './Icones'
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
import { Passo } from './NovoAgendamento'
import { Link } from '@tanstack/react-router'
import { whatsapp } from '../paginas/Pacientes'
import { CampoEspecialidade } from '../paginas/Profissionais'

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
  /** Pedido para o paciente assinar; com assinadoEm, está autorizado. */
  autorizacao: { id: number; assinadoEm: string | null; assinanteNome: string | null } | null
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
/**
 * Com pedido esperando assinatura, a ficha também consulta a cada 5 s e ao voltar para a aba.
 * O aviso em tempo real (server/src/tempoReal.ts) é o caminho rápido; isto cobre a conexão
 * que o navegador cortou (aba em segundo plano congelada, limite de conexões por endereço).
 */
const INTERVALO_ASSINATURA = 5000

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

/** "vivo": também recarrega sozinho (enquanto o paciente pode estar assinando). */
function useProcedimentos(pacienteId: number, vivo = false) {
  return useQuery({
    queryKey: chaveProcedimentos(pacienteId),
    queryFn: async () =>
      (await api.get<ItemClinico[]>(`/pacientes/${pacienteId}/procedimentos`)).data,
    refetchInterval: vivo && INTERVALO_ASSINATURA,
    refetchOnWindowFocus: vivo,
  })
}

function Selo({ status }: { status: Status }) {
  const { rotulo, cor } = STATUS[status]
  // Etiqueta padrão (legível em claro e escuro); a cor da situação vai só na bolinha.
  return (
    <span className="etiqueta gap-1.5 text-texto">
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
  /** Caixa de marcar em cada lançamento (para mandar ao paciente assinar). */
  selecao?: { marcado: (g: ItemClinico[]) => boolean; alternar: (g: ItemClinico[]) => void }
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
        {i.autorizacao && !i.autorizacao.assinadoEm && (
          <span className="etiqueta etiqueta-aviso mt-2 ml-1">Aguardando assinatura</span>
        )}
        {i.autorizacao?.assinadoEm && (
          <span className="etiqueta etiqueta-sucesso mt-2 ml-1">Assinado pelo paciente</span>
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
    <ul className="-mx-1 space-y-2 overflow-x-hidden overflow-y-auto px-1 pb-1">
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
            className="flex items-start gap-3 rounded-xl border border-borda bg-superficie p-3 hover:border-primaria/40 hover:shadow-sm"
          >
            {/* Já enviado ou assinado: sem caixa (espera a assinatura ou o cancelamento). */}
            {props.selecao && !i.autorizacao && (
              <input
                type="checkbox"
                className="mt-3.5"
                aria-label={`Escolher ${i.nome} para assinar`}
                checked={props.selecao.marcado(g)}
                onChange={() => props.selecao!.alternar(g)}
              />
            )}
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
            <div className="min-w-0 flex-1 break-words">
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

/** Situações no menu ⋯, cada uma com a bolinha da sua cor; a atual vem marcada. */
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
  const posicionar = useRef(() => {})
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
          const m = e.currentTarget
          if (e.newState !== 'open') {
            removeEventListener('scroll', posicionar.current, true)
            return
          }
          // Rolou a página ou a lista: o menu acompanha o botão. Fechar ao rolar fazia ele sumir
          // sozinho quando a lista se reorganizava (o navegador rola para manter o lugar).
          posicionar.current = () => {
            const b = botao.current?.getBoundingClientRect()
            if (!b) return
            const cabeAbaixo = b.bottom + 4 + m.offsetHeight <= innerHeight
            m.style.top = `${cabeAbaixo ? b.bottom + 4 : b.top - 4 - m.offsetHeight}px`
            m.style.left = `${Math.max(8, b.right - m.offsetWidth)}px`
          }
          posicionar.current()
          addEventListener('scroll', posicionar.current, { capture: true, passive: true })
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
type Linha = {
  id?: number
  dente: string
  faces: string
  sai?: boolean
  /** Enviado ao paciente: só mostra, não muda nem sai. */
  travada?: boolean
}

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
                    className="botao-fantasma botao-pequeno"
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
      <p className="alerta-info">
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
  /** Situação inicial de um lançamento novo (padrão: a realizar). */
  status?: Status
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
  const podeOrcar = pode(eu.perfis, 'orcamento.editar')
  // Novo começa em "A realizar"; sem permissão de orçar essa opção não aparece, então "Executado".
  const [status, setStatus] = useState<Status>(
    i?.status ?? props.status ?? (podeOrcar ? 'A_REALIZAR' : 'EXECUTADO'),
  )
  // Um procedimento pode ir para vários dentes, cada um com suas faces. Ao editar, cada linha
  // guarda o registro dela; "sai" marca o que será excluído ao salvar (dá para desfazer).
  const [linhas, setLinhas] = useState<Linha[]>(
    props.itens?.map((x) => ({ id: x.id, dente: x.dente ?? '', faces: x.faces ?? '' })) ??
      (props.linhas?.length ? props.linhas : [{ dente: '', faces: '' }]),
  )
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
              observacao,
              observacaoPaciente,
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
          ? `Adicionado ao plano (orçamento nº ${r.id} em aberto)`
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
  const erro = (c: string) => erros[c] && <p className="erro-campo">{erros[c]}</p>

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

      <LinhasDentes
        pacienteId={props.paciente.id}
        rotulo="Dentes e faces (opcional)"
        linhas={linhas}
        aoMudar={setLinhas}
      />
      {erro('dente')}

      {orcar ? (
        <div className="alerta-info space-y-2">
          {!achado && (
            <p className="font-bold text-perigo">
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
            Entra no plano de tratamento na hora, para o paciente autorizar. O orçamento fica em
            aberto: a cobrança se aprova em Orçamentos, depois do atendimento.
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
        <CampoObservacao
          rotulo="Observação para o paciente"
          ajuda="Sai no documento que o paciente assina."
          valor={observacaoPaciente}
          aoMudar={setObservacaoPaciente}
          erro={erros.observacaoPaciente}
        />
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

/**
 * "Dentes e faces" de um lançamento: um dente por linha, com as faces dele. Igual no
 * odontograma e nas fichas. Dente removido não recebe lançamento novo; sem coroa, só inteiro.
 */
function LinhasDentes(props: {
  pacienteId: number
  rotulo: string
  linhas: Linha[]
  aoMudar: (linhas: Linha[]) => void
  /** Atalhos abaixo do título (ex.: arcadas e quadrantes). */
  atalhos?: React.ReactNode
  /** Dentes da dentição escolhida: viram as sugestões; fora dela, só um aviso. */
  dentes?: string[]
}) {
  const { linhas } = props
  const daDenticao = props.dentes && new Set(props.dentes)
  const ativas = linhas.filter((l) => !l.sai)
  const { semCoroa, removidos } = useEstadoDentes(props.pacienteId)
  const bloqueado = (l: Linha) => !l.id && removidos.has(l.dente)
  const semFaces = (l: Linha) => !l.id && semCoroa.has(l.dente)
  const mudarLinha = (k: number, n: Partial<Linha>) =>
    props.aoMudar(linhas.map((l, j) => (j === k ? { ...l, ...n } : l)))
  const adicionar = () => props.aoMudar([...linhas, { dente: '', faces: '' }])
  return (
    <fieldset>
      <div className="flex items-baseline justify-between gap-2">
        <legend className="rotulo">
          {props.rotulo}
          {ativas.length < linhas.length && ` · ${ativas.length} de ${linhas.length}`}
        </legend>
        <button type="button" className="botao-fantasma botao-pequeno" onClick={adicionar}>
          + Adicionar dente
        </button>
      </div>
      {props.atalhos}
      <div className="mt-1 divide-y divide-borda rounded-xl border border-borda">
        {linhas.map((l, k) => {
          const valido = DENTES_VALIDOS.has(l.dente)
          if (l.travada)
            return (
              <div
                key={k}
                className="flex flex-wrap items-center gap-3 bg-superficie-2/50 px-3 py-2"
              >
                <span className="w-24 font-extrabold text-titulo">{l.dente}</span>
                <div className="flex flex-1 flex-wrap items-center gap-1">
                  <Faces dente={l.dente} faces={l.faces} />
                </div>
                <span className="inline-flex items-center gap-1 text-xs text-suave">
                  <Icone nome="cadeado" className="h-3.5 w-3.5" />
                  Enviado ao paciente
                </span>
              </div>
            )
          if (l.sai)
            return (
              <div key={k} className="flex items-center gap-3 bg-perigo/5 px-3 py-2">
                <span className="w-24 font-extrabold text-suave line-through">
                  {denteComFaces(l.dente, l.faces)}
                </span>
                <span className="flex-1 text-xs text-perigo">
                  Sai ao salvar (fica no histórico)
                </span>
                <button
                  type="button"
                  className="botao-fantasma botao-pequeno"
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
                  sugestoes={props.dentes ?? LISTA_DENTES}
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
                {valido && daDenticao && !daDenticao.has(l.dente) && !bloqueado(l) && (
                  <span className="text-xs text-aviso">Fora da dentição escolhida ·</span>
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
              {linhas.filter((x) => !x.travada).length > 1 && (
                <button
                  type="button"
                  className="botao-leve botao-icone inline-grid place-items-center text-perigo"
                  aria-label={`Tirar ${l.dente ? `o dente ${l.dente}` : `a linha ${k + 1}`}`}
                  title="Tirar"
                  // Dente já salvo fica riscado até salvar; linha nova só some.
                  onClick={() =>
                    l.id
                      ? mudarLinha(k, { sai: true })
                      : props.aoMudar(linhas.filter((_, j) => j !== k))
                  }
                >
                  <Icone nome="fechar" className="h-4 w-4" />
                </button>
              )}
            </div>
          )
        })}
      </div>
      {/* Também embaixo do último dente, para não voltar ao topo da lista. */}
      <button
        type="button"
        className="mt-1.5 w-full rounded-xl border-2 border-dashed border-borda py-1.5 text-sm font-bold text-suave transition hover:border-primaria/50 hover:text-primaria"
        onClick={adicionar}
      >
        + Adicionar dente
      </button>
    </fieldset>
  )
}

function CampoObservacao(props: {
  rotulo: string
  ajuda: string
  valor: string
  aoMudar: (v: string) => void
  erro?: string
  autoFocus?: boolean
}) {
  return (
    <label>
      <span className="rotulo">{props.rotulo}</span>
      <textarea
        className="campo"
        autoFocus={props.autoFocus}
        rows={3}
        maxLength={LIMITE_OBSERVACAO}
        value={props.valor}
        onChange={(e) => props.aoMudar(e.target.value)}
      />
      <span className="ajuda flex justify-between">
        <span>{props.ajuda}</span>
        <span>
          {props.valor.length}/{LIMITE_OBSERVACAO}
        </span>
      </span>
      {props.erro && <p className="erro-campo">{props.erro}</p>}
    </label>
  )
}

// ── Ficha Clínica (com o plano de tratamento e as assinaturas) ──────────────
/** Pedido para o paciente ler e assinar pelo celular (server/src/autorizacoes.ts). */
interface Pedido {
  id: number
  criadoEm: string
  assinadoEm: string | null
  assinanteNome: string | null
  link: string
  /** PDF do documento (assinado, depois que o paciente assina). */
  pdf: string
  /** Com ficha: pedido de um planejamento. */
  fichaId: number | null
  /** Texto pronto para mandar ao paciente, com o link. */
  mensagem: string
  /** O que o paciente lê (o que interessa aqui para reaproveitar ao enviar de novo). */
  conteudo: {
    plano?: string | null
    itens: { nome: string; observacaoPaciente: string | null }[]
    etapas?: { id: string; comentario: string | null }[]
  }
}

const chaveAutorizacoes = (id: number) => ['autorizacoes', id]
/** Pedidos de assinatura dos procedimentos avulsos (a barra lateral usa o mesmo cache). */
const consultaPedidos = (id: number) => ({
  queryKey: chaveAutorizacoes(id),
  queryFn: async () =>
    (await api.get<Pedido[]>('/autorizacoes', { params: { pacienteId: id } })).data,
  refetchInterval: (q: { state: { data?: Pedido[] } }) =>
    q.state.data?.some((a) => !a.assinadoEm) ? INTERVALO_ASSINATURA : false,
  refetchOnWindowFocus: true,
})
const chaveItem = (i: ItemClinico) => `${i.origem}-${i.id}`

export function PlanoFichaClinica({ paciente }: { paciente: Paciente }) {
  const { data: eu } = useSuspenseQuery(consultaEu)
  const qc = useQueryClient()
  const pedidos = useQuery(consultaPedidos(paciente.id))
  const esperando = !!pedidos.data?.some((a) => !a.assinadoEm)
  const procedimentos = useProcedimentos(paciente.id, esperando)
  // Assinatura nova percebida pela consulta: atualiza também os procedimentos (selos).
  // O aviso na tela sai pelo tempo real (main.tsx), para não aparecer duas vezes.
  const nAssinados = pedidos.data?.filter((a) => a.assinadoEm).length ?? 0
  useEffect(() => {
    if (nAssinados) qc.invalidateQueries({ queryKey: chaveProcedimentos(paciente.id) })
  }, [nAssinados, paciente.id, qc])
  const [dialogo, setDialogo] = useState<{ itens?: ItemClinico[]; status?: Status } | null>(null)
  const [marcados, setMarcados] = useState(new Set<string>())
  const [enviando, setEnviando] = useState(false)
  const [juntar, setJuntar] = useState(new Set<number>())
  // Assinar (paciente), executar (dentista) e pagar (Orçamentos) são independentes.
  // Na ficha fica o que ainda não foi enviado para assinar, a realizar ou já executado.
  const naoEnviados =
    procedimentos.data?.filter((i) => i.status !== 'EXISTENTE' && !i.autorizacao) ?? []
  const escolhidos = naoEnviados.filter((i) => marcados.has(chaveItem(i)))
  const podeEditar = pode(eu.perfis, 'prontuario.editar')
  const podePlanejar = podeEditar && pode(eu.perfis, 'orcamento.editar')
  const atualizar = () => {
    qc.invalidateQueries({ queryKey: chaveProcedimentos(paciente.id) })
    qc.invalidateQueries({ queryKey: chaveAutorizacoes(paciente.id) })
  }
  const juntarPedidos = useMutation({
    mutationFn: async () => (await api.post('/autorizacoes/juntar', { ids: [...juntar] })).data,
    onSuccess: () => {
      setJuntar(new Set())
      avisar('Pedidos juntados: agora é um link só')
      atualizar()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const selecao = podeEditar
    ? {
        marcado: (g: ItemClinico[]) => g.every((i) => marcados.has(chaveItem(i))),
        alternar: (g: ItemClinico[]) => {
          const n = new Set(marcados)
          const tinha = g.every((i) => n.has(chaveItem(i)))
          g.forEach((i) => (tinha ? n.delete(chaveItem(i)) : n.add(chaveItem(i))))
          setMarcados(n)
        },
      }
    : undefined
  const pendentes = pedidos.data?.filter((a) => !a.assinadoEm) ?? []
  const assinados = pedidos.data?.filter((a) => a.assinadoEm) ?? []
  const gruposEscolhidos = agruparProcedimentos(escolhidos)
  const doPedido = (a: Pedido) =>
    agruparProcedimentos(procedimentos.data?.filter((i) => i.autorizacao?.id === a.id) ?? [])
  const cartao = (a: Pedido) => (
    <CartaoPedido
      key={a.id}
      pedido={a}
      grupos={doPedido(a)}
      paciente={paciente}
      podeEditar={podeEditar}
      aoMudar={atualizar}
      aoEditar={(itens) => setDialogo({ itens })}
      marcar={
        podeEditar && !a.assinadoEm && pendentes.length > 1
          ? {
              marcado: juntar.has(a.id),
              alternar: () => {
                const n = new Set(juntar)
                if (!n.delete(a.id)) n.add(a.id)
                setJuntar(n)
              },
            }
          : undefined
      }
    />
  )
  const nJuntar = pendentes.filter((a) => juntar.has(a.id)).length

  return (
    <div className="space-y-4">
      <header className="cartao flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl">Aprovação de procedimentos</h2>
          <p className="subtitulo">
            Procedimentos avulsos: marque e envie para o paciente ler e assinar pelo celular. O
            tratamento completo fica em Planejamentos.
          </p>
        </div>
        {podeEditar && (
          <div className="flex flex-wrap gap-2">
            <button
              className="botao-leve"
              onClick={() => setDialogo({ status: podePlanejar ? 'A_REALIZAR' : 'EXECUTADO' })}
            >
              <Icone nome="mais" className="h-4 w-4" />
              Adicionar procedimento
            </button>
            <button
              className="botao"
              disabled={!escolhidos.length}
              onClick={() => setEnviando(true)}
            >
              Enviar para assinar
              {gruposEscolhidos.length ? ` (${gruposEscolhidos.length})` : ''}
            </button>
          </div>
        )}
      </header>

      {/* Enquanto espera, fica no alto, com o mesmo visual da assinatura do planejamento. */}
      {!!pendentes.length && (
        <section
          aria-labelledby="aguardando-avulsos"
          className="cartao space-y-3 border-l-4"
          style={{ borderLeftColor: APROVACAO.AGUARDANDO.cor }}
        >
          <div className="flex flex-wrap items-center gap-3">
            <span
              aria-hidden
              className="grid size-11 shrink-0 place-items-center rounded-xl"
              style={{
                background: misturar(APROVACAO.AGUARDANDO.cor, 14),
                color: APROVACAO.AGUARDANDO.cor,
              }}
            >
              <Icone nome="celular" className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h3
                id="aguardando-avulsos"
                className="flex flex-wrap items-center gap-2 font-semibold"
              >
                Assinatura do paciente{' '}
                <span className={APROVACAO.AGUARDANDO.classe}>
                  Aguardando assinatura ({pendentes.length})
                </span>
              </h3>
              <p className="text-xs text-suave">
                Cada pedido tem o seu link. Para mandar um link só, marque os pedidos e junte.
              </p>
            </div>
            {podeEditar && pendentes.length > 1 && (
              <button
                className="botao-leve botao-pequeno"
                disabled={nJuntar < 2 || juntarPedidos.isPending}
                onClick={async () =>
                  (await confirmar(
                    `Juntar os ${nJuntar} pedidos num só? Os links antigos deixam de valer; envie o novo.`,
                    { botao: 'Juntar', perigo: false },
                  )) && juntarPedidos.mutate()
                }
              >
                Juntar para enviar juntos{nJuntar ? ` (${nJuntar})` : ''}
              </button>
            )}
          </div>
          <div className="max-h-[60vh] divide-y divide-borda overflow-x-hidden overflow-y-auto rounded-xl border border-borda print:max-h-none print:overflow-visible">
            {pendentes.map(cartao)}
          </div>
        </section>
      )}

      <section className="cartao space-y-3">
        <h3 className="text-base">
          Ficha clínica{' '}
          {!!naoEnviados.length && (
            <span className="etiqueta ml-1">{agruparProcedimentos(naoEnviados).length}</span>
          )}
        </h3>
        {procedimentos.isPending && <p className="text-suave">Carregando…</p>}
        {procedimentos.data && !naoEnviados.length && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-primaria-clara text-primaria">
              <Icone nome="dente" className="h-6 w-6" />
            </span>
            <p className="font-bold text-titulo">Nenhum procedimento na ficha</p>
            <p className="text-suave">
              Os que foram enviados para assinar ficam nos pedidos abaixo.
            </p>
          </div>
        )}
        {!!naoEnviados.length && (
          <div className="max-h-[35vh] overflow-x-hidden overflow-y-auto print:max-h-none print:overflow-visible">
            <TabelaProcedimentos
              paciente={paciente}
              grupos={agruparProcedimentos(naoEnviados)}
              aoEditar={(itens) => setDialogo({ itens })}
              comObservacoes
              selecao={selecao}
            />
          </div>
        )}
      </section>

      <section className="cartao overflow-hidden p-0">
        <h3 className="border-b border-borda px-4 py-3 text-base">
          Autorizados pelo paciente{' '}
          {!!assinados.length && (
            <span className="etiqueta etiqueta-sucesso ml-1">{assinados.length}</span>
          )}
        </h3>
        {pedidos.data && !assinados.length && (
          <p className="px-4 py-3 text-suave">Nenhum plano assinado ainda.</p>
        )}
        <div className="max-h-[60vh] divide-y divide-borda overflow-x-hidden overflow-y-auto print:max-h-none print:overflow-visible">
          {assinados.map(cartao)}
        </div>
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
            status={dialogo.status}
            aoTerminar={() => setDialogo(null)}
          />
        )}
      </Dialogo>

      <Dialogo
        aberto={enviando}
        aoFechar={() => setEnviando(false)}
        titulo="Enviar para o paciente assinar"
        largo
      >
        {enviando && (
          <EnviarParaAssinar
            paciente={paciente}
            grupos={gruposEscolhidos}
            aoTerminar={(ok) => {
              setEnviando(false)
              if (ok) {
                setMarcados(new Set())
                atualizar()
              }
            }}
          />
        )}
      </Dialogo>
    </div>
  )
}

/** Antes de enviar: o profissional escreve o que o paciente vai ler no documento. */
function EnviarParaAssinar(props: {
  paciente: Paciente
  grupos: ItemClinico[][]
  aoTerminar: (ok?: boolean) => void
}) {
  const [plano, setPlano] = useState('')
  // Começa com a observação para o paciente já gravada; o que mudar aqui vale só no documento.
  const [textos, setTextos] = useState(props.grupos.map((g) => g[0].observacaoPaciente ?? ''))
  const criar = useMutation({
    mutationFn: async () =>
      (
        await api.post('/autorizacoes', {
          pacienteId: props.paciente.id,
          plano,
          itens: props.grupos.flatMap((g, k) =>
            g.map((i) => ({ origem: i.origem, id: i.id, texto: textos[k] })),
          ),
        })
      ).data,
    onSuccess: () => {
      avisar('Pronto: envie o link ao paciente em "Aguardando assinatura"')
      props.aoTerminar(true)
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        criar.mutate()
      }}
    >
      <CampoObservacao
        rotulo="Plano de tratamento (texto geral)"
        ajuda="Sai no documento, antes da lista de procedimentos. Opcional."
        valor={plano}
        aoMudar={setPlano}
      />
      <div className="space-y-3">
        {props.grupos.map((g, k) => {
          const dentes = g
            .filter((x) => x.dente)
            .map((x) => denteComFaces(x.dente, x.faces))
            .sort()
          return (
            <div key={chaveItem(g[0])} className="space-y-2 rounded-xl border border-borda p-3">
              <p className="font-bold text-titulo">
                {g[0].nome}
                <span className="font-normal text-suave">
                  {dentes.length ? ` · dentes ${dentes.join(', ')}` : ''} · {g[0].profissional.nome}
                </span>
              </p>
              <CampoObservacao
                rotulo="Sobre este procedimento, para o paciente"
                ajuda="Sai no documento que o paciente assina."
                valor={textos[k]}
                aoMudar={(v) => setTextos(textos.map((t, j) => (j === k ? v : t)))}
              />
            </div>
          )
        })}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="botao-leve" onClick={() => props.aoTerminar()}>
          Cancelar
        </button>
        <button className="botao" disabled={criar.isPending}>
          Criar pedido de assinatura
        </button>
      </div>
    </form>
  )
}

/** Um pedido: a linha com os botões e, se tiver mais de um, os procedimentos numa lista que abre. */
function CartaoPedido(props: {
  pedido: Pedido
  grupos: ItemClinico[][]
  paciente: Paciente
  podeEditar: boolean
  aoMudar: () => void
  aoEditar: (itens: ItemClinico[]) => void
  marcar?: { marcado: boolean; alternar: () => void }
}) {
  const tabela = (
    <TabelaProcedimentos
      paciente={props.paciente}
      grupos={props.grupos}
      aoEditar={props.aoEditar}
      comObservacoes
    />
  )
  // Uma linha da seção: o pedido em cima e os procedimentos dentro.
  return (
    <div className="px-4 py-3">
      <LinhaPedido {...props} />
      {/* Assinado: sempre fechado numa lista que abre, mesmo com um procedimento só. */}
      {props.grupos.length > 1 || (props.pedido.assinadoEm && props.grupos.length) ? (
        <details className="group mt-2">
          <summary className="inline-flex list-none items-center gap-1 rounded-lg py-1 pr-2 font-bold text-primaria select-none hover:bg-primaria-clara [&::-webkit-details-marker]:hidden">
            <Icone nome="direita" className="h-4 w-4 shrink-0 group-open:rotate-90" />
            {props.grupos.length > 1
              ? `Ver os ${props.grupos.length} procedimentos`
              : 'Ver o procedimento'}
          </summary>
          <div className="pt-2">{tabela}</div>
        </details>
      ) : (
        !!props.grupos.length && <div className="mt-2">{tabela}</div>
      )}
    </div>
  )
}

/**
 * Um pedido de assinatura. Esperando: abrir, copiar o link, mandar pelo módulo Mensagens,
 * WhatsApp rápido ou cancelar. Assinado: ver, abrir o PDF e mandar o PDF pelo Mensagens.
 */
function LinhaPedido(props: {
  pedido: Pedido
  paciente: Paciente
  podeEditar: boolean
  aoMudar: () => void
  marcar?: { marcado: boolean; alternar: () => void }
}) {
  const a = props.pedido
  const { celular } = props.paciente
  const cancelar = useMutation({
    mutationFn: async () => api.post(`/autorizacoes/${a.id}/cancelar`),
    onSuccess: () => {
      avisar('Pedido cancelado')
      props.aoMudar()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const n = a.conteudo.itens.length
  const cls = 'botao-leve botao-pequeno'
  // Mensagens já abre com o paciente, o tipo de envio e este pedido escolhidos.
  const mensagens = (
    <Link
      to="/mensagens"
      search={{
        paciente: props.paciente.id,
        envio: a.assinadoEm ? 'pdf' : a.fichaId ? 'planejamento' : 'procedimentos',
        pedido: a.id,
      }}
      className={cls}
    >
      <Icone nome="enviar" className="h-3.5 w-3.5" />
      {a.assinadoEm ? 'Enviar PDF assinado' : 'Enviar mensagem'}
    </Link>
  )
  return (
    <div className="flex flex-wrap items-center gap-2">
      {props.marcar && (
        <input
          type="checkbox"
          aria-label={`Juntar o pedido nº ${a.id}`}
          checked={props.marcar.marcado}
          onChange={props.marcar.alternar}
        />
      )}
      <p className="mr-auto">
        <strong className="text-titulo">Pedido nº {a.id}</strong>
        <span className="text-suave">
          {' '}
          · {n} procedimento{n > 1 ? 's' : ''} ·{' '}
          {a.assinadoEm
            ? `assinado por ${a.assinanteNome} em ${dataBR(a.assinadoEm)}`
            : `criado em ${dataBR(a.criadoEm)}`}
        </span>
      </p>
      <a className={cls} href={a.link} target="_blank" rel="noreferrer">
        {a.assinadoEm ? 'Ver documento' : 'Abrir'}
      </a>
      {a.assinadoEm ? (
        <>
          <a className={cls} href={`${a.pdf}?ver`} target="_blank" rel="noreferrer">
            <Icone nome="arquivo" className="h-3.5 w-3.5" />
            Abrir PDF
          </a>
          {mensagens}
        </>
      ) : (
        <>
          <button
            type="button"
            className={cls}
            onClick={() =>
              navigator.clipboard.writeText(a.link).then(
                () => avisar('Link copiado'),
                () => avisar('Não foi possível copiar o link', true),
              )
            }
          >
            Copiar link
          </button>
          {mensagens}
          {/* Envio rápido: o WhatsApp abre com a mensagem e o link prontos. */}
          <a
            className={`${cls} ${celular ? '' : 'pointer-events-none opacity-50'}`}
            href={
              celular ? `${whatsapp(celular)}?text=${encodeURIComponent(a.mensagem)}` : undefined
            }
            aria-disabled={!celular}
            target="_blank"
            rel="noreferrer"
            title={celular ? `WhatsApp para ${celular}` : 'Paciente sem celular no cadastro'}
          >
            <Icone nome="conversa" className="h-3.5 w-3.5" />
            WhatsApp
          </a>
        </>
      )}
      {/* Assinado pelo paciente não se cancela. */}
      {props.podeEditar && !a.assinadoEm && (
        <button
          className="botao-leve botao-pequeno text-perigo"
          disabled={cancelar.isPending}
          onClick={async () =>
            (await confirmar(
              'Cancelar o pedido? O link deixa de valer e os procedimentos voltam para a Ficha clínica.',
              { botao: 'Cancelar pedido' },
            )) && cancelar.mutate()
          }
        >
          Cancelar
        </button>
      )}
    </div>
  )
}

// ── Planejamentos (fichas de especialidade, R-068) ──────────────────────────
interface Etapa {
  id: string
  nome: string
  data: string | null
  executado: boolean
  /** Bloco fixo: não sai do planejamento. */
  tipo?: TipoEtapa
  /** Assinada pelo paciente: nome e data não mudam, só o executado. */
  travada?: boolean
}
interface ItemFicha {
  id: number
  dente: string
  faces: string
  procedimento: string
  status: string
  observacao: string | null
  data: string | null
  /** Enviado ao paciente (com assinadoEm, assinado): só a situação muda. */
  autorizacao: { id: number; assinadoEm: string | null } | null
}
interface Nota {
  id: string
  texto: string
  em: string
  autor: string | null
  editadoEm?: string
}
type SituacaoAprovacao = 'NAO_ENVIADO' | 'AGUARDANDO' | 'APROVADO' | 'ALTERADO'
interface Ficha {
  id: number
  especialidade: string
  notas: Nota[]
  status: (typeof STATUS_FICHA)[number]
  inicio: string | null
  fim: string | null
  etapas: Etapa[]
  criadoEm: string
  profissional: { id: number; nome: string }
  itens: ItemFicha[]
  aprovacao: { situacao: SituacaoAprovacao; assinadoEm: string | null }
}

const ETIQUETA_FICHA: Record<Ficha['status'], string> = {
  'Em andamento': 'etiqueta etiqueta-info',
  Finalizada: 'etiqueta etiqueta-sucesso',
  Suspensa: 'etiqueta',
}

const APROVACAO: Record<
  SituacaoAprovacao,
  { rotulo: string; classe: string; ajuda: string; cor: string }
> = {
  NAO_ENVIADO: {
    rotulo: 'Não enviado',
    classe: 'etiqueta',
    cor: 'var(--suave)',
    ajuda: 'Envie o planejamento para o paciente ler e assinar pelo celular.',
  },
  AGUARDANDO: {
    rotulo: 'Aguardando assinatura',
    classe: 'etiqueta etiqueta-aviso',
    cor: 'var(--aviso)',
    ajuda: 'Mande o link ao paciente. Para mudar o que foi enviado, cancele o pedido.',
  },
  APROVADO: {
    rotulo: 'Aprovado',
    classe: 'etiqueta etiqueta-sucesso',
    cor: 'var(--sucesso)',
    ajuda:
      'O que foi assinado não muda, só o andamento. O que você acrescentar vai num novo pedido.',
  },
  ALTERADO: {
    rotulo: 'Alterado após assinar',
    classe: 'etiqueta etiqueta-info',
    cor: 'var(--info)',
    ajuda: 'Há procedimentos ou etapas novos desde a assinatura: envie para assinar novamente.',
  },
}

/** Cor de cada situação do dente na ficha, das variáveis do tema. */
const COR_DENTE_FICHA: Record<string, string> = {
  'Em avaliação': 'var(--info)',
  'Em tratamento': 'var(--aviso)',
  Executado: 'var(--sucesso)',
  Suspenso: 'var(--suave)',
  Finalizado: 'var(--primaria)',
}
/** Cor dos blocos fixos das etapas. */
const COR_ETAPA: Record<TipoEtapa, string> = {
  AVALIACAO: 'var(--info)',
  PLANEJAMENTO: 'var(--info)',
  APROVACAO: 'var(--aviso)',
  FINALIZACAO: 'var(--primaria)',
}
const misturar = (cor: string, pct: number) => `color-mix(in srgb, ${cor} ${pct}%, transparent)`

/** Dias do início até o fim (ou até hoje, se não acabou). */
function duracao(f: Ficha) {
  if (!f.inicio) return ''
  const ate = f.fim?.slice(0, 10) ?? isoLocal(new Date())
  const dias = Math.round(
    (Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${f.inicio.slice(0, 10)}T00:00:00Z`)) / 864e5,
  )
  return dias < 0 ? '' : `${dias} ${dias === 1 ? 'dia' : 'dias'}`
}

function SeloDenteFicha({ status }: { status: string }) {
  const cor = COR_DENTE_FICHA[status] ?? 'var(--suave)'
  return (
    <span className="etiqueta" style={{ color: cor, background: misturar(cor, 14) }}>
      <span className="size-2 rounded-full" style={{ background: cor }} />
      {status}
    </span>
  )
}

/** Um lançamento = mesmo procedimento, data, situação, observação e pedido de assinatura. */
function agruparItensFicha(itens: ItemFicha[]) {
  const porChave = new Map<string, ItemFicha[]>()
  for (const i of itens) {
    const k = [i.procedimento, i.data, i.status, i.observacao, i.autorizacao?.id].join('|')
    porChave.set(k, [...(porChave.get(k) ?? []), i])
  }
  return [...porChave.values()]
}

const dentesDoGrupo = (g: { dente: string | null; faces: string | null }[]) =>
  g
    .filter((x) => x.dente)
    .map((x) => denteComFaces(x.dente, x.faces))
    .sort()

const chaveFichas = (id: number) => ['fichas', id]

/**
 * Aba "Plano e Ficha Clínica": a aprovação de procedimentos avulsos (cada um assinado por
 * vez) e os planejamentos completos de cada especialidade.
 */
export function FichasEspecialidade({ paciente }: { paciente: Paciente }) {
  const { data: eu } = useSuspenseQuery(consultaEu)
  const qc = useQueryClient()
  const [filtro, setFiltro] = useState<string>('plano')
  const [aberta, setAberta] = useState<number | null>(null)
  const [nova, setNova] = useState(false)
  const lista = useQuery({
    queryKey: chaveFichas(paciente.id),
    queryFn: async () => (await api.get<Ficha[]>(`/pacientes/${paciente.id}/fichas`)).data,
  })
  const excluir = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/prontuario/fichas/${id}`)).data,
    onSuccess: () => {
      avisar('Planejamento excluído')
      qc.invalidateQueries({ queryKey: chaveFichas(paciente.id) })
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const podeEditar = pode(eu.perfis, 'prontuario.editar')
  const fichas = lista.data ?? []
  const visiveis = filtro === 'todas' ? fichas : fichas.filter((f) => f.especialidade === filtro)
  const fichaAberta = fichas.find((f) => f.id === aberta)
  const irPara = (id: string) => {
    setFiltro(id)
    setAberta(null)
  }

  const pedidos = useQuery(consultaPedidos(paciente.id))
  const emPlanejamentos = filtro !== 'plano' || !!fichaAberta
  const aguardandoAvulsos = (pedidos.data ?? []).filter((a) => !a.assinadoEm).length

  /** Uma das duas opções da barra: ícone, título, descrição e contador. */
  const opcao = (p: {
    icone: NomeIcone
    titulo: string
    descricao: string
    n: number
    rotuloN: string
    atual: boolean
    chip: string
    aoClicar: () => void
  }) => (
    <button
      type="button"
      aria-current={p.atual ? 'page' : undefined}
      onClick={p.aoClicar}
      className={`flex w-full items-center gap-3 p-3 text-left outline-none focus-visible:ring-4 focus-visible:ring-primaria/25 ${p.atual ? 'bg-primaria-clara' : 'hover:bg-superficie-2'}`}
    >
      <span
        className={`grid size-11 shrink-0 place-items-center rounded-xl ${p.atual ? 'bg-primaria text-sobre-primaria shadow-[0_3px_0_0_color-mix(in_srgb,var(--primaria)_55%,black)]' : p.chip}`}
      >
        <Icone nome={p.icone} className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block font-extrabold ${p.atual ? 'text-titulo' : ''}`}>{p.titulo}</span>
        <span className="block text-xs text-suave">{p.descricao}</span>
      </span>
      {p.n > 0 && (
        <span
          aria-label={p.rotuloN}
          className={`min-w-6 rounded-full px-2 py-0.5 text-center text-[11px] font-extrabold ${p.atual ? 'bg-primaria text-sobre-primaria' : 'bg-aviso/15 text-aviso'}`}
        >
          {p.n}
        </span>
      )}
    </button>
  )
  const bloco = (atual: boolean) =>
    `overflow-hidden rounded-2xl bg-superficie ${atual ? 'border-2 border-primaria ring-4 ring-primaria/15' : 'border border-borda hover:border-primaria/50'}`

  return (
    // Tela larga: a navegação fica parada e só o conteúdo da direita rola.
    <div className="grid items-start gap-4 lg:h-full lg:grid-cols-[19rem_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
      <nav
        aria-label="Plano e Ficha Clínica"
        className="flex flex-col gap-2.5 text-sm lg:max-h-full lg:min-h-0"
      >
        <div className={bloco(!emPlanejamentos)}>
          {opcao({
            icone: 'documento',
            titulo: 'Aprovação de procedimentos',
            descricao: 'Avulsos, assinados um a um',
            n: aguardandoAvulsos,
            rotuloN: `${aguardandoAvulsos} aguardando assinatura`,
            atual: !emPlanejamentos,
            chip: 'bg-secundaria-clara text-aviso',
            aoClicar: () => irPara('plano'),
          })}
        </div>

        <div className={`${bloco(emPlanejamentos)} lg:flex lg:min-h-0 lg:flex-col`}>
          {opcao({
            icone: 'pastaAberta',
            titulo: 'Planejamentos',
            descricao: 'Tratamento completo por especialidade',
            n: fichas.length,
            rotuloN: `${fichas.length} planejamentos`,
            atual: emPlanejamentos,
            chip: 'bg-primaria-clara text-primaria',
            aoClicar: () => irPara('todas'),
          })}
          {emPlanejamentos && (
            <ul className="max-h-[50vh] space-y-0.5 overflow-y-auto lg:max-h-none lg:min-h-0 lg:flex-1 border-t border-borda p-1.5">
              {lista.isPending && <li className="px-2.5 py-2 text-xs text-suave">Carregando…</li>}
              {fichas.map((f) => {
                const atual = aberta === f.id
                const cor =
                  f.status === 'Finalizada' ? 'var(--sucesso)' : APROVACAO[f.aprovacao.situacao].cor
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      aria-current={atual ? 'page' : undefined}
                      onClick={() => setAberta(f.id)}
                      title={`${APROVACAO[f.aprovacao.situacao].rotulo} · ${f.status}`}
                      className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-2.5 text-left outline-none focus-visible:ring-4 focus-visible:ring-primaria/25 ${atual ? 'bg-primaria-clara font-extrabold text-primaria' : 'hover:bg-superficie-2'}`}
                    >
                      <span
                        aria-hidden
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: cor }}
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {f.especialidade} · Nº {f.id}
                      </span>
                      <span className="text-[11px] font-semibold text-suave">
                        {dataBR(f.inicio ?? f.criadoEm).slice(0, 5)}
                      </span>
                    </button>
                  </li>
                )
              })}
              {podeEditar && (
                <li>
                  <button
                    type="button"
                    onClick={() => setNova(true)}
                    className="flex min-h-11 w-full items-center gap-2 rounded-xl px-2.5 font-extrabold text-primaria hover:bg-primaria-clara"
                  >
                    <Icone nome="mais" className="h-4 w-4" /> Novo planejamento
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      </nav>

      <div key={aberta ?? filtro} className="min-w-0 lg:h-full lg:overflow-y-auto lg:pr-1">
        {fichaAberta ? (
          <FichaDetalhe
            key={fichaAberta.id}
            ficha={fichaAberta}
            paciente={paciente}
            podeEditar={podeEditar}
            voltar={() => setAberta(null)}
          />
        ) : filtro === 'plano' ? (
          <PlanoFichaClinica paciente={paciente} />
        ) : (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-extrabold text-titulo">
                  {filtro === 'todas' ? 'Planejamentos' : filtro}
                </h2>
                <p className="subtitulo text-sm">
                  O tratamento completo: etapas com datas, procedimentos e a assinatura do paciente.
                </p>
              </div>
              {podeEditar && (
                <button className="botao" onClick={() => setNova(true)}>
                  <Icone nome="mais" className="h-4 w-4" /> Novo planejamento
                </button>
              )}
            </div>
            {lista.isPending && <p className="text-suave">Carregando…</p>}
            {lista.data && !visiveis.length && (
              <div className="grid place-items-center rounded-2xl border-2 border-dashed border-borda p-10 text-center">
                <div className="space-y-1">
                  <Icone nome="pasta" className="mx-auto h-8 w-8 text-primaria" />
                  <p className="font-bold">Nenhum planejamento ainda</p>
                  {podeEditar && (
                    <p className="text-xs text-suave">
                      Use “Novo planejamento” para começar o tratamento de uma especialidade.
                    </p>
                  )}
                </div>
              </div>
            )}
            {!!visiveis.length && (
              <div className="cartao overflow-x-auto p-0">
                <table className="w-full min-w-[40rem] text-left whitespace-nowrap">
                  <thead>
                    <tr>
                      {['Tipo', 'Aprovação', 'Status', 'Início', 'Fim', 'Duração', ''].map((t) => (
                        <th
                          key={t}
                          className="border-b border-borda px-4 py-2.5 text-xs font-bold tracking-wide text-suave uppercase"
                        >
                          {t}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visiveis.map((f) => (
                      <tr
                        key={f.id}
                        className="cursor-pointer border-b border-borda last:border-0 hover:bg-primaria-clara"
                        onClick={() => setAberta(f.id)}
                      >
                        <td className="px-4 py-2.5">
                          <button
                            type="button"
                            className="flex items-center gap-2 text-left font-bold text-primaria hover:underline"
                          >
                            <Icone nome="arquivo" className="h-4 w-4 shrink-0" />
                            {f.especialidade}
                            <span className="font-normal text-suave">nº {f.id}</span>
                          </button>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={APROVACAO[f.aprovacao.situacao].classe}>
                            {APROVACAO[f.aprovacao.situacao].rotulo}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={ETIQUETA_FICHA[f.status]}>{f.status}</span>
                        </td>
                        <td className="px-4 py-2.5">{dataBR(f.inicio)}</td>
                        <td className="px-4 py-2.5">{dataBR(f.fim)}</td>
                        <td className="px-4 py-2.5">{duracao(f)}</td>
                        <td className="px-2 py-1 text-right" onClick={(e) => e.stopPropagation()}>
                          <MenuAcoes rotulo={`Ações do planejamento ${f.especialidade}`}>
                            <button
                              role="menuitem"
                              className={ITEM_MENU}
                              onClick={() => setAberta(f.id)}
                            >
                              Abrir
                            </button>
                            {podeEditar && (
                              <>
                                <hr className="my-1 border-borda" />
                                <button
                                  role="menuitem"
                                  className={`${ITEM_MENU} text-perigo`}
                                  onClick={async () =>
                                    (await confirmar(
                                      `Excluir o planejamento de ${f.especialidade}? Ele sai da lista, mas fica no histórico.`,
                                      { botao: 'Excluir' },
                                    )) && excluir.mutate(f.id)
                                  }
                                >
                                  Excluir
                                </button>
                              </>
                            )}
                          </MenuAcoes>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>

      <Dialogo aberto={nova} aoFechar={() => setNova(false)} titulo="Novo planejamento">
        <NovaFicha
          paciente={paciente}
          especialidade={filtro === 'todas' || filtro === 'plano' ? '' : filtro}
          aoTerminar={(id) => {
            setNova(false)
            if (id) setAberta(id)
          }}
        />
      </Dialogo>
    </div>
  )
}

function NovaFicha(props: {
  paciente: Paciente
  especialidade: string
  aoTerminar: (id?: number) => void
}) {
  const qc = useQueryClient()
  const { data: prof } = useQuery(consultaProfissionais)
  const criar = useMutation({
    mutationFn: async (d: Record<string, unknown>) =>
      (await api.post<Ficha>(`/pacientes/${props.paciente.id}/fichas`, d)).data,
    onSuccess: async (f) => {
      avisar('Planejamento criado')
      await qc.invalidateQueries({ queryKey: chaveFichas(props.paciente.id) })
      props.aoTerminar(f.id)
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const erros = errosDosCampos(criar.error)
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        const f = Object.fromEntries(new FormData(e.currentTarget))
        criar.mutate({ ...f, profissionalId: Number(f.profissionalId) })
      }}
    >
      <div>
        <label className="rotulo" id="ficha-esp-rotulo">
          Especialidade *
        </label>
        <CampoEspecialidade
          inicial={props.especialidade}
          chave="especialidadesFicha"
          rotulo="ficha-esp-rotulo"
          naLinha
        />
        {erros.especialidade && <p className="erro-campo">{erros.especialidade}</p>}
      </div>
      <label className="block">
        <span className="rotulo">Dentista *</span>
        <CampoSelect
          // Remonta quando a lista chega, para o padrão (eu) valer.
          key={prof ? 'pronto' : 'carregando'}
          name="profissionalId"
          required
          defaultValue={prof?.meuId ?? ''}
          opcoes={prof?.profissionais.map((p) => [p.id, p.nome] as const)}
        />
      </label>
      <label className="block">
        <span className="rotulo">Observações</span>
        <textarea
          name="observacoes"
          className="campo"
          rows={2}
          maxLength={LIMITE_OBSERVACAO}
          placeholder="Opcional"
        />
        <span className="ajuda">Dá para acrescentar e editar outras depois, no planejamento.</span>
      </label>
      <div className="flex justify-end gap-2 border-t border-borda pt-4">
        <button type="button" className="botao-leve" onClick={() => props.aoTerminar()}>
          Cancelar
        </button>
        <button className="botao" disabled={criar.isPending}>
          Criar planejamento
        </button>
      </div>
    </form>
  )
}

/** Id de etapa criada na tela; o servidor guarda como veio. */
const idEtapa = () => `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** Um planejamento aberto: andamento, etapas, procedimentos, observações e a assinatura. */
function FichaDetalhe({
  ficha: f,
  paciente,
  podeEditar,
  voltar,
}: {
  ficha: Ficha
  paciente: Paciente
  podeEditar: boolean
  voltar: () => void
}) {
  const qc = useQueryClient()
  const { data: prof } = useQuery(consultaProfissionais)
  // As etapas mudam aqui na hora; o servidor recebe a lista inteira a cada mudança.
  const [etapas, setEtapas] = useState(f.etapas)
  // A ficha veio de novo do servidor (salvou, o paciente assinou): as etapas acompanham.
  const [doServidor, setDoServidor] = useState(f.etapas)
  if (doServidor !== f.etapas) {
    setDoServidor(f.etapas)
    setEtapas(f.etapas)
  }
  const [dialogo, setDialogo] = useState<{ grupo?: ItemFicha[] } | null>(null)
  const [enviando, setEnviando] = useState(false)
  const atualizar = () => qc.invalidateQueries({ queryKey: chaveFichas(paciente.id) })
  const trocar = (nova: Ficha) =>
    qc.setQueryData<Ficha[]>(chaveFichas(paciente.id), (l) =>
      l?.map((x) => (x.id === nova.id ? nova : x)),
    )
  const dia = (v: string | null) => v?.slice(0, 10) ?? ''

  const pedidos = useQuery({
    queryKey: [...chaveAutorizacoes(paciente.id), 'ficha', f.id],
    queryFn: async () =>
      (
        await api.get<Pedido[]>('/autorizacoes', {
          params: { pacienteId: paciente.id, fichaId: f.id },
        })
      ).data,
    refetchInterval: (q) =>
      q.state.data?.some((a) => !a.assinadoEm) ? INTERVALO_ASSINATURA : false,
    refetchOnWindowFocus: true,
  })
  // Assinatura nova percebida pela consulta: atualiza a ficha (aprovação e travas).
  const nAssinados = pedidos.data?.filter((a) => a.assinadoEm).length ?? 0
  useEffect(() => {
    if (nAssinados) qc.invalidateQueries({ queryKey: chaveFichas(paciente.id) })
  }, [nAssinados, paciente.id, qc])
  const depoisDoPedido = () => {
    atualizar()
    pedidos.refetch()
  }

  const salvar = useMutation({
    mutationFn: async (d: Record<string, unknown>) =>
      (await api.patch<Ficha>(`/prontuario/fichas/${f.id}`, d)).data,
    onSuccess: trocar,
    onError: (e) => {
      avisar(mensagemDeErro(e), true)
      setEtapas(f.etapas)
      atualizar()
    },
  })
  const mudarEtapas = (novas: Etapa[]) => {
    setEtapas(novas)
    salvar.mutate({ etapas: novas })
  }
  const mudarEtapa = (i: number, d: Partial<Etapa>) =>
    mudarEtapas(etapas.map((e, j) => (j === i ? { ...e, ...d } : e)))
  const mover = (de: number, para: number) => {
    if (de === para || para < 0 || para >= etapas.length) return
    const l = [...etapas]
    l.splice(para, 0, ...l.splice(de, 1))
    mudarEtapas(l)
  }
  // Arrastar só pela alça: o card inteiro arrastável atrapalharia selecionar texto nos campos.
  const [alca, setAlca] = useState<number | null>(null)
  const [arrastando, setArrastando] = useState<number | null>(null)
  const [alvo, setAlvo] = useState<number | null>(null)
  const feitas = etapas.filter((e) => e.executado).length
  const atual = etapas.findIndex((e) => !e.executado)
  const ap = APROVACAO[f.aprovacao.situacao]
  const podeEnviar = ['NAO_ENVIADO', 'ALTERADO'].includes(f.aprovacao.situacao)

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="botao-leve botao-icone"
          aria-label="Voltar para os planejamentos"
          title="Voltar para os planejamentos"
          onClick={voltar}
        >
          <Icone nome="esquerda" className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-extrabold text-titulo">
              {f.especialidade} <span className="font-normal text-suave">nº {f.id}</span>
            </h2>
            <span className={ETIQUETA_FICHA[f.status]}>{f.status}</span>
            <span className={ap.classe}>{ap.rotulo}</span>
          </div>
          <p className="flex flex-wrap gap-x-3 text-sm text-suave">
            <span className="inline-flex items-center gap-1">
              <Icone nome="profissionais" className="h-3.5 w-3.5" />
              {f.profissional.nome}
            </span>
            {f.inicio && (
              <span className="inline-flex items-center gap-1">
                <Icone nome="agenda" className="h-3.5 w-3.5" />
                Desde {dataBR(f.inicio)} · {duracao(f)}
              </span>
            )}
          </p>
        </div>
      </header>

      <section
        aria-labelledby="assinatura-paciente"
        className="cartao space-y-3 border-l-4"
        style={{ borderLeftColor: ap.cor }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <span
            aria-hidden
            className="grid size-11 shrink-0 place-items-center rounded-xl"
            style={{ background: misturar(ap.cor, 14), color: ap.cor }}
          >
            <Icone nome="celular" className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3
              id="assinatura-paciente"
              className="flex flex-wrap items-center gap-2 font-semibold"
            >
              Assinatura do paciente <span className={ap.classe}>{ap.rotulo}</span>
            </h3>
            <p className="text-xs text-suave">{ap.ajuda}</p>
          </div>
          {podeEditar && podeEnviar && (
            <button
              className="botao"
              disabled={!f.itens.length}
              title={f.itens.length ? undefined : 'Adicione um procedimento antes'}
              onClick={() => setEnviando(true)}
            >
              <Icone nome="celular" className="h-4 w-4" />
              {f.aprovacao.situacao === 'ALTERADO'
                ? 'Enviar para assinar de novo'
                : 'Enviar para o paciente assinar'}
            </button>
          )}
        </div>
        {!!pedidos.data?.length && (
          <div className="divide-y divide-borda rounded-xl border border-borda">
            {pedidos.data.map((a) => (
              <div key={a.id} className="px-3 py-2.5">
                <LinhaPedido
                  pedido={a}
                  paciente={paciente}
                  podeEditar={podeEditar}
                  aoMudar={depoisDoPedido}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="cartao space-y-3">
        <h3 className="font-semibold">Status do tratamento</h3>
        <fieldset disabled={!podeEditar} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="block">
            <span className="rotulo">Status</span>
            <CampoSelect
              value={f.status}
              vazio={false}
              opcoes={STATUS_FICHA}
              onChange={(e) => salvar.mutate({ status: e.target.value })}
            />
          </label>
          <label
            className="block"
            // Início vazio: ao clicar, vira hoje, e avaliação e planejamento ficam feitos hoje.
            onFocus={() => {
              if (f.inicio || salvar.isPending) return
              const hoje = isoLocal(new Date())
              const novas = etapas.map((e) =>
                (e.tipo === 'AVALIACAO' || e.tipo === 'PLANEJAMENTO') && !e.travada
                  ? { ...e, data: e.data ?? hoje, executado: true }
                  : e,
              )
              setEtapas(novas)
              salvar.mutate({ inicio: hoje, etapas: novas })
            }}
          >
            <span className="rotulo">Início</span>
            <CampoData
              value={dia(f.inicio)}
              onChange={(v) => v !== dia(f.inicio) && salvar.mutate({ inicio: v })}
            />
          </label>
          <label className="block">
            <span className="rotulo">Fim</span>
            <CampoData
              value={dia(f.fim)}
              onChange={(v) => v !== dia(f.fim) && salvar.mutate({ fim: v })}
            />
            <span className="ajuda">Finalizar sem data põe a de hoje.</span>
          </label>
          <label className="block">
            <span className="rotulo">Dentista</span>
            <CampoSelect
              value={f.profissional.id}
              vazio={false}
              opcoes={prof?.profissionais.map((p) => [p.id, p.nome] as const)}
              onChange={(e) => salvar.mutate({ profissionalId: Number(e.target.value) })}
            />
          </label>
        </fieldset>
      </section>

      <ObservacoesFicha ficha={f} podeEditar={podeEditar} aoMudar={trocar} />

      <section className="cartao @container space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-semibold">Etapas</h3>
          <div className="flex flex-1 items-center gap-2 text-xs text-suave">
            <div className="h-2 max-w-48 flex-1 overflow-hidden rounded-full bg-superficie-2">
              <div
                className="h-full rounded-full bg-sucesso transition-all"
                style={{ width: `${(feitas / etapas.length) * 100}%` }}
              />
            </div>
            {feitas} de {etapas.length} concluídas
          </div>
          {podeEditar && etapas.length < LIMITE_ETAPAS && (
            <button
              type="button"
              className="botao-fantasma botao-pequeno ml-auto"
              // Entra antes da finalização se ela for a última; senão, no fim.
              onClick={() => {
                const fim =
                  etapas.at(-1)?.tipo === 'FINALIZACAO' ? etapas.length - 1 : etapas.length
                mudarEtapas([
                  ...etapas.slice(0, fim),
                  { id: idEtapa(), nome: `Etapa ${fim + 1}`, data: null, executado: false },
                  ...etapas.slice(fim),
                ])
              }}
            >
              + Nova etapa
            </button>
          )}
        </div>
        <ol className="grid grid-cols-2 gap-x-5 gap-y-5 @xl:grid-cols-3 @3xl:grid-cols-4 @5xl:grid-cols-6">
          {etapas.map((e, i) => {
            const cor = e.tipo ? COR_ETAPA[e.tipo] : 'var(--suave)'
            const aprovacao = e.tipo === 'APROVACAO'
            const fixo = !podeEditar || e.travada
            const ultima = i === etapas.length - 1
            return (
              <li
                key={e.id}
                draggable={alca === i}
                onDragStart={(ev) => {
                  ev.dataTransfer.effectAllowed = 'move'
                  setArrastando(i)
                }}
                onDragOver={(ev) => {
                  if (arrastando === null) return
                  ev.preventDefault()
                  setAlvo(i)
                }}
                onDrop={(ev) => {
                  ev.preventDefault()
                  if (arrastando !== null) mover(arrastando, i)
                }}
                onDragEnd={() => {
                  setAlca(null)
                  setArrastando(null)
                  setAlvo(null)
                }}
                className={`group relative flex flex-col items-center gap-2 rounded-2xl border bg-superficie px-2 pt-10 pb-3 text-center transition duration-200 hover:-translate-y-0.5 hover:border-primaria/40 hover:shadow-md ${i === atual ? 'border-primaria/50 shadow-sm' : 'border-borda'} ${arrastando === i ? 'scale-95 opacity-40' : ''} ${alvo === i && arrastando !== i ? 'outline-2 outline-offset-4 outline-primaria outline-dashed' : ''}`}
                style={e.tipo ? { background: misturar(cor, 6) } : undefined}
              >
                {/* Seta para a próxima etapa, no vão da grade. */}
                {!ultima && (
                  <span
                    aria-hidden
                    className={`absolute top-1/2 -right-[1.1rem] z-10 grid size-5 -translate-y-1/2 place-items-center rounded-full text-sm leading-none font-black ${e.executado ? 'bg-sucesso text-superficie' : 'bg-superficie-2 text-suave'}`}
                  >
                    ›
                  </span>
                )}
                <div className="absolute inset-x-2 top-2 flex items-center gap-1.5">
                  <span
                    className={`grid size-7 shrink-0 place-items-center rounded-full border-2 text-xs font-extrabold ${e.executado ? 'border-sucesso bg-sucesso text-superficie' : 'bg-superficie text-titulo'} ${i === atual ? 'ring-4 ring-primaria/25' : ''}`}
                    style={e.executado ? undefined : { borderColor: cor }}
                  >
                    {e.executado ? '✓' : i + 1}
                  </span>
                  <span className="flex min-w-0 flex-1 items-center gap-1 text-[10px] font-bold tracking-wide text-suave uppercase">
                    {e.travada && <Icone nome="cadeado" className="h-3 w-3" />}
                    {e.travada ? 'Assinada' : e.tipo ? 'Fixa' : 'Etapa'}
                  </span>
                  {podeEditar && (
                    <span className="flex items-center opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100">
                      <button
                        type="button"
                        className="rounded p-0.5 text-suave hover:bg-primaria/10 hover:text-primaria disabled:invisible"
                        aria-label={`Mover ${e.nome} para antes`}
                        title="Mover para antes"
                        disabled={i === 0}
                        onClick={() => mover(i, i - 1)}
                      >
                        <Icone nome="esquerda" className="h-3.5 w-3.5" />
                      </button>
                      <span
                        className="cursor-grab px-0.5 text-base leading-none text-suave select-none hover:text-primaria active:cursor-grabbing"
                        title="Arraste para mudar a ordem"
                        aria-hidden
                        onPointerDown={() => setAlca(i)}
                        onPointerUp={() => setAlca(null)}
                      >
                        ⠿
                      </span>
                      <button
                        type="button"
                        className="rounded p-0.5 text-suave hover:bg-primaria/10 hover:text-primaria disabled:invisible"
                        aria-label={`Mover ${e.nome} para depois`}
                        title="Mover para depois"
                        disabled={ultima}
                        onClick={() => mover(i, i + 1)}
                      >
                        <Icone nome="direita" className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  )}
                </div>
                <input
                  className="w-full rounded-lg border-2 border-transparent bg-transparent px-1 py-0.5 text-center text-sm font-bold text-titulo outline-none hover:border-borda focus:border-primaria read-only:hover:border-transparent"
                  defaultValue={e.nome}
                  readOnly={fixo}
                  aria-label={`Nome da etapa ${i + 1}`}
                  title={fixo ? undefined : 'Clique para renomear'}
                  maxLength={80}
                  onBlur={(ev) => {
                    const nome = ev.target.value.trim()
                    if (!nome) ev.target.value = e.nome
                    else if (nome !== e.nome) mudarEtapa(i, { nome })
                  }}
                />
                {/* fieldset: o jeito de travar o campo de data (e o calendário dele). */}
                <fieldset disabled={fixo || (aprovacao && e.executado)} className="w-full min-w-0">
                  <CampoData
                    aria-label={`Data prevista da etapa ${e.nome}`}
                    value={e.data ?? ''}
                    onChange={(v) => v !== (e.data ?? '') && mudarEtapa(i, { data: v || null })}
                  />
                </fieldset>
                {aprovacao ? (
                  <p className="text-xs text-suave">
                    {e.executado
                      ? `Paciente assinou em ${dataBR(e.data)}`
                      : 'Marca sozinha quando o paciente assinar'}
                  </p>
                ) : (
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      className="check-sucesso"
                      checked={e.executado}
                      disabled={!podeEditar}
                      onChange={(ev) =>
                        mudarEtapa(i, {
                          executado: ev.target.checked,
                          // Marcou sem data: fica a de hoje (se a etapa ainda pode mudar).
                          data:
                            ev.target.checked && !e.data && !e.travada
                              ? isoLocal(new Date())
                              : e.data,
                        })
                      }
                    />
                    Executado
                  </label>
                )}
                {podeEditar && !e.tipo && !e.travada && (
                  <button
                    type="button"
                    className="absolute -top-2 -right-2 rounded-full border border-borda bg-superficie p-1 text-suave opacity-0 shadow-sm transition group-hover:opacity-100 hover:border-perigo hover:bg-perigo hover:text-superficie focus-visible:opacity-100"
                    aria-label={`Remover a etapa ${e.nome}`}
                    title="Remover etapa"
                    onClick={async () =>
                      (await confirmar(`Remover a etapa "${e.nome}"?`, { botao: 'Remover' })) &&
                      mudarEtapas(etapas.filter((_, j) => j !== i))
                    }
                  >
                    <Icone nome="fechar" className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            )
          })}
        </ol>
        <p className="text-xs text-suave">
          Avaliação, planejamento, aprovação do caso e finalização não saem (o nome pode mudar).
          Arraste pela alça ⠿ ou use as setas para mudar a ordem. Etapa assinada pelo paciente só
          muda o executado e a posição.
        </p>
      </section>

      <ProcedimentosFicha
        ficha={f}
        podeEditar={podeEditar}
        aoAdicionar={() => setDialogo({})}
        aoEditar={(grupo) => setDialogo({ grupo })}
        atualizar={atualizar}
      />

      <Dialogo
        aberto={!!dialogo}
        aoFechar={() => setDialogo(null)}
        titulo={
          dialogo?.grupo
            ? `Editar procedimento · ${dialogo.grupo[0].procedimento}`
            : `Adicionar procedimento · ${f.especialidade}`
        }
        largo
      >
        {dialogo && (
          <FormProcedimentoFicha
            paciente={paciente}
            ficha={f}
            grupo={dialogo.grupo}
            aoTerminar={(salvo) => {
              setDialogo(null)
              if (salvo) atualizar()
            }}
          />
        )}
      </Dialogo>

      <Dialogo
        aberto={enviando}
        aoFechar={() => setEnviando(false)}
        titulo="Enviar o planejamento para o paciente assinar"
        largo
      >
        {enviando && (
          <EnviarPlanejamento
            ficha={f}
            anterior={pedidos.data?.[0]}
            aoTerminar={(id) => {
              setEnviando(false)
              // Sem diálogo de "como enviar": o pedido aparece em Aguardando, com os botões.
              if (id) depoisDoPedido()
            }}
          />
        )}
      </Dialogo>
    </div>
  )
}

/** Observações do planejamento: acrescentar e editar depois (quem e quando ficam gravados). */
function ObservacoesFicha(props: {
  ficha: Ficha
  podeEditar: boolean
  aoMudar: (f: Ficha) => void
}) {
  const f = props.ficha
  // Id da observação sendo editada, ou "nova".
  const [editando, setEditando] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const salvar = useMutation({
    mutationFn: async () =>
      (editando === 'nova'
        ? await api.post<Ficha>(`/prontuario/fichas/${f.id}/notas`, { texto })
        : await api.patch<Ficha>(`/prontuario/fichas/${f.id}/notas/${editando}`, { texto })
      ).data,
    onSuccess: (nova) => {
      avisar(editando === 'nova' ? 'Observação adicionada' : 'Observação atualizada')
      props.aoMudar(nova)
      setEditando(null)
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const abrir = (id: string, t = '') => {
    setTexto(t)
    setEditando(id)
  }
  const formulario = (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        salvar.mutate()
      }}
    >
      <CampoObservacao
        rotulo={editando === 'nova' ? 'Nova observação' : 'Editar observação'}
        ajuda="Só a equipe vê."
        valor={texto}
        aoMudar={setTexto}
        autoFocus
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="botao-leve botao-pequeno"
          onClick={() => setEditando(null)}
        >
          Cancelar
        </button>
        <button className="botao botao-pequeno" disabled={!texto.trim() || salvar.isPending}>
          Salvar
        </button>
      </div>
    </form>
  )
  return (
    <section className="cartao space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Observações</h3>
        {props.podeEditar && !editando && (
          <button
            type="button"
            className="botao-fantasma botao-pequeno"
            onClick={() => abrir('nova')}
          >
            + Adicionar observação
          </button>
        )}
      </div>
      {!f.notas.length && editando !== 'nova' && (
        <p className="text-sm text-suave">Nenhuma observação.</p>
      )}
      <ul className="space-y-2">
        {f.notas.map((n) => (
          <li key={n.id} className="rounded-xl border border-borda p-3">
            {editando === n.id ? (
              formulario
            ) : (
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm whitespace-pre-wrap">{n.texto}</p>
                  <p className="mt-1 text-xs text-suave">
                    {[n.autor, dataBR(n.em)].filter(Boolean).join(' · ')}
                    {n.editadoEm && ` · editada em ${dataBR(n.editadoEm)}`}
                  </p>
                </div>
                {props.podeEditar && !editando && (
                  <button
                    type="button"
                    className="botao-leve botao-pequeno"
                    onClick={() => abrir(n.id, n.texto)}
                  >
                    Editar
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {editando === 'nova' && formulario}
    </section>
  )
}

/**
 * Antes de enviar o planejamento: o texto geral, um comentário por procedimento e um por
 * etapa (sobre as datas). Começa com o que foi escrito no último pedido.
 */
function EnviarPlanejamento(props: {
  ficha: Ficha
  anterior?: Pedido
  aoTerminar: (pedidoId?: number) => void
}) {
  const f = props.ficha
  const ant = props.anterior?.conteudo
  const grupos = new Map<string, ItemFicha[]>()
  for (const i of f.itens) grupos.set(i.procedimento, [...(grupos.get(i.procedimento) ?? []), i])
  const [plano, setPlano] = useState(ant?.plano ?? '')
  const [procedimentos, setProcedimentos] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      [...grupos.keys()].map((n) => [
        n,
        ant?.itens.find((i) => i.nome === n)?.observacaoPaciente ?? '',
      ]),
    ),
  )
  const [etapas, setEtapas] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      f.etapas.map((e) => [e.id, ant?.etapas?.find((x) => x.id === e.id)?.comentario ?? '']),
    ),
  )
  const criar = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ id: number }>('/autorizacoes/ficha', {
          fichaId: f.id,
          plano,
          procedimentos,
          etapas,
        })
      ).data,
    onSuccess: (a) => {
      avisar('Pedido criado: envie o link ao paciente')
      props.aoTerminar(a.id)
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const semData = f.etapas.filter((e) => !e.data && e.tipo !== 'APROVACAO').length
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        criar.mutate()
      }}
    >
      <p className="alerta-info">
        O paciente recebe o planejamento inteiro: etapas com as datas previstas e todos os
        procedimentos. Depois de assinado, o que foi enviado não muda, só o andamento.
      </p>
      <CampoObservacao
        rotulo="Plano de tratamento (texto geral)"
        ajuda="Sai no documento, antes das etapas e dos procedimentos. Opcional."
        valor={plano}
        aoMudar={setPlano}
      />
      <fieldset className="space-y-2">
        <legend className="rotulo">Etapas e datas previstas</legend>
        {!!semData && (
          <p className="text-xs text-aviso">
            {semData === 1 ? '1 etapa está' : `${semData} etapas estão`} sem data prevista: no
            documento sai “a definir”.
          </p>
        )}
        <ol className="divide-y divide-borda rounded-xl border border-borda">
          {f.etapas.map((e, k) => (
            <li
              key={e.id}
              className="grid gap-2 px-3 py-2 sm:grid-cols-[14rem_1fr] sm:items-center"
            >
              <p className="text-sm">
                <strong className="text-titulo">
                  {k + 1}. {e.nome}
                </strong>
                <span className="block text-xs text-suave">
                  {e.data ? `Previsto para ${dataBR(e.data)}` : 'Data a definir'}
                </span>
              </p>
              <input
                className="campo"
                aria-label={`Comentário sobre a etapa ${e.nome}`}
                placeholder="Comentário para o paciente (opcional)"
                maxLength={LIMITE_OBSERVACAO}
                value={etapas[e.id] ?? ''}
                onChange={(ev) => setEtapas({ ...etapas, [e.id]: ev.target.value })}
              />
            </li>
          ))}
        </ol>
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="rotulo">Procedimentos</legend>
        {[...grupos].map(([nome, g]) => {
          const datas = [...new Set(g.map((i) => dataBR(i.data)).filter(Boolean))]
          return (
            <div key={nome} className="space-y-2 rounded-xl border border-borda p-3">
              <p className="font-bold text-titulo">
                {nome}
                <span className="font-normal text-suave">
                  {' '}
                  · dentes {dentesDoGrupo(g).join(', ')}
                  {!!datas.length && ` · previsto ${datas.join(', ')}`}
                </span>
              </p>
              <CampoObservacao
                rotulo="Sobre este procedimento, para o paciente"
                ajuda="Sai no documento que o paciente assina."
                valor={procedimentos[nome] ?? ''}
                aoMudar={(v) => setProcedimentos({ ...procedimentos, [nome]: v })}
              />
            </div>
          )
        })}
      </fieldset>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="botao-leve" onClick={() => props.aoTerminar()}>
          Cancelar
        </button>
        <button className="botao" disabled={criar.isPending}>
          Criar pedido e escolher como enviar
        </button>
      </div>
    </form>
  )
}

/** Procedimentos do planejamento em cartões, como no odontograma: um por lançamento. */
function ProcedimentosFicha(props: {
  ficha: Ficha
  podeEditar: boolean
  aoAdicionar: () => void
  aoEditar: (g: ItemFicha[]) => void
  atualizar: () => void
}) {
  const [filtro, setFiltro] = useState<string | null>(null)
  const aoErrar = (e: unknown) => avisar(mensagemDeErro(e), true)
  const mudarSituacao = useMutation({
    mutationFn: async ({ g, status }: { g: ItemFicha[]; status: string }) =>
      Promise.all(g.map((i) => api.patch(`/prontuario/fichas/itens/${i.id}`, { status }))),
    onSuccess: () => {
      avisar('Situação atualizada')
      props.atualizar()
    },
    onError: aoErrar,
  })
  const remover = useMutation({
    mutationFn: async (g: ItemFicha[]) =>
      Promise.all(g.map((i) => api.delete(`/prontuario/fichas/itens/${i.id}`))),
    onSuccess: () => {
      avisar('Procedimento excluído')
      props.atualizar()
    },
    onError: aoErrar,
  })
  // Mudar a situação de um dente pelo menu muda o lançamento inteiro.
  const grupos = agruparItensFicha(props.ficha.itens)
  const visiveis = grupos.filter((g) => !filtro || g[0].status === filtro)

  return (
    <section className="cartao space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Procedimentos</h3>
        {props.podeEditar && (
          <button className="botao py-1.5" onClick={props.aoAdicionar}>
            <Icone nome="mais" className="h-4 w-4" /> Adicionar procedimento
          </button>
        )}
      </div>
      {!!grupos.length && (
        <div role="group" aria-label="Filtrar por situação" className="flex flex-wrap gap-1.5">
          {([null, ...STATUS_DENTE_FICHA] as const).map((s) => {
            const n = s ? grupos.filter((g) => g[0].status === s).length : grupos.length
            if (s && !n) return null
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
                  <span
                    className="size-2 rounded-full"
                    style={{ background: COR_DENTE_FICHA[s] }}
                  />
                )}
                {s ?? 'Todos'}
                <span className="rounded-full bg-superficie-2 px-1.5 text-[11px]">{n}</span>
              </button>
            )
          })}
        </div>
      )}
      {!grupos.length && (
        <div className="grid place-items-center rounded-xl border-2 border-dashed border-borda p-6 text-center">
          <div className="space-y-1">
            <Icone nome="dente" className="mx-auto h-8 w-8 text-primaria" />
            <p className="font-bold">Nenhum procedimento ainda</p>
            {props.podeEditar && (
              <p className="text-xs text-suave">
                Use “Adicionar procedimento” para lançar os procedimentos nos dentes.
              </p>
            )}
          </div>
        </div>
      )}
      <ul className="space-y-2">
        {visiveis.map((g) => {
          const i = g[0]
          const cor = COR_DENTE_FICHA[i.status] ?? 'var(--suave)'
          const dentes = dentesDoGrupo(g)
          return (
            <li
              key={g.map((x) => x.id).join('-')}
              className="flex items-start gap-3 rounded-xl border border-borda bg-superficie p-3 hover:border-primaria/40 hover:shadow-sm"
            >
              <div
                className="flex size-12 shrink-0 flex-col items-center justify-center rounded-xl border text-center leading-none font-extrabold text-titulo"
                style={{ background: misturar(cor, 8), borderColor: misturar(cor, 35) }}
                title={dentes.join(', ')}
              >
                {dentes.length > 1 ? (
                  <>
                    <span className="text-lg">{dentes.length}</span>
                    <span className="mt-0.5 text-[10px] font-bold text-suave">dentes</span>
                  </>
                ) : (
                  <span className="text-base">{dentes[0]}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="font-bold text-titulo">{i.procedimento}</p>
                  <SeloDenteFicha status={i.status} />
                  {i.autorizacao && (
                    <span
                      className={`etiqueta ${i.autorizacao.assinadoEm ? 'etiqueta-sucesso' : 'etiqueta-aviso'}`}
                      title="Enviado ao paciente: só a situação muda"
                    >
                      <Icone nome="cadeado" className="h-3 w-3" />
                      {i.autorizacao.assinadoEm ? 'Assinado' : 'Aguardando assinatura'}
                    </span>
                  )}
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
                    {dataBR(i.data) || 'Sem data'}
                  </span>
                </p>
                {i.observacao && (
                  <p className="mt-2 rounded-lg bg-superficie-2 px-2.5 py-1.5 text-xs">
                    {i.observacao}
                  </p>
                )}
              </div>
              {props.podeEditar && (
                <MenuAcoes rotulo={`Ações de ${i.procedimento}`}>
                  <p className="px-3 pt-1 pb-0.5 text-xs font-bold text-suave uppercase">
                    Situação
                  </p>
                  {STATUS_DENTE_FICHA.map((s) => {
                    const atual = s === i.status
                    return (
                      <button
                        key={s}
                        role="menuitemradio"
                        aria-checked={atual}
                        className={`${ITEM_MENU} ${atual ? 'bg-superficie-2' : ''}`}
                        disabled={atual || mudarSituacao.isPending}
                        onClick={() => mudarSituacao.mutate({ g, status: s })}
                      >
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ background: COR_DENTE_FICHA[s] }}
                        />
                        <span className="flex-1">{s}</span>
                        {atual && <span aria-hidden>✓</span>}
                      </button>
                    )
                  })}
                  <hr className="my-1 border-borda" />
                  <button role="menuitem" className={ITEM_MENU} onClick={() => props.aoEditar(g)}>
                    {i.autorizacao ? 'Acrescentar dentes' : 'Editar dentes e faces'}
                  </button>
                  {!i.autorizacao && (
                    <button
                      role="menuitem"
                      className={`${ITEM_MENU} text-perigo`}
                      disabled={remover.isPending}
                      onClick={async () =>
                        (await confirmar(
                          `Excluir "${i.procedimento}"${g.length > 1 ? ` dos ${g.length} dentes` : ''} deste planejamento? Ele sai da lista, mas fica no histórico.`,
                        )) && remover.mutate(g)
                      }
                    >
                      Excluir
                    </button>
                  )}
                </MenuAcoes>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Um procedimento por linha, buscando na tabela da clínica (ou escrito à mão). */
function LinhaProcedimento(props: {
  valor: string
  aoMudar: (v: string) => void
  rotulo: string
  autoFocus?: boolean
}) {
  const tabela = useQuery({
    queryKey: ['procedimentos-tabela', props.valor],
    queryFn: async () =>
      (await api.get<Procedimento[]>('/procedimentos', { params: { busca: props.valor } })).data,
  })
  // Texto livre ou um da tabela: a seta indica que há lista (abre ao clicar).
  return (
    <div className="relative">
      <CampoSugestoes
        aria-label={props.rotulo}
        sugestoes={tabela.data?.map((t) => t.nome) ?? []}
        value={props.valor}
        onChange={props.aoMudar}
        placeholder="Escreva ou escolha da lista"
        autoFocus={props.autoFocus}
        className="pr-9"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-suave"
      >
        ▾
      </span>
    </div>
  )
}

/** Dentição escolhida no formulário: as duas puras ou a mista marcada no odontograma. */
type EscolhaDenticao = TipoDenticao | 'MISTA'

/**
 * Quadrantes pela numeração FDI: 1 e 5 superior direito, 2 e 6 superior esquerdo, 3 e 7
 * inferior esquerdo, 4 e 8 inferior direito (5 a 8 são os decíduos). Na mista, o mesmo lado
 * junta os dois números (ex.: 1/5).
 */
const LADO_QUADRANTE = ['sup. direito', 'sup. esquerdo', 'inf. esquerdo', 'inf. direito']
const quadranteDe = (d: string) => (Number(d[0]) - 1) % 4

/** Atalhos de marcar da dentição escolhida: primeiro as marcas gerais, depois os quadrantes. */
function gruposDeDentes(superior: string[], inferior: string[]) {
  const todos = [...superior, ...inferior]
  // Anteriores: incisivos e caninos (1 a 3 na posição do dente).
  const anterior = (d: string) => Number(d[1]) <= 3
  const marcas: [string, string[]][] = [
    ['Todos', todos],
    ['Superior', superior],
    ['Inferior', inferior],
    ['Anteriores', todos.filter(anterior)],
    ['Posteriores', todos.filter((d) => !anterior(d))],
  ]
  const quadrantes = LADO_QUADRANTE.map((lado, q): [string, string[]] => {
    const ds = todos.filter((d) => quadranteDe(d) === q)
    return [`${[...new Set(ds.map((d) => d[0]))].sort().join('/')} · ${lado}`, ds]
  })
  return { marcas, quadrantes }
}

/** Pílula de escolha (a mesma das categorias da agenda). */
const PILULA =
  'relative inline-flex cursor-pointer items-center gap-1.5 rounded-full border-2 border-borda px-3 py-1 text-xs font-bold text-suave transition hover:border-primaria/40 hover:text-texto disabled:cursor-not-allowed disabled:opacity-40 aria-checked:border-primaria aria-checked:bg-primaria-clara aria-checked:text-primaria aria-pressed:border-primaria aria-pressed:bg-primaria-clara aria-pressed:text-primaria has-checked:border-primaria has-checked:bg-primaria-clara has-checked:text-primaria has-focus-visible:ring-4 has-focus-visible:ring-primaria/20'

function EscolhaSituacao(props: {
  rotulo: string
  nome: string
  valor: string
  aoMudar: (s: string) => void
}) {
  return (
    <div role="radiogroup" aria-label={props.rotulo} className="flex flex-wrap gap-1.5">
      {STATUS_DENTE_FICHA.map((s) => (
        <label key={s} className={PILULA}>
          <input
            type="radio"
            className="sr-only"
            name={props.nome}
            checked={props.valor === s}
            onChange={() => props.aoMudar(s)}
          />
          <span className="size-2.5 rounded-full" style={{ background: COR_DENTE_FICHA[s] }} />
          {s}
        </label>
      ))}
    </div>
  )
}

/** Procedimento do odontograma trazido para o planejamento, com os dentes e a situação dele. */
interface Trazido {
  chave: string
  nome: string
  status: string
  dentes: { dente: string; faces: string }[]
}

/** Cartão do procedimento trazido: tira e acrescenta dentes à mão e escolhe a situação. */
function CartaoTrazido(props: {
  t: Trazido
  origem: ItemClinico
  dentes: string[]
  removidos: Set<string>
  aoMudar: (t: Trazido | null) => void
}) {
  const { t } = props
  const [dente, setDente] = useState('')
  const mudar = (n: Partial<Trazido>) => props.aoMudar({ ...t, ...n })
  // Número de dente completo entra na hora (os números válidos têm dois dígitos).
  const digitar = (v: string) => {
    if (!DENTES_VALIDOS.has(v)) return setDente(v)
    setDente('')
    if (props.removidos.has(v))
      return avisar(`Dente ${v} removido: reponha no odontograma antes`, true)
    if (!t.dentes.some((d) => d.dente === v))
      mudar({ dentes: [...t.dentes, { dente: v, faces: '' }] })
  }
  return (
    <li className="space-y-3 rounded-xl border-2 border-primaria bg-superficie p-3 shadow-sm">
      <div className="flex items-start gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-sucesso text-xs font-extrabold text-superficie">
          ✓
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-titulo">{t.nome}</p>
          <p className="text-xs text-suave">
            No odontograma: {STATUS[props.origem.status].rotulo.toLowerCase()}
          </p>
        </div>
        <button
          type="button"
          className="grid size-6 shrink-0 place-items-center rounded-full text-suave hover:bg-perigo/10 hover:text-perigo"
          aria-label={`Tirar ${t.nome}`}
          title="Tirar"
          onClick={() => props.aoMudar(null)}
        >
          <Icone nome="fechar" className="h-3.5 w-3.5" />
        </button>
      </div>
      <div>
        <p className="rotulo text-xs">Dentes</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {t.dentes.map((d) => (
            <span
              key={d.dente}
              className="inline-flex items-center gap-0.5 rounded-lg bg-superficie-2 py-0.5 pr-0.5 pl-2 text-xs font-extrabold text-titulo"
            >
              {denteComFaces(d.dente, d.faces)}
              <button
                type="button"
                className="grid size-5 place-items-center rounded-full text-suave hover:bg-perigo/10 hover:text-perigo"
                aria-label={`Tirar o dente ${d.dente}`}
                onClick={() => mudar({ dentes: t.dentes.filter((x) => x !== d) })}
              >
                ×
              </button>
            </span>
          ))}
          <div className="w-24">
            <CampoSugestoes
              aria-label={`Acrescentar dente em ${t.nome}`}
              sugestoes={props.dentes.filter((d) => !t.dentes.some((x) => x.dente === d))}
              inputMode="numeric"
              value={dente}
              onChange={(v) => digitar(v.trim())}
              // Enter aqui não salva o formulário.
              onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
              placeholder="+ dente"
              className="py-1 text-sm"
            />
          </div>
        </div>
        {!t.dentes.length && (
          <p className="mt-1 text-xs text-perigo">
            Sem dentes: acrescente um ou tire este procedimento.
          </p>
        )}
      </div>
      <div>
        <p className="rotulo text-xs">Situação no planejamento</p>
        <EscolhaSituacao
          rotulo={`Situação de ${t.nome}`}
          nome={`situacao-${t.chave}`}
          valor={t.status}
          aoMudar={(status) => mudar({ status })}
        />
      </div>
    </li>
  )
}

/** Linha de atalhos: rótulo à esquerda, pílulas ao lado. */
function LinhaAtalhos(props: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-full shrink-0 text-xs font-bold text-suave sm:w-24">{props.rotulo}</span>
      {props.children}
    </div>
  )
}

/**
 * "Adicionar procedimento" do planejamento: o procedimento (da tabela ou escrito), a situação e
 * os dentes; ao lado, os já cadastrados no odontograma, que entram com os dentes e uma situação
 * cada. Com "grupo", edita um lançamento: muda a situação, os dentes e acrescenta dentes. Se já
 * foi enviado ao paciente, os dentes enviados ficam travados.
 */
function FormProcedimentoFicha(props: {
  paciente: Paciente
  ficha: Ficha
  grupo?: ItemFicha[]
  aoTerminar: (salvo?: boolean) => void
}) {
  const g = props.grupo
  const enviado = !!g?.[0].autorizacao
  const [procedimentos, setProcedimentos] = useState(g ? [g[0].procedimento] : [''])
  const [status, setStatus] = useState<string>(g?.[0].status ?? STATUS_DENTE_FICHA[0])
  const [linhas, setLinhas] = useState<Linha[]>(
    g?.map((i) => ({ id: i.id, dente: i.dente, faces: i.faces, travada: enviado })) ?? [
      { dente: '', faces: '' },
    ],
  )
  const [trazidos, setTrazidos] = useState<Trazido[]>([])
  // Parte já salva antes de um erro: ao cancelar, a lista da ficha atualiza.
  const [parcial, setParcial] = useState(false)
  const [data, setData] = useState(g ? (g[0].data?.slice(0, 10) ?? '') : isoLocal(new Date()))
  const [observacao, setObservacao] = useState(g?.[0].observacao ?? '')
  const [den] = useDenticao(props.paciente.id)
  const [denticao, setDenticao] = useState<EscolhaDenticao>(den.mista.length ? 'MISTA' : den.tipo)
  const { semCoroa, removidos } = useEstadoDentes(props.paciente.id)
  const odontograma = useProcedimentos(props.paciente.id)

  const ativas = linhas.filter((l) => !l.sai)
  const nomes = [...new Set(procedimentos.map((p) => p.trim()).filter(Boolean))]
  const novas = ativas.filter((l) => !l.id && DENTES_VALIDOS.has(l.dente))
  const temDente = ativas.some((l) => DENTES_VALIDOS.has(l.dente))
  const denteInvalido = ativas.some(
    (l) => (l.dente && !DENTES_VALIDOS.has(l.dente)) || (!l.id && removidos.has(l.dente)),
  )
  const normal = (l: { dente: string; faces: string }) => ({
    dente: l.dente,
    faces: semCoroa.has(l.dente)
      ? ''
      : facesDoDente(l.dente)
          .filter((f) => l.faces.includes(f))
          .join(''),
  })
  const nDentes = (ds: { dente: string }[]) => new Set(ds.map((d) => d.dente)).size
  // Só trouxe do odontograma (que já vem com os dentes): o passo dos dentes já está feito.
  const soTrazidos = !g && !!trazidos.length && !nomes.length && !temDente
  const total = nomes.length * nDentes(novas) + trazidos.reduce((s, t) => s + nDentes(t.dentes), 0)
  const pendencia = denteInvalido
    ? 'Corrija os dentes marcados em vermelho.'
    : g
      ? temDente
        ? ''
        : 'Deixe ao menos um dente.'
      : trazidos.some((t) => !t.dentes.length)
        ? 'Um procedimento do odontograma ficou sem dentes.'
        : nomes.length && !temDente
          ? 'Marque os dentes do procedimento.'
          : !nomes.length && temDente
            ? 'Escreva o procedimento dos dentes marcados.'
            : !total
              ? 'Escreva o procedimento ou traga um do odontograma.'
              : ''

  // Dentes da dentição escolhida: sugestões e atalhos (arcadas e quadrantes).
  const [superior, inferior] =
    denticao === 'MISTA' ? arcada(den.tipo, den.mista) : arcada(denticao, [])
  const dentesDaDenticao = [...superior, ...inferior]
  const semRemovidos = (gs: [string, string[]][]) =>
    gs.map(([r, ds]): [string, string[]] => [r, ds.filter((d) => !removidos.has(d))])
  const atalhos = gruposDeDentes(superior, inferior)
  const marcados = new Set(ativas.filter((l) => DENTES_VALIDOS.has(l.dente)).map((l) => l.dente))
  const alternarGrupo = (ds: string[]) => {
    const todos = ds.every((d) => marcados.has(d))
    const lista = todos
      ? // Desmarcar não tira dente já salvo: esse sai pelo X da linha.
        linhas.filter((l) => l.id || !ds.includes(l.dente))
      : [
          ...linhas.filter((l) => l.dente),
          ...ds.filter((d) => !marcados.has(d)).map((dente) => ({ dente, faces: '' })),
        ]
    setLinhas(lista.length ? lista : [{ dente: '', faces: '' }])
  }
  const pilulasMarcar = (gs: [string, string[]][]) =>
    semRemovidos(gs).map(([rotulo, ds]) => (
      <button
        key={rotulo}
        type="button"
        aria-pressed={!!ds.length && ds.every((d) => marcados.has(d))}
        title={ds.join(', ')}
        disabled={!ds.length}
        onClick={() => alternarGrupo(ds)}
        className={PILULA}
      >
        {rotulo}
      </button>
    ))

  // Já cadastrados no odontograma (só os que têm dente: a ficha é por dente).
  const doOdontograma = agruparProcedimentos(odontograma.data ?? []).filter((x) =>
    x.some((i) => i.dente),
  )
  const chaveDe = (x: ItemClinico[]) => x.map(chaveItem).join(',')
  const trazer = (x: ItemClinico[]) =>
    setTrazidos([
      ...trazidos,
      {
        chave: chaveDe(x),
        nome: x[0].nome,
        status,
        dentes: x
          .filter((i) => i.dente && !removidos.has(i.dente))
          .map((i) => ({ dente: i.dente!, faces: i.faces ?? '' })),
      },
    ])

  const salvar = useMutation({
    mutationFn: async () => {
      const lote = (ps: string[], dentes: { dente: string; faces: string }[], st: string) =>
        api.post<{ criados: number }>(`/prontuario/fichas/${props.ficha.id}/itens/lote`, {
          procedimentos: ps,
          dentes: dentes.map(normal),
          status: st,
          data,
          observacao,
        })
      if (g) {
        // Editar o lançamento: um pedido por dente. ponytail: em sequência, sem transação.
        for (const l of linhas) {
          if (!l.id) continue
          const antes = g.find((i) => i.id === l.id)!
          const n = normal(l)
          if (l.sai) await api.delete(`/prontuario/fichas/itens/${l.id}`)
          else if (!l.travada && (n.dente !== antes.dente || n.faces !== antes.faces))
            await api.patch(`/prontuario/fichas/itens/${l.id}`, { ...n, status })
          else if (status !== antes.status)
            await api.patch(`/prontuario/fichas/itens/${l.id}`, { status })
        }
        if (novas.length) await lote(nomes, novas, status)
        return novas.length
      }
      // ponytail: um pedido por grupo, sem transação; se um falhar, o que já foi salvo sai da tela.
      let n = 0
      if (nomes.length) {
        n += (await lote(nomes, novas, status)).data.criados
        setParcial(true)
        setProcedimentos([''])
        setLinhas([{ dente: '', faces: '' }])
      }
      for (const [k, t] of trazidos.entries()) {
        try {
          n += (await lote([t.nome], t.dentes, t.status)).data.criados
          setParcial(true)
        } catch (e) {
          setTrazidos(trazidos.slice(k))
          throw e
        }
      }
      return n
    },
    onSuccess: (n) => {
      avisar(
        g
          ? enviado && n
            ? 'Salvo: os dentes novos vão no próximo pedido de assinatura'
            : 'Procedimento atualizado'
          : n === 1
            ? 'Procedimento adicionado'
            : `${n} procedimentos adicionados`,
      )
      props.aoTerminar(true)
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })

  const colunaPrincipal = (
    <div className="min-w-0 space-y-6">
      <Passo
        n={1}
        id="passo-procedimento"
        titulo={nomes.length > 1 ? `Procedimentos (${nomes.length})` : 'Procedimento'}
        feito={!!nomes.length}
        extra={
          !g && (
            <button
              type="button"
              className="botao-fantasma botao-pequeno"
              onClick={() => setProcedimentos([...procedimentos, ''])}
            >
              + Outro procedimento
            </button>
          )
        }
      >
        {g ? (
          <div className="space-y-2">
            <input
              className="campo font-bold"
              aria-labelledby="passo-procedimento"
              value={g[0].procedimento}
              readOnly
            />
            {enviado && (
              <p className="alerta-info">
                Enviado ao paciente: os dentes enviados não mudam. Dá para mudar a situação e
                acrescentar dentes, que vão no próximo pedido de assinatura.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {procedimentos.map((p, k) => (
              <div key={k} className="flex items-center gap-2">
                <div className="flex-1">
                  <LinhaProcedimento
                    rotulo={`Procedimento ${k + 1}`}
                    valor={p}
                    autoFocus={k === procedimentos.length - 1}
                    aoMudar={(v) =>
                      setProcedimentos(procedimentos.map((x, j) => (j === k ? v : x)))
                    }
                  />
                </div>
                {procedimentos.length > 1 && (
                  <button
                    type="button"
                    className="botao-leve botao-icone inline-grid place-items-center text-perigo"
                    aria-label={`Tirar ${p || `o procedimento ${k + 1}`}`}
                    title="Tirar"
                    onClick={() => setProcedimentos(procedimentos.filter((_, j) => j !== k))}
                  >
                    <Icone nome="fechar" className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            <p className="ajuda">
              {nomes.length > 1
                ? 'Cada procedimento vai em todos os dentes marcados abaixo.'
                : 'Escreva livremente ou escolha um procedimento já cadastrado na tabela da clínica. Opcional se trouxer do odontograma.'}
            </p>
          </div>
        )}
      </Passo>

      <Passo n={2} id="passo-situacao" titulo="Situação" feito={!!nomes.length}>
        <EscolhaSituacao rotulo="Situação" nome="situacao" valor={status} aoMudar={setStatus} />
      </Passo>

      <Passo
        n={3}
        id="passo-dentes"
        titulo="Dentes e faces"
        feito={(temDente && !denteInvalido) || soTrazidos}
      >
        <LinhasDentes
          pacienteId={props.paciente.id}
          rotulo={
            marcados.size
              ? `${marcados.size} ${marcados.size === 1 ? 'dente marcado' : 'dentes marcados'}`
              : 'Nenhum dente marcado'
          }
          linhas={linhas}
          aoMudar={setLinhas}
          dentes={dentesDaDenticao}
          atalhos={
            <div className="my-2 space-y-2 rounded-xl bg-superficie-2 p-3">
              <LinhaAtalhos rotulo="Dentição">
                <div role="radiogroup" aria-label="Dentição" className="contents">
                  {(
                    [
                      ['PERMANENTE', 'Permanente'],
                      ['DECIDUA', 'Decídua'],
                      ['MISTA', 'Mista (odontograma)'],
                    ] as const
                  )
                    .filter(([v]) => v !== 'MISTA' || den.mista.length)
                    .map(([v, rotulo]) => (
                      <button
                        key={v}
                        type="button"
                        role="radio"
                        aria-checked={denticao === v}
                        onClick={() => setDenticao(v)}
                        className={PILULA}
                      >
                        {rotulo}
                      </button>
                    ))}
                </div>
              </LinhaAtalhos>
              <LinhaAtalhos rotulo="Marcar">{pilulasMarcar(atalhos.marcas)}</LinhaAtalhos>
              <LinhaAtalhos rotulo="Quadrantes">
                {/* Os quatro numa linha só (tela cheia). */}
                <div className="grid flex-1 grid-cols-2 gap-1.5 md:grid-cols-4 [&>button]:justify-center [&>button]:px-2 [&>button]:whitespace-nowrap">
                  {pilulasMarcar(atalhos.quadrantes)}
                </div>
              </LinhaAtalhos>
            </div>
          }
        />
      </Passo>
    </div>
  )

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault()
        salvar.mutate()
      }}
    >
      {g ? (
        colunaPrincipal
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          {colunaPrincipal}
          <section
            aria-labelledby="passo-odontograma"
            className="relative min-w-0 lg:border-l lg:border-borda"
          >
            {/* Na tela larga a altura vem da coluna principal; só a lista rola. */}
            <div className="flex flex-col lg:absolute lg:inset-0 lg:pl-6">
              <div className="mb-1 flex items-center justify-between gap-2">
                <h3 id="passo-odontograma" className="flex items-center gap-2 font-bold">
                  <span
                    aria-hidden
                    className="grid size-6 place-items-center rounded-full bg-primaria-clara text-primaria"
                  >
                    <Icone nome="dente" className="h-3.5 w-3.5" />
                  </span>
                  Já cadastrados
                </h3>
                {!!trazidos.length && (
                  <span className="etiqueta">
                    {trazidos.length} {trazidos.length === 1 ? 'escolhido' : 'escolhidos'}
                  </span>
                )}
              </div>
              <p className="ajuda mb-3">
                Procedimentos do odontograma deste paciente. Escolha quantos quiser: cada um entra
                com os dentes dele e a situação que você marcar.
              </p>
              {odontograma.isPending ? (
                <p className="text-sm text-suave">Carregando…</p>
              ) : !doOdontograma.length ? (
                <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-borda px-4 py-8 text-center text-suave">
                  <Icone nome="dente" className="h-7 w-7" />
                  <p className="text-sm">Nenhum procedimento com dente no odontograma.</p>
                </div>
              ) : (
                <ul className="min-h-0 flex-1 space-y-2 lg:overflow-y-auto lg:pr-1">
                  {doOdontograma.map((x) => {
                    const chave = chaveDe(x)
                    const t = trazidos.find((t) => t.chave === chave)
                    if (t)
                      return (
                        <CartaoTrazido
                          key={chave}
                          t={t}
                          origem={x[0]}
                          dentes={dentesDaDenticao}
                          removidos={removidos}
                          aoMudar={(n) =>
                            setTrazidos(
                              n
                                ? trazidos.map((y) => (y.chave === chave ? n : y))
                                : trazidos.filter((y) => y.chave !== chave),
                            )
                          }
                        />
                      )
                    const { rotulo, cor } = STATUS[x[0].status]
                    return (
                      <li key={chave}>
                        <button
                          type="button"
                          onClick={() => trazer(x)}
                          className="group flex w-full items-center gap-3 rounded-xl border-2 border-borda bg-superficie px-3 py-2 text-left transition hover:border-primaria/50 hover:bg-primaria-clara/40"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold text-titulo">
                              {x[0].nome}
                            </span>
                            <span className="flex items-center gap-1.5 text-xs text-suave">
                              <span
                                className="size-2 shrink-0 rounded-full"
                                style={{ background: cor }}
                              />
                              <span className="truncate">
                                {rotulo} · {dentesDoGrupo(x).join(', ')}
                              </span>
                            </span>
                          </span>
                          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primaria-clara text-primaria transition group-hover:bg-primaria group-hover:text-sobre-primaria">
                            <Icone nome="mais" className="h-4 w-4" />
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </section>
        </div>
      )}

      <Passo
        n={4}
        id="passo-data"
        titulo={g ? 'Data e observação' : 'Data e observação (para todos)'}
        feito={!!data}
      >
        {g ? (
          // Os dentes novos entram no mesmo lançamento: mesma data e observação.
          <p className="text-sm text-suave">
            Data: <strong className="text-texto">{dataBR(g[0].data) || 'sem data'}</strong>
            {g[0].observacao && (
              <>
                {' '}
                · Observação: <span className="text-texto">{g[0].observacao}</span>
              </>
            )}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-[200px_minmax(0,1fr)]">
            <label className="block">
              <span className="rotulo">Data</span>
              <CampoData value={data} onChange={setData} />
            </label>
            <CampoObservacao
              rotulo="Observação"
              ajuda="Vale para todos os procedimentos e dentes adicionados agora."
              valor={observacao}
              aoMudar={setObservacao}
            />
          </div>
        )}
      </Passo>

      <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-borda pt-4">
        <p
          className={`mr-auto text-sm ${pendencia ? 'text-suave' : 'font-bold text-titulo'}`}
          aria-live="polite"
        >
          {pendencia ||
            (!g && `${total} ${total === 1 ? 'procedimento' : 'procedimentos'} (um por dente)`)}
        </p>
        <button type="button" className="botao-leve" onClick={() => props.aoTerminar(parcial)}>
          Cancelar
        </button>
        <button className="botao" disabled={!!pendencia || salvar.isPending}>
          {salvar.isPending
            ? 'Salvando…'
            : g
              ? 'Salvar'
              : total > 1
                ? `Adicionar ${total}`
                : 'Adicionar'}
        </button>
      </footer>
    </form>
  )
}
