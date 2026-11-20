// Configurações da clínica (S-014).
import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { api, consultaConfig, consultaEu, dataBR, mensagemDeErro } from '../api'
import { avisar } from '../estado'
import { Abas } from '../componentes/Abas'
import { CampoReais } from '../componentes/CampoReais'
import { FimDaLista, useAosPoucos } from '../componentes/CarregarMais'
import { UNIDADES_PRAZO } from '../../../shared/dtos'
import { Dialogo } from '../componentes/Dialogo'
import { confirmar } from '../componentes/Confirmar'
import { Icone } from '../componentes/Icones'
import { reais } from '../../../shared/financeiro'
import { TIPO_PROCEDIMENTO, tipoProcedimento } from '../../../shared/orcamentos'
import { normalizar, REGIMES_TRIBUTARIOS } from '../../../shared/regras'
import {
  MODELOS_DOCUMENTO,
  preencherModelo,
  TIPOS_PERGUNTA,
  type Pergunta,
  type TipoPergunta,
} from '../../../shared/prontuario'
import {
  EMITENTE_VAZIO,
  VARIAVEIS_MENSAGEM,
  type ChaveConfig,
  type Emitente,
  type Emitentes,
  type DadosClinica,
  type DocumentoPadrao,
  type Laboratorio,
  type ModeloAnamnese,
} from '../../../shared/configuracoes'
import { CampoSelect } from '../componentes/CampoSelect'
import { GradeSemana } from '../componentes/GradeSemana'
import { CampoEspecialidade } from './Profissionais'
import { Situacao } from './Pacientes'
import { CampoCnpj, CampoCpf, CampoEmail } from '../componentes/CampoMascara'
import { CamposEndereco } from '../componentes/NotaFiscal'
import { FolhaTimbrada } from '../componentes/FolhaTimbrada'
import { ETAPAS, type Etapa } from '../../../shared/protetico'
import { Importacao } from './Importacao'
import {
  ACOES,
  COR_PERFIL,
  MATRIZ_PADRAO,
  MODULOS,
  PERFIS,
  pode,
  type Acao,
  type Matriz,
  type Perfil,
} from '../../../shared/permissoes'

// Ordem: a clínica; o que é cadastrado antes (especialidades → procedimentos → laboratórios);
// o atendimento (anamnese → documentos); a comunicação.
export const ABAS = [
  { id: 'clinica', rotulo: 'Clínica', acao: 'configuracao.clinica' },
  { id: 'horarios', rotulo: 'Horários de atendimento', acao: 'configuracao.horarios' },
  { id: 'especialidades', rotulo: 'Especialidades', acao: 'configuracao.especialidades' },
  { id: 'procedimentos', rotulo: 'Procedimentos e preços', acao: 'configuracao.procedimentos' },
  { id: 'laboratorios', rotulo: 'Laboratórios', acao: 'configuracao.laboratorios' },
  { id: 'anamnese', rotulo: 'Anamnese', acao: 'configuracao.anamnese' },
  { id: 'documentos', rotulo: 'Modelos de documento', acao: 'configuracao.documentos' },
  { id: 'mensagens', rotulo: 'E-mail e mensagens', acao: 'configuracao.mensagens' },
  { id: 'permissoes', rotulo: 'Permissões', acao: 'configuracao.permissoes' },
  { id: 'importacao', rotulo: 'Importar dados', acao: 'dados.importar' },
  { id: 'logs', rotulo: 'Logs', acao: 'configuracao.logs' },
] as const satisfies readonly { id: string; rotulo: string; acao: Acao }[]

/** Lista longa rola dentro do cartão, não a página (cabeçalho e abas ficam à vista). */
// Rolagem própria só no computador; no celular a lista rola com a página (RESPONSIVIDADE, regra 4).
const ROLAGEM = 'lg:max-h-[calc(100dvh-19rem)] lg:min-h-40 lg:overflow-y-auto'
type Aba = (typeof ABAS)[number]['id']

export function Configuracoes() {
  const { aba: daUrl } = useSearch({ from: '/logado/configuracoes' })
  const navegar = useNavigate({ from: '/configuracoes' })
  const { data: eu } = useSuspenseQuery(consultaEu)
  const abas = ABAS.filter((a) => pode(eu.perfis, a.acao))
  if (!abas.length) return <p className="text-suave">Nenhuma aba de Configurações liberada.</p>
  const aba = (abas.find((a) => a.id === daUrl) ?? abas[0]).id as Aba
  return (
    <div className="space-y-5">
      <header>
        <h1 className="titulo">Configurações</h1>
        <p className="subtitulo">Dados da clínica, tabelas e modelos usados no dia a dia.</p>
      </header>
      <Abas
        abas={abas}
        atual={aba}
        aoTrocar={(a) =>
          navegar({ search: { aba: a === abas[0].id ? undefined : a }, replace: true })
        }
      />
      {aba === 'clinica' && (
        // Clínica estreita à esquerda, emitente largo à direita; sem espaço, empilha.
        <div className="flex flex-wrap items-start gap-5">
          <Clinica />
          <Emitentes />
        </div>
      )}
      {aba === 'horarios' && <Horarios />}
      {aba === 'procedimentos' && <Procedimentos />}
      {aba === 'laboratorios' && <Laboratorios />}
      {aba === 'anamnese' && <ModelosAnamnese />}
      {aba === 'documentos' && <ModelosDocumento />}
      {aba === 'especialidades' && <Especialidades />}
      {aba === 'mensagens' && <Mensagens />}
      {aba === 'permissoes' && <Permissoes />}
      {aba === 'importacao' && <Importacao />}
      {aba === 'logs' && <Logs />}
    </div>
  )
}

/** Grava uma configuração e atualiza quem a usa. */
function useSalvar<C extends ChaveConfig>(chave: C, aviso = 'Configuração salva') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (valor: unknown) => (await api.put(`/configuracoes/${chave}`, valor)).data,
    onSuccess: (dados) => {
      qc.setQueryData(['config', chave], dados)
      avisar(aviso)
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
}

// ── Peças comuns das abas ───────────────────────────────────────────────────

/** Cartão de uma aba: cabeçalho com título, explicação e ação; o corpo vem em children. */
function Secao(props: {
  titulo: string
  descricao?: ReactNode
  acao?: ReactNode
  /** Corpo sem margem, para tabelas e listas que vão de borda a borda. */
  colado?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <section className={`cartao overflow-hidden p-0 ${props.className ?? ''}`}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-borda px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-lg">{props.titulo}</h2>
          {props.descricao && <p className="text-suave">{props.descricao}</p>}
        </div>
        {props.acao}
      </header>
      {/* flex: quando o cartão tem altura limitada, o corpo encolhe e a tabela rola por dentro. */}
      <div className={props.colado ? 'flex min-h-0 flex-1 flex-col' : 'space-y-4 p-5'}>
        {props.children}
      </div>
    </section>
  )
}

/** Rodapé de formulário: Cancelar (quando há) e o botão de enviar. */
function Rodape(props: {
  ocupado: boolean
  texto?: string
  aoCancelar?: () => void
  desativado?: boolean
  children?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-borda pt-4">
      {props.children}
      {props.aoCancelar && (
        <button type="button" className="botao-leve" onClick={props.aoCancelar}>
          Cancelar
        </button>
      )}
      <button className="botao" disabled={props.ocupado || props.desativado}>
        {props.ocupado ? 'Salvando…' : (props.texto ?? 'Salvar')}
      </button>
    </div>
  )
}

function Vazio(props: {
  icone: Parameters<typeof Icone>[0]['nome']
  titulo: string
  texto?: string
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-primaria-clara text-primaria">
        <Icone nome={props.icone} className="h-6 w-6" />
      </span>
      <p className="font-bold text-titulo">{props.titulo}</p>
      {props.texto && <p className="text-suave">{props.texto}</p>}
    </div>
  )
}

const Carregando = () => <p className="cartao text-suave">Carregando…</p>

function CampoBusca(props: { valor: string; aoMudar: (v: string) => void; rotulo: string }) {
  return (
    <label className="relative block w-full max-w-sm">
      <Icone
        nome="busca"
        className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-suave"
      />
      <input
        className="campo pl-9"
        placeholder={props.rotulo}
        aria-label={props.rotulo}
        value={props.valor}
        onChange={(e) => props.aoMudar(e.target.value)}
      />
    </label>
  )
}

/** Variáveis de um modelo, como etiquetas. */
function Variaveis({ nomes }: { nomes: readonly string[] }) {
  return (
    <span className="inline-flex flex-wrap gap-1 align-middle">
      {nomes.map((v) => (
        <code key={v} className="etiqueta font-mono">
          {`{${v}}`}
        </code>
      ))}
    </span>
  )
}

const TH = 'px-4 py-2.5 text-xs font-bold tracking-wide text-suave uppercase'

// ── Clínica ─────────────────────────────────────────────────────────────────
function Clinica() {
  const c = useQuery(consultaConfig('clinica'))
  const salvar = useSalvar('clinica', 'Dados da clínica salvos')
  if (!c.data) return <Carregando />
  const campo = (nome: keyof DadosClinica, rotulo: string, extra = {}) => (
    <label>
      <span className="rotulo">{rotulo}</span>
      <input name={nome} className="campo" defaultValue={c.data[nome]} {...extra} />
    </label>
  )
  return (
    <Secao
      titulo="Dados da clínica"
      descricao="Aparecem nos documentos, recibos e e-mails ao paciente."
      className="min-w-0 flex-[1_1_20rem] xl:max-w-md"
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          salvar.mutate(Object.fromEntries(new FormData(e.currentTarget)))
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          {campo('nome', 'Nome da clínica *', { required: true })}
          {campo('cnpj', 'CNPJ')}
          {campo('endereco', 'Endereço')}
          <label>
            <span className="rotulo">Cidade</span>
            <input name="cidade" className="campo" defaultValue={c.data.cidade} />
            <span className="ajuda">Vai na data dos documentos.</span>
          </label>
          {campo('telefone', 'Telefone')}
          {campo('email', 'E-mail de contato', { type: 'email' })}
        </div>
        <Rodape ocupado={salvar.isPending} />
      </form>
    </Secao>
  )
}

// ── Emitente da nota fiscal ─────────────────────────────────────────────────
function Emitentes() {
  const c = useQuery(consultaConfig('emitentes'))
  if (!c.data) return <Carregando />
  return <EditorEmitentes inicial={c.data} />
}

/**
 * Perfis do emitente: cada mudança de dados pode virar um perfil novo (o antigo fica salvo).
 * O perfil novo começa com os dados do atual; "Limpar tudo" esvazia os campos.
 */
function EditorEmitentes({ inicial }: { inicial: Emitentes }) {
  const salvar = useSalvar('emitentes', 'Dados do emitente salvos')
  const [perfis, setPerfis] = useState<Emitente[]>(
    inicial.perfis.length ? inicial.perfis : [{ ...EMITENTE_VAZIO, perfil: 'Principal' }],
  )
  const [ativo, setAtivo] = useState(inicial.ativo)
  const [sel, setSel] = useState(Math.min(inicial.ativo, perfis.length - 1))
  // Trocar de perfil, criar ou limpar remonta os campos com os valores novos.
  const [versao, setVersao] = useState(0)
  const [tipo, setTipo] = useState(perfis[sel].tipo)
  const form = useRef<HTMLFormElement>(null)
  const atual = perfis[sel]

  /** O que está digitado agora no perfil escolhido. */
  const lido = (): Emitente => ({
    ...EMITENTE_VAZIO,
    ...(Object.fromEntries(new FormData(form.current!)) as Partial<Emitente>),
    tipo,
  })
  function mostrar(lista: Emitente[], i: number) {
    setPerfis(lista)
    setSel(i)
    setTipo(lista[i].tipo)
    setVersao((v) => v + 1)
  }
  const comAtual = () => perfis.map((p, i) => (i === sel ? lido() : p))

  function novo() {
    const lista = comAtual()
    let n = lista.length + 1
    while (lista.some((p) => p.perfil === `Perfil ${n}`)) n++
    mostrar([...lista, { ...lido(), perfil: `Perfil ${n}` }], lista.length)
  }
  async function limpar() {
    if (
      !(await confirmar(
        `Esvaziar todos os campos do perfil "${atual.perfil}"? Nada é apagado até você salvar.`,
        { titulo: 'Limpar tudo?', botao: 'Limpar tudo' },
      ))
    )
      return
    const lista = comAtual()
    lista[sel] = { ...EMITENTE_VAZIO, perfil: lista[sel].perfil, tipo }
    mostrar(lista, sel)
  }
  async function excluir() {
    if (!(await confirmar(`Excluir o perfil "${atual.perfil}"? Os outros continuam salvos.`)))
      return
    const lista = comAtual().filter((_, i) => i !== sel)
    const novoAtivo = ativo === sel ? 0 : ativo > sel ? ativo - 1 : ativo
    setAtivo(novoAtivo)
    mostrar(lista, Math.min(sel, lista.length - 1))
    salvar.mutate({ ativo: novoAtivo, perfis: lista })
  }

  const campo = (nome: keyof Emitente, rotulo: string, extra = {}) => (
    <label className="block">
      <span className="rotulo">{rotulo}</span>
      <input name={nome} className="campo" defaultValue={atual[nome]} {...extra} />
    </label>
  )

  return (
    <Secao
      titulo="Emitente da nota fiscal"
      descricao="Cada perfil guarda um conjunto de dados; só um vai nas notas. Mudou algo? Crie um perfil novo: o antigo fica salvo."
      className="min-w-0 flex-[999_1_36rem]"
      colado
    >
      <div className="grid md:grid-cols-[15rem_minmax(0,1fr)]">
        <aside
          aria-label="Perfis do emitente"
          className="flex flex-col gap-1.5 border-b border-borda bg-superficie-2 p-4 md:border-r md:border-b-0"
        >
          {perfis.map((p, i) => (
            <button
              key={i}
              type="button"
              aria-pressed={i === sel}
              onClick={() => i !== sel && mostrar(comAtual(), i)}
              className={`min-h-11 rounded-lg border px-3.5 py-2.5 text-left ${
                i === sel
                  ? 'border-primaria bg-superficie'
                  : 'border-transparent hover:bg-superficie'
              }`}
            >
              <span className="block font-bold break-words text-titulo">
                {p.perfil || '(sem nome)'}
              </span>
              {i === ativo && (
                <span className="etiqueta etiqueta-sucesso mt-1">Em uso nas notas</span>
              )}
            </button>
          ))}
          <button type="button" className="botao-leve mt-2 w-full" onClick={novo}>
            <Icone nome="mais" className="h-4 w-4" /> Novo perfil
          </button>
        </aside>

        <form
          ref={form}
          key={versao}
          // @container: com espaço, os campos dividem a linha e o bloco cabe na tela sem rolar.
          className="@container min-w-0 space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault()
            if (!e.currentTarget.checkValidity()) {
              e.currentTarget.querySelector<HTMLInputElement>(':invalid')?.focus()
              return
            }
            const lista = comAtual()
            setPerfis(lista)
            salvar.mutate({ ativo, perfis: lista })
          }}
          noValidate
        >
          <div className="grid gap-4 @xl:grid-cols-2">
            {campo('perfil', 'Nome do perfil *', { required: true, maxLength: 60 })}
            <fieldset>
              <legend className="rotulo mb-1">Emite como</legend>
              <div className="flex flex-wrap gap-x-5">
                {(
                  [
                    ['PJ', 'Empresa (CNPJ)'],
                    ['PF', 'Pessoa física (CPF)'],
                  ] as const
                ).map(([v, r]) => (
                  <label key={v} className="flex min-h-11 items-center gap-2">
                    <input type="radio" checked={tipo === v} onChange={() => setTipo(v)} />
                    {r}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 @xl:grid-cols-6">
            <div className="sm:col-span-2 @xl:col-span-4">
              {campo('razaoSocial', tipo === 'PJ' ? 'Razão social *' : 'Nome completo *', {
                required: true,
                maxLength: 150,
              })}
            </div>
            {/* key: trocar CNPJ ↔ CPF começa o campo de novo, com a máscara certa. */}
            <label className="block @xl:col-span-2" key={tipo}>
              <span className="rotulo">{tipo === 'PJ' ? 'CNPJ' : 'CPF'}</span>
              {tipo === 'PJ' ? (
                <CampoCnpj
                  name="documento"
                  defaultValue={atual.tipo === 'PJ' ? atual.documento : ''}
                />
              ) : (
                <CampoCpf
                  name="documento"
                  defaultValue={atual.tipo === 'PF' ? atual.documento : ''}
                />
              )}
            </label>
            {tipo === 'PJ' && (
              <div className="@xl:col-span-2">
                {campo('inscricaoEstadual', 'Inscrição estadual', {
                  maxLength: 20,
                  placeholder: 'Vazio se for isenta',
                })}
              </div>
            )}
            <label
              className={`block sm:col-span-2 ${tipo === 'PJ' ? '@xl:col-span-4' : '@xl:col-span-6'}`}
            >
              <span className="rotulo">Regime tributário</span>
              <select name="regime" className="campo" defaultValue={atual.regime}>
                <option value="">Escolha…</option>
                {Object.entries(REGIMES_TRIBUTARIOS).map(([v, r]) => (
                  <option key={v} value={v}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <CamposEndereco valores={atual} />
          <Rodape ocupado={salvar.isPending}>
            <button type="button" className="botao-fantasma" onClick={limpar}>
              Limpar tudo
            </button>
            {perfis.length > 1 && (
              <button type="button" className="botao-fantasma text-perigo" onClick={excluir}>
                Excluir perfil
              </button>
            )}
            <span className="mr-auto" />
            {sel !== ativo && (
              <button
                type="button"
                className="botao-leve"
                onClick={() => {
                  const lista = comAtual()
                  setPerfis(lista)
                  setAtivo(sel)
                  salvar.mutate({ ativo: sel, perfis: lista })
                }}
              >
                Usar nas notas
              </button>
            )}
          </Rodape>
        </form>
      </div>
    </Secao>
  )
}

// ── Procedimentos e preços ──────────────────────────────────────────────────
interface Procedimento {
  id: number
  nome: string
  especialidade: string | null
  valorCentavos: number
  valorCriancaCentavos: number | null
  valorAdultoCentavos: number | null
  beneficios: string | null
  retornos: number | null
  alertaRetorno: number | null
  alertaRetornoUnidade: keyof typeof UNIDADES_PRAZO | null
  porDente: boolean
  ativo: boolean
}

/** "3 retornos · alerta em 6 meses", para a lista; vazio quando não tem nenhum dos dois. */
function textoRetornos(p: Procedimento) {
  const partes = []
  if (p.retornos) partes.push(`${p.retornos} ${p.retornos === 1 ? 'retorno' : 'retornos'}`)
  if (p.alertaRetorno && p.alertaRetornoUnidade) {
    const um = p.alertaRetornoUnidade === 'DIAS' ? 'dia' : 'mês'
    const unidade = p.alertaRetorno === 1 ? um : UNIDADES_PRAZO[p.alertaRetornoUnidade]
    partes.push(`alerta em ${p.alertaRetorno} ${unidade}`)
  }
  return partes.join(' · ')
}

/** Até que idade vale o preço de criança da tabela; grava ao sair do campo. */
function IdadeCrianca() {
  const c = useQuery(consultaConfig('faixaEtaria'))
  const salvar = useSalvar('faixaEtaria', 'Idade de criança salva')
  if (!c.data) return null
  return (
    <label className="flex items-center gap-2 text-sm font-bold text-suave">
      Criança até
      <input
        key={c.data.criancaAte}
        type="number"
        inputMode="numeric"
        min={1}
        max={18}
        className="campo w-20 text-center"
        defaultValue={c.data.criancaAte}
        aria-label="Idade máxima para ser considerado criança"
        onBlur={(e) => {
          const criancaAte = Number(e.currentTarget.value)
          if (criancaAte !== c.data.criancaAte) salvar.mutate({ criancaAte })
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      anos
    </label>
  )
}

/** Preço de uma faixa etária; sem preço, o procedimento não se faz nela. */
function PrecoFaixa({ valor }: { valor: number | null }) {
  return valor === null ? (
    <span className="text-suave">
      —<span className="sr-only">não se faz</span>
    </span>
  ) : (
    <span className="font-bold tabular-nums">{reais(valor)}</span>
  )
}

function Procedimentos() {
  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState<'todos' | 'porDente' | 'completo'>('todos')
  const [editando, setEditando] = useState<Procedimento | 'novo' | null>(null)
  const lista = useQuery({
    queryKey: ['procedimentos-tabela-completa'],
    queryFn: async () =>
      (await api.get<Procedimento[]>('/procedimentos', { params: { todos: 1 } })).data,
  })
  const visiveis = (lista.data ?? []).filter(
    (p) =>
      normalizar(p.nome).includes(normalizar(busca)) &&
      (tipo === 'todos' || (tipo === 'porDente') === p.porDente),
  )
  const { itens, proximo } = useAosPoucos(visiveis, `${busca}|${tipo}`)
  const editar = (p: Procedimento, classe: string) => (
    <button className={`botao-fantasma ${classe}`} onClick={() => setEditando(p)}>
      <Icone nome="lapis" className="h-4 w-4" />
      Editar
    </button>
  )
  return (
    <>
      <Secao
        titulo="Tabela de procedimentos"
        descricao="Mudar o preço vale para orçamentos novos; os já feitos guardam o valor da época."
        acao={
          <button className="botao" onClick={() => setEditando('novo')}>
            <Icone nome="mais" className="h-4 w-4" />
            Novo procedimento
          </button>
        }
        colado
        // Computador: o cartão ocupa o resto da tela (10,25rem = título + abas acima dele + margem
        // de baixo) e só a tabela rola. Celular: rola a página (RESPONSIVIDADE, regra 4).
        // mb-0: o Dialogo oculto vem depois e o space-y-5 daria 20 px de margem ao cartão.
        className="lg:mb-0 lg:flex lg:max-h-[calc(100dvh-11.25rem)] lg:flex-col"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borda px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <CampoBusca valor={busca} aoMudar={setBusca} rotulo="Buscar procedimento" />
            <div role="radiogroup" aria-label="Tipo de procedimento" className="flex gap-1.5">
              {(
                [
                  ['todos', 'Todos'],
                  ['porDente', TIPO_PROCEDIMENTO.porDente.rotulo],
                  ['completo', TIPO_PROCEDIMENTO.completo.rotulo],
                ] as const
              ).map(([v, rotulo]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={tipo === v}
                  onClick={() => setTipo(v)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-bold ${
                    tipo === v
                      ? 'border-primaria bg-primaria text-sobre-primaria'
                      : 'border-borda text-suave hover:text-texto'
                  }`}
                >
                  {rotulo}
                </button>
              ))}
            </div>
          </div>
          <IdadeCrianca />
        </div>
        {lista.isPending && <p className="px-4 py-10 text-center text-suave">Carregando…</p>}
        {lista.data && !visiveis.length ? (
          <Vazio
            icone="busca"
            titulo={busca ? 'Nenhum procedimento encontrado' : 'Nenhum procedimento cadastrado'}
            texto={busca ? 'Confira o nome ou limpe a busca.' : undefined}
          />
        ) : (
          <>
            {/* Celular: cartões; a tabela só a partir de md. */}
            <ul className="divide-y divide-borda md:hidden">
              {itens.map((p) => (
                <li key={p.id} className={`space-y-2 px-4 py-3 ${p.ativo ? '' : 'text-suave'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span
                      className={`min-w-0 font-bold break-words ${p.ativo ? 'text-titulo' : ''}`}
                    >
                      {p.nome}
                    </span>
                    <Situacao ativo={p.ativo} />
                  </div>
                  {p.beneficios && <p className="text-sm break-words">{p.beneficios}</p>}
                  {textoRetornos(p) && <p className="text-xs text-suave">{textoRetornos(p)}</p>}
                  <dl className="flex flex-wrap gap-x-6 gap-y-1">
                    <div>
                      <dt className="text-xs text-suave">Criança</dt>
                      <dd>
                        <PrecoFaixa valor={p.valorCriancaCentavos} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-suave">Adulto</dt>
                      <dd>
                        <PrecoFaixa valor={p.valorAdultoCentavos} />
                      </dd>
                    </div>
                  </dl>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <SeloTipoProcedimento porDente={p.porDente} />
                    {editar(p, '')}
                  </div>
                </li>
              ))}
            </ul>
            <div className="md:hidden">
              <FimDaLista aoVer={proximo} />
            </div>
            {/* relative: os textos sr-only das linhas ficam presos aqui, sem esticar a página. */}
            <div className="relative hidden overflow-x-auto md:block lg:min-h-40 lg:flex-1 lg:overflow-auto">
              <table className="w-full min-w-[46rem] text-left">
                <thead className="sticky top-0 z-10 bg-superficie shadow-[inset_0_-1px_0_var(--borda)]">
                  <tr>
                    <th className={TH}>Procedimento</th>
                    <th className={TH}>Especialidade</th>
                    <th className={TH}>Tipo</th>
                    <th className={`${TH} text-right`}>Criança</th>
                    <th className={`${TH} text-right`}>Adulto</th>
                    <th className={TH}>Situação</th>
                    <th className={TH}>
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((p) => (
                    <tr
                      key={p.id}
                      className={`border-b border-borda last:border-0 hover:bg-primaria-clara ${p.ativo ? '' : 'text-suave'}`}
                    >
                      <td className="px-4 py-2.5">
                        <span className={`font-bold ${p.ativo ? 'text-titulo' : ''}`}>
                          {p.nome}
                        </span>
                        {p.beneficios && (
                          <span className="block text-xs text-suave">{p.beneficios}</span>
                        )}
                        {textoRetornos(p) && (
                          <span className="block text-xs text-suave">{textoRetornos(p)}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">{p.especialidade ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <SeloTipoProcedimento porDente={p.porDente} />
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <PrecoFaixa valor={p.valorCriancaCentavos} />
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <PrecoFaixa valor={p.valorAdultoCentavos} />
                      </td>
                      <td className="px-4 py-2.5">
                        <Situacao ativo={p.ativo} />
                      </td>
                      <td className="px-4 py-2.5 text-right">{editar(p, 'botao-pequeno')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <FimDaLista aoVer={proximo} />
            </div>
          </>
        )}
      </Secao>
      <Dialogo
        aberto={!!editando}
        aoFechar={() => setEditando(null)}
        titulo={editando === 'novo' ? 'Novo procedimento' : 'Editar procedimento'}
      >
        {editando && (
          <FormProcedimento
            procedimento={editando === 'novo' ? undefined : editando}
            aoTerminar={() => setEditando(null)}
          />
        )}
      </Dialogo>
    </>
  )
}

/** Cadastro de procedimento da tabela (aqui e no orçamento, ao cadastrar um que falta). */
export function FormProcedimento(props: {
  procedimento?: Procedimento
  nomeInicial?: string
  /** Recebe o procedimento salvo; sem argumento quando cancela. */
  aoTerminar: (salvo?: Procedimento) => void
}) {
  const qc = useQueryClient()
  const p = props.procedimento
  // null = não se faz nessa faixa etária.
  const [crianca, setCrianca] = useState<number | null>(p ? p.valorCriancaCentavos : 0)
  const [adulto, setAdulto] = useState<number | null>(p ? p.valorAdultoCentavos : 0)
  const [porDente, setPorDente] = useState(p?.porDente ?? true)
  const [comAlerta, setComAlerta] = useState(!!p?.alertaRetorno)
  const salvar = useMutation({
    mutationFn: async (d: Record<string, unknown>) =>
      p
        ? (await api.put(`/procedimentos/${p.id}`, d)).data
        : (await api.post('/procedimentos', d)).data,
    onSuccess: (salvo: Procedimento) => {
      avisar('Procedimento salvo')
      qc.invalidateQueries({ queryKey: ['procedimentos-tabela-completa'] })
      qc.invalidateQueries({ queryKey: ['procedimentos-tabela'] })
      qc.invalidateQueries({ queryKey: ['procedimentos'] })
      props.aoTerminar(salvo)
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        const f = Object.fromEntries(new FormData(e.currentTarget))
        if (crianca === null && adulto === null)
          return avisar('Informe o valor de criança ou de adulto.', true)
        salvar.mutate({
          ...f,
          valorCriancaCentavos: crianca,
          valorAdultoCentavos: adulto,
          // Sem a caixa marcada, os campos do alerta nem vão no formulário: sem alerta.
          alertaRetorno: f.alertaRetorno ?? null,
          porDente,
          ativo: p ? f.ativo === 'on' : true,
        })
      }}
    >
      <label className="block">
        <span className="rotulo">Nome *</span>
        <input
          name="nome"
          className="campo"
          defaultValue={p?.nome ?? props.nomeInicial}
          required
          autoFocus
        />
      </label>
      <fieldset>
        <legend className="rotulo">Valor final *</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ['crianca', 'Criança', crianca, setCrianca],
              ['adulto', 'Adulto', adulto, setAdulto],
            ] as const
          ).map(([id, rotulo, v, mudar]) => (
            <div key={id} className="space-y-2 rounded-2xl bg-superficie-2 p-3">
              <label className="flex min-h-11 cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  className="check-sucesso"
                  checked={v !== null}
                  onChange={(e) => mudar(e.target.checked ? 0 : null)}
                />
                <span className="font-bold">Faz em {rotulo.toLowerCase()}</span>
              </label>
              {v !== null && (
                <CampoReais
                  id={`proc-valor-${id}`}
                  rotulo={`Valor ${rotulo.toLowerCase()}`}
                  rotuloOculto
                  valor={v}
                  aoMudar={mudar}
                />
              )}
            </div>
          ))}
        </div>
        <span className="ajuda">Preço cobrado do paciente em cada faixa etária.</span>
      </fieldset>
      <label className="block">
        <span className="rotulo">Benefícios</span>
        <textarea
          name="beneficios"
          className="campo"
          rows={2}
          maxLength={300}
          defaultValue={p?.beneficios ?? ''}
          placeholder="Ex.: 4 bisnagas + 2 sessões no consultório"
        />
        <span className="ajuda">O que está incluso no preço.</span>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="rotulo">Retornos inclusos</span>
          <input
            name="retornos"
            type="number"
            inputMode="numeric"
            min={0}
            max={99}
            className="campo"
            defaultValue={p?.retornos ?? ''}
            placeholder="0"
          />
          <span className="ajuda">Quantos retornos o paciente tem direito sem pagar.</span>
        </label>
        <div className="space-y-2 rounded-2xl bg-superficie-2 p-3">
          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              className="check-sucesso"
              checked={comAlerta}
              onChange={(e) => setComAlerta(e.target.checked)}
            />
            <span className="font-bold">Alerta de retorno</span>
          </label>
          {comAlerta && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-suave">Em</span>
              <input
                name="alertaRetorno"
                type="number"
                inputMode="numeric"
                min={1}
                max={999}
                required
                aria-label="Prazo do alerta de retorno"
                className="campo w-24"
                defaultValue={p?.alertaRetorno ?? ''}
              />
              <CampoSelect
                name="alertaRetornoUnidade"
                aria-label="Unidade do prazo"
                className="w-auto"
                defaultValue={p?.alertaRetornoUnidade ?? 'MESES'}
                vazio={false}
                opcoes={UNIDADES_PRAZO}
              />
            </div>
          )}
        </div>
      </div>
      <fieldset>
        <legend className="rotulo">Tipo de procedimento *</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              [
                true,
                tipoProcedimento(true).rotulo,
                'Feito dente a dente: o valor se multiplica pelos dentes marcados.',
              ],
              [
                false,
                tipoProcedimento(false).rotulo,
                'Cobra uma vez, com qualquer número de dentes, e já marca todos os dentes da dentição do paciente.',
              ],
            ] as const
          ).map(([v, rotulo, ajuda]) => (
            <label
              key={rotulo}
              className="flex cursor-pointer items-start gap-3 rounded-2xl bg-superficie-2 p-3"
            >
              <input
                type="radio"
                name="porDente"
                className="mt-1"
                checked={porDente === v}
                onChange={() => setPorDente(v)}
              />
              <span>
                <span className="block font-bold">{rotulo}</span>
                <span className="text-sm text-suave">{ajuda}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label className="rotulo" id="p-esp-rotulo">
          Especialidade
        </label>
        <CampoEspecialidade inicial={p?.especialidade ?? ''} naLinha />
      </div>
      {p && (
        <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-superficie-2 p-3">
          <input type="checkbox" name="ativo" className="check-sucesso" defaultChecked={p.ativo} />
          <span>
            <span className="block font-bold">Ativo</span>
            <span className="text-sm text-suave">Aparece para escolher nos orçamentos.</span>
          </span>
        </label>
      )}
      <Rodape ocupado={salvar.isPending} aoCancelar={() => props.aoTerminar()} />
    </form>
  )
}

// ── Laboratórios ────────────────────────────────────────────────────────────
/** Ordem de serviço do Controle Protético (só o que esta tela mostra). */
interface OrdemProtetica {
  id: number
  laboratorio: string
  trabalho: string
  etapa: Etapa
  valorCentavos: number
  criadoEm: string
  paciente: { nome: string }
}
const trabalhosTexto = (n: number) => (n === 1 ? '1 trabalho' : `${n} trabalhos`)

function Laboratorios() {
  const c = useQuery(consultaConfig('laboratorios'))
  // Mesma chave do quadro do Protético: a lista fica em cache para as duas telas.
  const ordens = useQuery({
    queryKey: ['protetico'],
    queryFn: async () => (await api.get<OrdemProtetica[]>('/protetico')).data,
  })
  const salvar = useSalvar('laboratorios', 'Laboratório salvo')
  const [aberto, setAberto] = useState<number | 'novo'>(0)
  if (!c.data) return <Carregando />
  const lista = c.data
  const atual = aberto === 'novo' || !lista.length ? null : (lista[aberto] ?? lista[0])
  const gravar = (nova: Laboratorio[], abrir: number) =>
    salvar.mutateAsync(nova).then(
      () => setAberto(abrir),
      () => {},
    )
  const ordensDe = (nome: string) =>
    (ordens.data ?? []).filter((o) => normalizar(o.laboratorio) === normalizar(nome))

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[18rem_1fr]">
      <Secao
        titulo="Laboratórios"
        acao={
          <button
            className="botao-leve botao-pequeno"
            onClick={() => setAberto('novo')}
            aria-pressed={!atual}
          >
            <Icone nome="mais" className="h-3.5 w-3.5" />
            Novo
          </button>
        }
        colado
      >
        {!lista.length && <Vazio icone="protetico" titulo="Nenhum laboratório" />}
        <ul className={`divide-y divide-borda ${ROLAGEM}`} aria-label="Laboratórios">
          {lista.map((l, i) => (
            <li key={l.nome}>
              <button
                className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-primaria-clara ${atual === l ? 'bg-primaria-clara' : ''}`}
                aria-current={atual === l}
                onClick={() => setAberto(i)}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-info/15 text-info">
                  <Icone nome="protetico" className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate font-bold ${atual === l ? 'text-primaria' : 'text-titulo'}`}
                  >
                    {l.nome}
                  </span>
                  <span className="block truncate text-xs text-suave">
                    {trabalhosTexto(l.trabalhos.length)} · {ordensDe(l.nome).length} OS
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Secao>

      <EditarLaboratorio
        key={atual ? atual.nome : 'novo'}
        laboratorio={atual}
        ordens={atual ? ordensDe(atual.nome) : []}
        salvando={salvar.isPending}
        aoCancelar={lista.length && !atual ? () => setAberto(0) : undefined}
        aoExcluir={
          atual
            ? async () =>
                (await confirmar(
                  `Excluir o laboratório "${atual.nome}" do cadastro? As ordens de serviço já feitas continuam no Protético.`,
                )) &&
                gravar(
                  lista.filter((l) => l !== atual),
                  0,
                )
            : undefined
        }
        aoSalvar={(l) =>
          atual
            ? gravar(
                lista.map((x) => (x === atual ? l : x)),
                lista.indexOf(atual),
              )
            : gravar([...lista, l], lista.length)
        }
      />
    </div>
  )
}

function EditarLaboratorio(props: {
  laboratorio: Laboratorio | null
  ordens: OrdemProtetica[]
  salvando: boolean
  aoSalvar: (l: Laboratorio) => void
  aoExcluir?: () => void
  aoCancelar?: () => void
}) {
  const l = props.laboratorio
  const [nome, setNome] = useState(l?.nome ?? '')
  const [contato, setContato] = useState(l?.contato ?? '')
  const [trabalhos, setTrabalhos] = useState(l?.trabalhos ?? [{ nome: '', valorCentavos: 0 }])
  const mudar = (i: number, d: Partial<Laboratorio['trabalhos'][number]>) =>
    setTrabalhos(trabalhos.map((t, k) => (k === i ? { ...t, ...d } : t)))
  const emAndamento = props.ordens.filter((o) => o.etapa !== 'INSTALADO').length

  return (
    <div className="space-y-5">
      <Secao
        titulo={l ? l.nome : 'Novo laboratório'}
        descricao="A tabela de trabalhos aparece no Controle Protético, já com o valor."
        acao={
          props.aoExcluir && (
            <button
              className="botao-fantasma botao-pequeno text-perigo hover:bg-perigo/10"
              onClick={props.aoExcluir}
            >
              <Icone nome="lixeira" className="h-4 w-4" />
              Excluir laboratório
            </button>
          )
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            props.aoSalvar({
              nome: nome.trim(),
              contato: contato.trim(),
              trabalhos: trabalhos.filter((t) => t.nome.trim()),
            })
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="rotulo">Nome *</span>
              <input
                className="campo"
                value={nome}
                maxLength={120}
                required
                autoFocus={!l}
                placeholder="Ex.: Laboratório Fictício"
                onChange={(e) => setNome(e.target.value)}
              />
            </label>
            <label>
              <span className="rotulo">Contato</span>
              <input
                className="campo"
                value={contato}
                maxLength={120}
                placeholder="Telefone, WhatsApp ou e-mail"
                onChange={(e) => setContato(e.target.value)}
              />
            </label>
          </div>

          <div className="overflow-hidden rounded-xl border border-borda">
            <div className="overflow-x-auto lg:max-h-[calc(100dvh-34rem)] lg:min-h-40 lg:overflow-auto">
              <table className="w-full min-w-[30rem] text-left">
                <thead className="sticky top-0 z-10 bg-superficie shadow-[inset_0_-1px_0_var(--borda)]">
                  <tr>
                    <th className={TH}>Trabalho</th>
                    <th className={`${TH} w-40 text-right`}>Valor</th>
                    <th className={`${TH} w-12`}>
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {trabalhos.map((t, i) => (
                    <tr key={i} className="border-b border-borda last:border-0">
                      <td className="px-3 py-2">
                        <input
                          className="campo"
                          value={t.nome}
                          maxLength={200}
                          aria-label={`Trabalho ${i + 1}`}
                          placeholder="Ex.: Coroa em porcelana"
                          onChange={(e) => mudar(i, { nome: e.target.value })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <CampoReais
                          id={`lab-valor-${i}`}
                          rotulo={`Valor do trabalho ${i + 1}`}
                          rotuloOculto
                          valor={t.valorCentavos}
                          aoMudar={(v) => mudar(i, { valorCentavos: v })}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          className="botao-fantasma botao-icone md:size-8 text-perigo hover:bg-perigo/10"
                          aria-label={`Remover trabalho ${i + 1}`}
                          title="Remover"
                          onClick={() => setTrabalhos(trabalhos.filter((_, k) => k !== i))}
                        >
                          <Icone nome="lixeira" className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!trabalhos.length && (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-suave">
                        Nenhum trabalho na tabela.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              className="botao-fantasma w-full rounded-none border-t border-borda"
              onClick={() => setTrabalhos([...trabalhos, { nome: '', valorCentavos: 0 }])}
            >
              <Icone nome="mais" className="h-4 w-4" />
              Adicionar trabalho
            </button>
          </div>
          <Rodape ocupado={props.salvando} aoCancelar={props.aoCancelar} />
        </form>
      </Secao>

      {l && (
        <Secao
          titulo="Ordens de serviço deste laboratório"
          descricao={
            props.ordens.length
              ? `${props.ordens.length} no Controle Protético · ${emAndamento} em andamento`
              : 'Nenhuma ordem de serviço com este laboratório ainda.'
          }
          acao={
            <Link to="/protetico" className="botao-leve botao-pequeno">
              <Icone nome="protetico" className="h-4 w-4" />
              Abrir Protético
            </Link>
          }
          colado
        >
          {props.ordens.length > 0 && (
            <ul className="divide-y divide-borda lg:max-h-72 lg:overflow-y-auto">
              {[...props.ordens]
                .sort((a, b) => b.id - a.id)
                .map((o) => (
                  <li
                    key={o.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold text-titulo">
                        {o.paciente.nome}
                      </span>
                      <span className="text-xs text-suave">
                        {o.trabalho} · {dataBR(o.criadoEm)}
                      </span>
                    </span>
                    <span className="tabular-nums">{reais(o.valorCentavos)}</span>
                    <span
                      className={`etiqueta ${o.etapa === 'INSTALADO' ? 'etiqueta-sucesso' : 'etiqueta-info'}`}
                    >
                      {ETAPAS[o.etapa]}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </Secao>
      )}
    </div>
  )
}

// ── Anamnese ────────────────────────────────────────────────────────────────
const PADRAO_ANAMNESE = 'Padrão da clínica'
const perguntasTexto = (n: number) => (n === 1 ? '1 pergunta' : `${n} perguntas`)

/** Modelos salvos: o padrão da clínica e os extras, cada um com nome. */
function ModelosAnamnese() {
  const padrao = useQuery(consultaConfig('anamnese'))
  const extras = useQuery(consultaConfig('modelosAnamnese'))
  const salvarPadrao = useSalvar('anamnese', 'Modelo padrão salvo')
  const salvarExtras = useSalvar('modelosAnamnese', 'Modelo salvo')
  // 0 = padrão; 1.. = extras; 'novo' = criando.
  const [aberto, setAberto] = useState<number | 'novo'>(0)
  if (!padrao.data || !extras.data) return <Carregando />
  const lista: ModeloAnamnese[] = [
    { nome: PADRAO_ANAMNESE, perguntas: padrao.data },
    ...extras.data,
  ]
  const atual = aberto === 'novo' ? null : (lista[aberto] ?? lista[0])

  // O erro já aparece no aviso do useSalvar.
  const gravarExtras = (nova: ModeloAnamnese[], abrir: number) =>
    salvarExtras.mutateAsync(nova).then(
      () => setAberto(abrir),
      () => {},
    )
  const excluir = async (i: number) => {
    if (
      !(await confirmar(`Excluir o modelo "${lista[i].nome}"? As anamneses já feitas não mudam.`))
    )
      return
    gravarExtras(
      extras.data.filter((_, k) => k !== i - 1),
      0,
    )
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[18rem_1fr]">
      <Secao
        titulo="Modelos salvos"
        acao={
          <button
            className="botao-leve botao-pequeno"
            onClick={() => setAberto('novo')}
            aria-pressed={aberto === 'novo'}
          >
            <Icone nome="mais" className="h-3.5 w-3.5" />
            Novo
          </button>
        }
        colado
      >
        <ul className={`divide-y divide-borda ${ROLAGEM}`} aria-label="Modelos de anamnese">
          {lista.map((m, i) => (
            <li key={m.nome}>
              <button
                className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-primaria-clara ${aberto === i ? 'bg-primaria-clara' : ''}`}
                aria-current={aberto === i}
                onClick={() => setAberto(i)}
              >
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-lg ${i ? 'bg-superficie-2 text-suave' : 'bg-primaria/15 text-primaria'}`}
                >
                  <Icone nome="documento" className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate font-bold ${aberto === i ? 'text-primaria' : 'text-titulo'}`}
                  >
                    {m.nome}
                  </span>
                  <span className="text-xs text-suave">{perguntasTexto(m.perguntas.length)}</span>
                </span>
                {!i && <span className="etiqueta etiqueta-primaria">Padrão</span>}
              </button>
            </li>
          ))}
        </ul>
      </Secao>

      <EditarModeloAnamnese
        key={aberto}
        modelo={atual}
        padrao={aberto === 0}
        salvando={salvarPadrao.isPending || salvarExtras.isPending}
        aoExcluir={typeof aberto === 'number' && aberto > 0 ? () => excluir(aberto) : undefined}
        aoCancelar={aberto === 'novo' ? () => setAberto(0) : undefined}
        aoSalvar={(nome, perguntas) => {
          if (aberto === 0) return salvarPadrao.mutate(perguntas)
          const novo = { nome, perguntas }
          if (aberto === 'novo') return gravarExtras([...extras.data, novo], lista.length)
          gravarExtras(
            extras.data.map((m, k) => (k === aberto - 1 ? novo : m)),
            aberto,
          )
        }}
      />
    </div>
  )
}

function EditarModeloAnamnese(props: {
  modelo: ModeloAnamnese | null
  padrao: boolean
  salvando: boolean
  aoSalvar: (nome: string, perguntas: Pergunta[]) => void
  aoExcluir?: () => void
  aoCancelar?: () => void
}) {
  const [nome, setNome] = useState(props.modelo?.nome ?? '')
  return (
    <Secao
      titulo={props.modelo ? props.modelo.nome : 'Novo modelo'}
      descricao={
        props.padrao
          ? 'Abre primeiro na anamnese nova. As já preenchidas guardam as perguntas da época.'
          : 'Escolhido na hora de fazer a anamnese do paciente.'
      }
      acao={
        props.aoExcluir && (
          <button
            className="botao-fantasma botao-pequeno text-perigo hover:bg-perigo/10"
            onClick={props.aoExcluir}
          >
            <Icone nome="lixeira" className="h-4 w-4" />
            Excluir modelo
          </button>
        )
      }
    >
      <EditorAnamnese
        inicial={props.modelo?.perguntas ?? [{ texto: '', tipo: 'SIM_NAO' }]}
        classeLista={`${props.padrao ? 'lg:max-h-[calc(100dvh-27rem)]' : 'lg:max-h-[calc(100dvh-32rem)]'} lg:min-h-40 lg:overflow-y-auto lg:pr-1`}
        salvando={props.salvando}
        aoSalvar={(perguntas) => props.aoSalvar(nome.trim(), perguntas)}
        aoCancelar={props.aoCancelar}
      >
        {!props.padrao && (
          <label className="block max-w-md">
            <span className="rotulo">Nome do modelo *</span>
            <input
              className="campo"
              value={nome}
              maxLength={80}
              required
              autoFocus={!props.modelo}
              placeholder="Ex.: Ortodontia, Infantil, Cirurgia"
              onChange={(e) => setNome(e.target.value)}
            />
          </label>
        )}
      </EditorAnamnese>
    </Secao>
  )
}

/** Editor das perguntas de um modelo de anamnese (aqui e na ficha, ao criar um modelo novo). */
export function EditorAnamnese(props: {
  inicial: Pergunta[]
  salvando: boolean
  aoSalvar: (perguntas: Pergunta[]) => void
  aoCancelar?: () => void
  children?: ReactNode
  /** Classe da lista de perguntas (ex.: altura máxima com rolagem própria). */
  classeLista?: string
}) {
  const [perguntas, setPerguntas] = useState(props.inicial)
  const mudar = (i: number, d: Partial<Pergunta>) =>
    setPerguntas(perguntas.map((p, k) => (k === i ? { ...p, ...d } : p)))
  const mover = (i: number, passo: number) => {
    const n = [...perguntas]
    ;[n[i], n[i + passo]] = [n[i + passo], n[i]]
    setPerguntas(n)
  }
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        props.aoSalvar(perguntas)
      }}
    >
      {props.children}
      <ol className={`space-y-2 ${props.classeLista ?? ''}`}>
        {perguntas.map((p, i) => (
          <li key={i} className="space-y-3 rounded-xl border border-borda bg-superficie p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-superficie-2 text-xs font-bold text-suave">
                {i + 1}
              </span>
              <input
                className="campo min-w-60 flex-1"
                value={p.texto}
                placeholder="Texto da pergunta"
                aria-label={`Pergunta ${i + 1}`}
                onChange={(e) => mudar(i, { texto: e.target.value })}
                required
              />
              <CampoSelect
                className="w-auto"
                value={p.tipo}
                aria-label={`Tipo da pergunta ${i + 1}`}
                onChange={(e) => mudar(i, { tipo: e.target.value as TipoPergunta })}
                vazio={false}
                opcoes={TIPOS_PERGUNTA}
              />
            </div>
            {p.tipo === 'OPCOES' && (
              <input
                className="campo"
                placeholder="Opções separadas por vírgula"
                aria-label={`Opções da pergunta ${i + 1}`}
                value={(p.opcoes ?? []).join(', ')}
                onChange={(e) =>
                  mudar(i, { opcoes: e.target.value.split(',').map((o) => o.trimStart()) })
                }
              />
            )}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pl-9">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!p.obrigatoria}
                  onChange={(e) => mudar(i, { obrigatoria: e.target.checked })}
                />
                Obrigatória
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="check-perigo"
                  checked={!!p.alerta}
                  onChange={(e) => mudar(i, { alerta: e.target.checked })}
                />
                Resposta vira alerta
              </label>
              <span className="flex-1" />
              <button
                type="button"
                className="botao-fantasma botao-icone md:size-8"
                disabled={!i}
                onClick={() => mover(i, -1)}
                aria-label={`Subir pergunta ${i + 1}`}
                title="Subir"
              >
                <Icone nome="direita" className="h-4 w-4 -rotate-90" />
              </button>
              <button
                type="button"
                className="botao-fantasma botao-icone md:size-8"
                disabled={i === perguntas.length - 1}
                onClick={() => mover(i, 1)}
                aria-label={`Descer pergunta ${i + 1}`}
                title="Descer"
              >
                <Icone nome="direita" className="h-4 w-4 rotate-90" />
              </button>
              <button
                type="button"
                className="botao-fantasma botao-icone md:size-8 text-perigo hover:bg-perigo/10"
                onClick={() => setPerguntas(perguntas.filter((_, k) => k !== i))}
                aria-label={`Remover pergunta ${i + 1}`}
                title="Remover"
              >
                <Icone nome="lixeira" className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="botao-leve w-full border-dashed"
        onClick={() => setPerguntas([...perguntas, { texto: '', tipo: 'SIM_NAO' }])}
      >
        <Icone nome="mais" className="h-4 w-4" />
        Adicionar pergunta
      </button>
      <Rodape
        ocupado={props.salvando}
        desativado={!perguntas.length}
        texto="Salvar modelo"
        aoCancelar={props.aoCancelar}
      />
    </form>
  )
}

// ── Modelos de documento ────────────────────────────────────────────────────
const VARIAVEIS_DOCUMENTO = [
  'paciente',
  'cpf',
  'rg',
  'profissional',
  'cro',
  'data',
  'cidade',
  'clinica',
]

type ModeloFixo = keyof typeof MODELOS_DOCUMENTO
const MODELOS_FIXOS = Object.keys(MODELOS_DOCUMENTO) as ModeloFixo[]
/** Campos que o profissional digita na hora, quando aparecem no texto. */
const VARIAVEIS_DIGITADAS = ['horario', 'fim', 'dias', 'cid', 'servico']
const TEXTO_NOVO = '\n\n{cidade}, {data}.\n\n\n{profissional}\n{cro}'

/** Texto do modelo com dados de exemplo, para a prévia (nada de paciente de verdade). */
function useExemplo() {
  const clinica = useQuery(consultaConfig('clinica')).data
  return (texto: string) =>
    preencherModelo(texto, {
      paciente: 'Maria Exemplo da Silva',
      cpf: '000.000.000-00',
      rg: '00.000.000',
      profissional: 'Dr(a). Nome do Dentista',
      cro: 'CRO 00000',
      data: dataBR(new Date().toISOString()),
      cidade: clinica?.cidade || 'Cidade',
      clinica: clinica?.nome,
      horario: '14:00',
      fim: '15:00',
      dias: '2 dias',
      cid: 'K08.8',
      servico: 'limpeza',
    })
}

/** Botão "Prévia" das linhas da lista. */
const BotaoPrevia = (props: { aoClicar: () => void }) => (
  <button className="botao-fantasma botao-pequeno" onClick={props.aoClicar}>
    <Icone nome="documento" className="h-4 w-4" />
    Prévia
  </button>
)

/**
 * Atestado, declaração e receita (não podem ser excluídos) e os documentos criados pela
 * clínica. Na ficha, o profissional escolhe, confere os dados e o documento vai para o prontuário.
 */
function ModelosDocumento() {
  const c = useQuery(consultaConfig('documentosPadrao'))
  const fixos = useQuery(consultaConfig('documentos'))
  const salvar = useSalvar('documentosPadrao', 'Documentos padrão salvos')
  const salvarFixo = useSalvar('documentos', 'Modelo salvo')
  const [editando, setEditando] = useState<number | 'novo' | ModeloFixo | null>(null)
  const [previa, setPrevia] = useState<(DocumentoPadrao & { modelo: string }) | null>(null)
  const exemplo = useExemplo()
  if (!c.data || !fixos.data) return <Carregando />
  const lista = c.data
  const textosFixos = fixos.data
  const fixoAberto = typeof editando === 'string' && editando !== 'novo' ? editando : null
  const gravar = (nova: DocumentoPadrao[]) =>
    salvar.mutateAsync(nova).then(
      () => setEditando(null),
      () => {},
    )
  return (
    <>
      <Secao
        titulo="Documentos padrão"
        descricao="Orientações, termos e declarações de texto pronto. Na ficha, o profissional escolhe, confere os dados e o documento fica no prontuário para imprimir."
        acao={
          <button className="botao" onClick={() => setEditando('novo')}>
            <Icone nome="mais" className="h-4 w-4" />
            Novo documento padrão
          </button>
        }
        colado
      >
        <ul className={`divide-y divide-borda ${ROLAGEM}`}>
          {MODELOS_FIXOS.map((id) => (
            <li
              key={id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-primaria-clara"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primaria-clara text-primaria">
                <Icone nome="arquivo" className="h-5 w-5" />
              </span>
              <div className="min-w-40 flex-1">
                <p className="truncate font-bold text-titulo">{MODELOS_DOCUMENTO[id].titulo}</p>
                <p className="truncate text-suave">{textosFixos[id].replace(/\s+/g, ' ')}</p>
              </div>
              <div className="flex items-center gap-1">
                <BotaoPrevia
                  aoClicar={() =>
                    setPrevia({
                      modelo: id,
                      nome: MODELOS_DOCUMENTO[id].titulo,
                      texto: textosFixos[id],
                    })
                  }
                />
                <button className="botao-fantasma botao-pequeno" onClick={() => setEditando(id)}>
                  <Icone nome="lapis" className="h-4 w-4" />
                  Editar
                </button>
              </div>
            </li>
          ))}
          {lista.map((d, i) => (
            <li
              key={d.nome}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-primaria-clara"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secundaria-clara text-titulo">
                <Icone nome="arquivo" className="h-5 w-5" />
              </span>
              <div className="min-w-40 flex-1">
                <p className="truncate font-bold text-titulo">{d.nome}</p>
                <p className="truncate text-suave">{d.texto.replace(/\s+/g, ' ')}</p>
              </div>
              <div className="flex items-center gap-1">
                <BotaoPrevia aoClicar={() => setPrevia({ ...d, modelo: 'padrao' })} />
                <button className="botao-fantasma botao-pequeno" onClick={() => setEditando(i)}>
                  <Icone nome="lapis" className="h-4 w-4" />
                  Editar
                </button>
                <button
                  className="botao-fantasma botao-icone text-perigo hover:bg-perigo/10"
                  aria-label={`Excluir ${d.nome}`}
                  title="Excluir"
                  disabled={salvar.isPending}
                  onClick={async () =>
                    (await confirmar(
                      `Excluir o documento padrão "${d.nome}"? Os já emitidos continuam no prontuário.`,
                    )) && gravar(lista.filter((_, k) => k !== i))
                  }
                >
                  <Icone nome="lixeira" className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </Secao>
      <Dialogo
        aberto={editando !== null}
        aoFechar={() => setEditando(null)}
        titulo={editando === 'novo' ? 'Novo documento padrão' : 'Editar documento padrão'}
        largo
      >
        {fixoAberto && (
          <FormDocumentoPadrao
            documento={{
              nome: MODELOS_DOCUMENTO[fixoAberto].titulo,
              texto: textosFixos[fixoAberto],
            }}
            modelo={fixoAberto}
            salvando={salvarFixo.isPending}
            aoCancelar={() => setEditando(null)}
            aoSalvar={(d) =>
              salvarFixo.mutateAsync({ ...textosFixos, [fixoAberto]: d.texto }).then(
                () => setEditando(null),
                () => {},
              )
            }
          />
        )}
        {(editando === 'novo' || typeof editando === 'number') && (
          <FormDocumentoPadrao
            documento={editando === 'novo' ? undefined : lista[editando]}
            modelo="padrao"
            salvando={salvar.isPending}
            aoCancelar={() => setEditando(null)}
            aoSalvar={(d) =>
              gravar(
                editando === 'novo' ? [...lista, d] : lista.map((x, k) => (k === editando ? d : x)),
              )
            }
          />
        )}
      </Dialogo>
      <Dialogo aberto={!!previa} aoFechar={() => setPrevia(null)} titulo="Prévia do documento">
        {previa && (
          <div className="space-y-3">
            <p className="text-sm text-suave">Com dados de exemplo no lugar das variáveis.</p>
            <FolhaTimbrada
              modelo={previa.modelo}
              titulo={previa.nome}
              texto={exemplo(previa.texto)}
            />
          </div>
        )}
      </Dialogo>
    </>
  )
}

function FormDocumentoPadrao(props: {
  documento?: DocumentoPadrao
  /** "padrao" ou atestado/declaração/receita (esses não mudam de nome). */
  modelo: string
  salvando: boolean
  aoSalvar: (d: DocumentoPadrao) => void
  aoCancelar: () => void
}) {
  const exemplo = useExemplo()
  const [nome, setNome] = useState(props.documento?.nome ?? '')
  const [texto, setTexto] = useState(props.documento?.texto ?? TEXTO_NOVO)
  return (
    <form
      className="grid items-start gap-5 lg:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault()
        const f = new FormData(e.currentTarget)
        props.aoSalvar({ nome: String(f.get('nome')), texto: String(f.get('texto')) })
      }}
    >
      <div className="space-y-4">
        <label className="block">
          <span className="rotulo">Nome *</span>
          <input
            name="nome"
            className="campo"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={120}
            required
            readOnly={props.modelo !== 'padrao'}
            autoFocus={props.modelo === 'padrao'}
            placeholder="Ex.: Orientações pós-extração"
          />
          <span className="ajuda">É o título que sai no documento impresso.</span>
        </label>
        <label className="block">
          <span className="rotulo">Texto *</span>
          <textarea
            name="texto"
            className="campo font-serif text-base leading-relaxed"
            rows={12}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            required
          />
        </label>
        <p className="text-sm text-suave">
          Variáveis: <Variaveis nomes={[...VARIAVEIS_DOCUMENTO, ...VARIAVEIS_DIGITADAS]} />.
          Horário, fim, dias, CID e serviço o profissional informa na hora de gerar o documento.
        </p>
      </div>
      <div className="space-y-2 lg:sticky lg:top-0">
        <p className="rotulo">Prévia</p>
        <FolhaTimbrada modelo={props.modelo} titulo={nome} texto={exemplo(texto)} />
      </div>
      <div className="lg:col-span-2">
        <Rodape ocupado={props.salvando} aoCancelar={props.aoCancelar} />
      </div>
    </form>
  )
}

// ── Especialidades ──────────────────────────────────────────────────────────
function Horarios() {
  const c = useQuery(consultaConfig('horariosFechados'))
  return c.data ? <GradeHorarios salvos={c.data} /> : <Carregando />
}

/** Horários da semana em que a clínica não atende ninguém (vale para todos os profissionais). */
function GradeHorarios({ salvos }: { salvos: string[] }) {
  const [fechados, setFechados] = useState(() => new Set(salvos))
  const salvar = useSalvar('horariosFechados', 'Horários de atendimento salvos')
  const mudou = fechados.size !== salvos.length || salvos.some((c) => !fechados.has(c))
  return (
    <Secao
      titulo="Horários de atendimento"
      descricao="Marque quando a clínica não atende ninguém, como sábado à tarde. Vale para todos os profissionais."
      className="max-w-4xl"
      acao={
        <div className="flex items-center gap-2">
          {mudou && <span className="text-sm font-bold text-aviso">Alterações não salvas</span>}
          <button
            type="button"
            className="botao-leve"
            disabled={!mudou || salvar.isPending}
            onClick={() => setFechados(new Set(salvos))}
          >
            Desfazer
          </button>
          <button
            type="button"
            className="botao"
            disabled={!mudou || salvar.isPending}
            onClick={() => salvar.mutate([...fechados])}
          >
            {salvar.isPending ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      }
    >
      <GradeSemana
        marcados={fechados}
        aoMudar={setFechados}
        cor="clinica"
        editavel
        dica="Clique no primeiro horário sem atendimento e depois no último. Dá para pegar vários dias de uma vez."
      />
    </Secao>
  )
}

function Especialidades() {
  const c = useQuery(consultaConfig('especialidades'))
  return c.data ? <ListaEspecialidades inicial={c.data} /> : <Carregando />
}

function ListaEspecialidades({ inicial }: { inicial: string[] }) {
  const [lista, setLista] = useState(inicial)
  const [nova, setNova] = useState('')
  const salvar = useSalvar('especialidades', 'Especialidades salvas')
  const gravar = (l: string[]) => {
    setLista(l)
    salvar.mutate(l)
  }
  return (
    <Secao
      titulo="Especialidades"
      descricao="Sugeridas no cadastro de profissionais e de procedimentos."
      colado
      className="max-w-2xl"
    >
      <form
        className="flex items-end gap-3 border-b border-borda bg-superficie-2 px-4 py-4"
        onSubmit={(e) => {
          e.preventDefault()
          gravar([...lista, nova.trim()])
          setNova('')
        }}
      >
        <label className="flex-1">
          <span className="rotulo">Nova especialidade</span>
          <input
            className="campo"
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            placeholder="Ex.: Harmonização orofacial"
            required
          />
        </label>
        <button className="botao shrink-0" disabled={salvar.isPending}>
          <Icone nome="mais" className="h-4 w-4" />
          Adicionar
        </button>
      </form>
      {!lista.length && <Vazio icone="etiqueta" titulo="Nenhuma especialidade cadastrada" />}
      <ul className="divide-y divide-borda lg:max-h-[calc(100dvh-25rem)] lg:min-h-40 lg:overflow-y-auto">
        {lista.map((e) => (
          <li key={e} className="flex items-center gap-3 px-4 py-2 hover:bg-primaria-clara">
            <span className="flex-1 font-bold text-titulo">{e}</span>
            <button
              className="botao-fantasma botao-icone text-perigo hover:bg-perigo/10"
              aria-label={`Remover ${e}`}
              title="Remover"
              onClick={async () =>
                (await confirmar(`Remover "${e}" da lista? Quem já usa continua com ela.`, {
                  botao: 'Remover',
                })) && gravar(lista.filter((x) => x !== e))
              }
            >
              <Icone nome="lixeira" className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </Secao>
  )
}

// ── E-mail e mensagens ──────────────────────────────────────────────────────
function Mensagens() {
  const c = useQuery(consultaConfig('mensagens'))
  const estado = useQuery({
    queryKey: ['email-estado'],
    queryFn: async () =>
      (
        await api.get<{ configurado: boolean; remetente: string | null; servidor: string | null }>(
          '/configuracoes/email/estado',
        )
      ).data,
  })
  const salvar = useSalvar('mensagens', 'Mensagem salva')
  const teste = useMutation({
    mutationFn: async (para: string) =>
      (await api.post<{ mensagem: string }>('/configuracoes/email/teste', { para })).data,
    onSuccess: (r) => avisar(r.mensagem),
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <Secao titulo="E-mail da clínica" descricao="Usado nas confirmações de consulta.">
        {estado.data &&
          (estado.data.configurado ? (
            <p className="alerta-sucesso">
              <strong>Configurado:</strong> envia como {estado.data.remetente ?? '—'} (
              {estado.data.servidor}).
            </p>
          ) : (
            <p className="alerta-aviso">
              <strong>Ainda não configurado.</strong> Os e-mails não são enviados.
            </p>
          ))}
        <p className="text-suave">
          O endereço e a senha ficam no arquivo <code>server/.env</code> do servidor (não nesta
          tela, por segurança): <code>SMTP_HOST</code>, <code>SMTP_PORTA</code>,{' '}
          <code>SMTP_USUARIO</code>, <code>SMTP_SENHA</code> e <code>EMAIL_REMETENTE</code>. No
          Gmail, a senha é uma “senha de app”.
        </p>
        <form
          className="flex items-end gap-2 border-t border-borda pt-4"
          onSubmit={(e) => {
            e.preventDefault()
            teste.mutate(String(new FormData(e.currentTarget).get('para')))
          }}
        >
          <div className="flex-1">
            <label className="rotulo" htmlFor="email-teste">
              Enviar e-mail de teste
            </label>
            <CampoEmail id="email-teste" name="para" placeholder="nome@exemplo.com" required />
          </div>
          <button className="botao-leve shrink-0" disabled={teste.isPending}>
            <Icone nome="enviar" className="h-4 w-4" />
            Enviar teste
          </button>
        </form>
        <p className="alerta-info">
          WhatsApp e SMS: preparados, mas desligados até a clínica contratar um provedor.
        </p>
      </Secao>

      <Secao
        titulo="Texto da confirmação de consulta"
        descricao="Enviado ao paciente com o link para confirmar presença."
      >
        {c.data && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              salvar.mutate(Object.fromEntries(new FormData(e.currentTarget)))
            }}
          >
            <textarea
              name="confirmacao"
              aria-label="Texto da confirmação"
              className="campo"
              rows={6}
              defaultValue={c.data.confirmacao}
              required
              maxLength={1000}
            />
            <p className="text-sm text-suave">
              Variáveis: <Variaveis nomes={VARIAVEIS_MENSAGEM} />. O <code>{'{link}'}</code> é
              obrigatório: é por ele que o paciente confirma.
            </p>
            <Rodape ocupado={salvar.isPending} />
          </form>
        )}
      </Secao>
    </div>
  )
}

// ── Permissões ──────────────────────────────────────────────────────────────

const CARGOS = (Object.keys(PERFIS) as Perfil[]).filter((p) => p !== 'ADMINISTRADOR')
/** Ação e uma coluna por cargo (no celular cada linha vira um cartão). */
const COLUNAS_ACOES = 'md:grid-cols-[minmax(0,1fr)_repeat(3,7rem)]'
const corCheck = (p: Perfil) =>
  ({ '--cor-check': COR_PERFIL[p], '--sobre-check': '#fff' }) as CSSProperties
const plural = (n: number, um: string, varios: string) => (n === 1 ? `1 ${um}` : `${n} ${varios}`)

function Permissoes() {
  const c = useQuery(consultaConfig('permissoes'))
  const d = useQuery(consultaConfig('desconto'))
  if (!c.data || !d.data) return <Carregando />
  return <EditarPermissoes salvo={c.data} descontoSalvo={d.data} />
}

/** Usuário como vem de /usuarios (só o que a aba Desconto usa). */
interface UsuarioLista {
  id: number
  nome: string
  login: string
  perfis: Perfil[]
  ativo: boolean
}

/**
 * Lista de módulos à esquerda (faixa que rola de lado no celular) e, à direita, o módulo
 * escolhido: primeiro quem entra nele, depois as ações de dentro, agrupadas por parte.
 */
function EditarPermissoes({ salvo, descontoSalvo }: { salvo: Matriz; descontoSalvo: number[] }) {
  const [matriz, setMatriz] = useState(salvo)
  const [desconto, setDesconto] = useState(descontoSalvo)
  const [busca, setBusca] = useState('')
  // "desconto" é a aba à parte (por usuário); o resto são os módulos (por cargo).
  const [escolhido, setEscolhido] = useState<Acao | 'desconto'>(MODULOS[0].ver)
  const salvarMatriz = useSalvar('permissoes', 'Permissões salvas')
  const salvarDesconto = useSalvar('desconto', 'Permissões salvas')
  const qc = useQueryClient()
  const igual = (a: Perfil[], b: Perfil[]) => a.length === b.length && a.every((p) => b.includes(p))
  const mudou = (a: Acao) => !igual(matriz[a], salvo[a])
  const descontoMudou =
    desconto.length !== descontoSalvo.length || desconto.some((i) => !descontoSalvo.includes(i))
  const mudancas = ACOES.filter(mudou).length + (descontoMudou ? 1 : 0)
  const salvando = salvarMatriz.isPending || salvarDesconto.isPending
  const salvar = async () => {
    if (ACOES.some(mudou)) await salvarMatriz.mutateAsync(matriz).catch(() => {})
    if (descontoMudou) await salvarDesconto.mutateAsync(desconto).catch(() => {})
    // O "eu" traz a matriz e se pode dar desconto: atualiza para valer já nesta tela.
    qc.invalidateQueries({ queryKey: ['eu'] })
  }
  const ePadrao = ACOES.every((a) => igual(matriz[a], MATRIZ_PADRAO[a]))
  const marcar = (a: Acao, p: Perfil, sim: boolean) =>
    setMatriz((m) => ({
      ...m,
      [a]: sim ? [...m[a].filter((x) => x !== p), p] : m[a].filter((x) => x !== p),
    }))
  const termo = normalizar(busca)
  const modulos = MODULOS.map((m) => ({
    ...m,
    itens: termo
      ? m.itens.filter((i) => normalizar(`${m.nome} ${i.modulo} ${i.rotulo}`).includes(termo))
      : m.itens,
  })).filter((m) => !termo || m.itens.length > 0 || normalizar(m.nome).includes(termo))
  const mostraDesconto =
    !termo || normalizar('desconto orçamentos financeiro usuários').includes(termo)
  // A busca pode esconder o módulo escolhido: mostra o primeiro que sobrou.
  const naDesconto = escolhido === 'desconto' && mostraDesconto
  const atual = naDesconto ? undefined : (modulos.find((m) => m.ver === escolhido) ?? modulos[0])
  const travados = atual ? CARGOS.filter((c) => !matriz[atual.ver].includes(c)) : []

  const temFinanceiro = modulos.some((m) => m.ver === 'orcamento.ver')
  // Aba à parte, logo depois de Financeiro e orçamentos.
  const botaoDesconto = (
    <button
      type="button"
      aria-current={naDesconto ? 'true' : undefined}
      onClick={() => setEscolhido('desconto')}
      className={`flex min-h-14 flex-none items-center justify-between gap-3 rounded-xl border px-3.5 py-2 text-left xl:w-full ${
        naDesconto
          ? 'border-primaria bg-primaria-clara'
          : 'border-borda xl:border-transparent xl:hover:bg-superficie-2'
      }`}
    >
      <span className="flex flex-col">
        <span className="font-bold whitespace-nowrap text-titulo">Desconto</span>
        <span className="text-xs whitespace-nowrap text-suave">
          {descontoMudou ? (
            <span className="font-bold text-aviso">alterado</span>
          ) : (
            plural(desconto.length, 'usuário escolhido', 'usuários escolhidos')
          )}
        </span>
      </span>
      <Icone nome="cadeado" className="h-4 w-4 text-suave" />
    </button>
  )

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        salvar()
      }}
    >
      <Secao
        titulo="Permissões"
        descricao="Escolha um módulo e marque o que cada cargo pode fazer dentro dele. Quem não entra no módulo não usa nenhuma ação de dentro. O Administrador pode tudo, sempre."
        acao={
          <button
            type="button"
            className="botao-leve"
            disabled={ePadrao && !desconto.length}
            onClick={() => {
              setMatriz(MATRIZ_PADRAO)
              setDesconto([])
            }}
          >
            Restaurar padrão
          </button>
        }
        colado
      >
        <div className="px-5 py-4">
          <CampoBusca
            rotulo="Buscar ação (ex.: prontuário, receber)"
            valor={busca}
            aoMudar={setBusca}
          />
        </div>

        {/* Altura presa à tela: cada coluna rola por dentro e o Salvar fica sempre à vista. */}
        <div className="flex flex-col gap-4 px-5 pb-5 xl:h-[calc(100dvh-30rem)] xl:min-h-72 xl:flex-row">
          <nav
            aria-label="Módulos"
            className="-mx-5 flex flex-none gap-2 overflow-x-auto px-5 pb-1 xl:mx-0 xl:w-72 xl:flex-col xl:gap-1 xl:overflow-x-hidden xl:overflow-y-auto xl:rounded-2xl xl:border xl:border-borda xl:p-2"
          >
            {modulos.map((m) => {
              const sel = m.ver === atual?.ver
              const alterado = [m.ver, ...m.itens.map((i) => i.acao)].some(mudou)
              return (
                <Fragment key={m.ver}>
                  <button
                    type="button"
                    aria-current={sel ? 'true' : undefined}
                    onClick={() => setEscolhido(m.ver)}
                    className={`flex min-h-14 flex-none items-center justify-between gap-3 rounded-xl border px-3.5 py-2 text-left xl:w-full ${
                      sel
                        ? 'border-primaria bg-primaria-clara'
                        : 'border-borda xl:border-transparent xl:hover:bg-superficie-2'
                    }`}
                  >
                    <span className="flex flex-col">
                      <span className="font-bold whitespace-nowrap text-titulo">{m.nome}</span>
                      <span className="text-xs whitespace-nowrap text-suave">
                        {alterado ? (
                          <span className="font-bold text-aviso">alterado</span>
                        ) : m.itens.length ? (
                          plural(m.itens.length, 'ação interna', 'ações internas')
                        ) : (
                          'sem ações internas'
                        )}
                      </span>
                    </span>
                    <span className="flex gap-1" aria-hidden>
                      {CARGOS.map((c) => (
                        <span
                          key={c}
                          className="size-2.5 rounded-full border-2"
                          style={{
                            borderColor: COR_PERFIL[c],
                            backgroundColor: matriz[m.ver].includes(c) ? COR_PERFIL[c] : undefined,
                          }}
                        />
                      ))}
                    </span>
                  </button>
                  {m.ver === 'orcamento.ver' && mostraDesconto && botaoDesconto}
                </Fragment>
              )
            })}
            {mostraDesconto && !temFinanceiro && botaoDesconto}
            {modulos.length === 0 && !mostraDesconto && (
              <p className="py-4 text-suave xl:text-center">Nenhuma ação encontrada.</p>
            )}
          </nav>

          {naDesconto && <PainelDesconto escolhidos={desconto} aoMudar={setDesconto} />}

          {atual && (
            <section
              aria-label={`Módulo ${atual.nome}`}
              className="min-w-0 flex-1 rounded-2xl border border-borda lg:max-h-[60dvh] lg:overflow-y-auto xl:max-h-none"
            >
              <div className="sticky top-0 z-10 flex flex-col gap-2 border-b border-borda bg-superficie px-5 py-3 md:flex-row md:items-center md:justify-between md:gap-4">
                <h3 className="text-lg font-bold text-titulo">{atual.nome}</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-suave">Quem entra:</span>
                  <div className="flex flex-wrap gap-1.5">
                    <span
                      className="flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-xs font-bold md:min-h-8"
                      style={{
                        borderColor: COR_PERFIL.ADMINISTRADOR,
                        color: COR_PERFIL.ADMINISTRADOR,
                      }}
                      title="O Administrador pode tudo, sempre"
                    >
                      <Icone nome="cadeado" className="h-3.5 w-3.5" />
                      {PERFIS.ADMINISTRADOR}
                    </span>
                    {CARGOS.map((c) => {
                      const sim = matriz[atual.ver].includes(c)
                      return (
                        <button
                          key={c}
                          type="button"
                          aria-pressed={sim}
                          onClick={() => marcar(atual.ver, c, !sim)}
                          className={`flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-xs font-bold md:min-h-8 ${
                            sim ? 'text-white' : 'border-dashed text-suave'
                          }`}
                          style={
                            sim
                              ? { backgroundColor: COR_PERFIL[c], borderColor: COR_PERFIL[c] }
                              : { borderColor: 'var(--borda-campo)' }
                          }
                        >
                          <span aria-hidden>{sim ? '✓' : '+'}</span>
                          {PERFIS[c]}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {atual.itens.length === 0 ? (
                <p className="p-5 text-suave">
                  Este módulo não tem ações internas: quem entra vê tudo o que há nele.
                </p>
              ) : (
                <div className="px-5 pb-5">
                  <div
                    className={`hidden items-center gap-x-4 py-3 text-xs font-bold text-suave md:grid ${COLUNAS_ACOES}`}
                  >
                    <span>Ações dentro de {atual.nome}</span>
                    {CARGOS.map((c) => (
                      <span
                        key={c}
                        className="text-center"
                        style={{ color: `color-mix(in srgb, ${COR_PERFIL[c]} 75%, var(--texto))` }}
                      >
                        {PERFIS[c]}
                      </span>
                    ))}
                  </div>
                  {atual.itens.map((i, n) => (
                    <div key={i.acao}>
                      {i.modulo !== atual.itens[n - 1]?.modulo && (
                        <p className="pt-4 pb-1 text-xs font-bold tracking-wide text-suave uppercase">
                          {i.modulo}
                        </p>
                      )}
                      <div
                        className={`grid items-center gap-x-4 border-t border-borda/60 py-1 ${COLUNAS_ACOES}`}
                      >
                        <span className="pt-2 md:py-2">{i.rotulo}</span>
                        <div className="flex flex-wrap gap-x-4 md:contents">
                          {CARGOS.map((c) => (
                            <label
                              key={c}
                              className="flex min-h-11 cursor-pointer items-center gap-2 md:justify-center"
                            >
                              <input
                                type="checkbox"
                                style={corCheck(c)}
                                checked={matriz[i.acao].includes(c)}
                                disabled={travados.includes(c)}
                                onChange={(e) => marcar(i.acao, c, e.target.checked)}
                                aria-label={`${PERFIS[c]}: ${atual.nome} › ${i.modulo}: ${i.rotulo}`}
                              />
                              <span className="text-sm md:hidden" aria-hidden>
                                {PERFIS[c]}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                  {travados.length > 0 && (
                    <p className="pt-4 text-sm text-aviso">
                      {travados.map((c) => PERFIS[c]).join(', ')}{' '}
                      {travados.length === 1 ? 'não entra' : 'não entram'} no módulo, então as ações
                      ficam travadas.
                    </p>
                  )}
                </div>
              )}
            </section>
          )}
        </div>

        <div className="border-t border-borda px-5 py-4">
          <Rodape
            ocupado={salvando}
            desativado={!mudancas}
            aoCancelar={
              mudancas
                ? () => {
                    setMatriz(salvo)
                    setDesconto(descontoSalvo)
                  }
                : undefined
            }
          >
            {mudancas > 0 && (
              <span className="mr-auto text-sm font-bold text-aviso">
                {mudancas === 1 ? '1 alteração não salva' : `${mudancas} alterações não salvas`}
              </span>
            )}
          </Rodape>
        </div>
      </Secao>
    </form>
  )
}

/**
 * Aba Desconto: quem pode dar desconto em orçamento é escolhido usuário por usuário (não por
 * cargo). O Administrador pode sempre.
 */
function PainelDesconto(props: { escolhidos: number[]; aoMudar: (ids: number[]) => void }) {
  const usuarios = useQuery({
    queryKey: ['usuarios'],
    queryFn: async () => (await api.get<UsuarioLista[]>('/usuarios')).data,
  })
  const [busca, setBusca] = useState('')
  const lista = (usuarios.data ?? []).filter(
    (u) => u.ativo && normalizar(`${u.nome} ${u.login}`).includes(normalizar(busca)),
  )
  const alternar = (id: number, sim: boolean) =>
    props.aoMudar(sim ? [...props.escolhidos, id] : props.escolhidos.filter((i) => i !== id))
  return (
    <section
      aria-label="Desconto"
      className="min-w-0 flex-1 rounded-2xl border border-borda lg:max-h-[60dvh] lg:overflow-y-auto xl:max-h-none"
    >
      <div className="sticky top-0 z-10 flex flex-col gap-3 border-b border-borda bg-superficie p-5">
        <h3 className="text-xl font-bold text-titulo">Desconto em orçamentos</h3>
        <p className="text-suave">
          Marque cada usuário que pode dar desconto (em R$ ou %) nos orçamentos e no Adicionar
          procedimento do prontuário. Vale por pessoa, não por cargo. Quem não está marcado não vê o
          campo de desconto.
        </p>
        <CampoBusca rotulo="Buscar usuário" valor={busca} aoMudar={setBusca} />
      </div>
      {usuarios.isPending && <p className="p-5 text-suave">Carregando…</p>}
      {usuarios.isError && (
        <p className="p-5 text-perigo">
          Não foi possível listar os usuários: é preciso poder gerenciar usuários.
        </p>
      )}
      {usuarios.data && !lista.length && (
        <p className="p-5 text-suave">Nenhum usuário encontrado.</p>
      )}
      <ul className="divide-y divide-borda/60 px-5 pb-3">
        {lista.map((u) => {
          const adm = u.perfis.includes('ADMINISTRADOR')
          return (
            <li key={u.id}>
              <label className="flex min-h-14 cursor-pointer items-center gap-3 py-2">
                <input
                  type="checkbox"
                  className="check-sucesso"
                  checked={adm || props.escolhidos.includes(u.id)}
                  disabled={adm}
                  onChange={(e) => alternar(u.id, e.target.checked)}
                  aria-label={`${u.nome} pode dar desconto`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-titulo">{u.nome}</span>
                  <span className="block truncate text-xs text-suave">
                    {u.perfis.map((p) => PERFIS[p]).join(', ')} · {u.login}
                  </span>
                </span>
                {adm && (
                  <span
                    className="flex items-center gap-1 text-xs font-bold"
                    style={{ color: COR_PERFIL.ADMINISTRADOR }}
                    title="O Administrador pode tudo, sempre"
                  >
                    <Icone nome="cadeado" className="h-3.5 w-3.5" />
                    Sempre
                  </span>
                )}
              </label>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Etiqueta do tipo do procedimento: por dente ou por procedimento. */
export function SeloTipoProcedimento({ porDente }: { porDente: boolean }) {
  return (
    <span
      className={`etiqueta inline-flex items-center gap-1 whitespace-nowrap ${porDente ? '' : 'etiqueta-primaria'}`}
      title={tipoProcedimento(porDente).rotulo}
    >
      <Icone nome="dente" className="h-3.5 w-3.5" />
      {tipoProcedimento(porDente).rotulo}
    </span>
  )
}

// ── Logs (só o administrador) ──────────────────────────────────────────────
interface Log {
  id: string
  em: string
  usuario: string | null
  metodo: string
  caminho: string
  status: number
  ip: string | null
  detalhe: string | null
}

const VERBO: Record<string, string> = {
  ABRIU: 'Abriu a ficha',
  POST: 'Criou/enviou',
  PUT: 'Alterou',
  PATCH: 'Alterou',
  DELETE: 'Excluiu',
}

function textoLog(l: Log) {
  if (l.caminho === '/api/entrar')
    return l.status < 400 ? 'Entrou no sistema' : 'Login recusado (usuário ou senha errados)'
  if (l.caminho === '/api/sair') return 'Saiu do sistema'
  return l.metodo === 'ABRIU' ? `${VERBO.ABRIU} de ${l.detalhe}` : (VERBO[l.metodo] ?? l.metodo)
}

function Logs() {
  const [termo, setTermo] = useState('')
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(1)
  const [linhas, setLinhas] = useState(25)
  const rolagem = useRef<HTMLDivElement>(null)
  // Espera parar de digitar para buscar no servidor; busca nova volta à página 1.
  useEffect(() => {
    const t = setTimeout(() => {
      if (termo.trim() === busca) return
      setBusca(termo.trim())
      setPagina(1)
    }, 300)
    return () => clearTimeout(t)
  }, [termo, busca])
  const logs = useQuery({
    queryKey: ['logs', busca, pagina, linhas],
    queryFn: async () =>
      (
        await api.get<{ itens: Log[]; total: number }>('/logs', {
          params: { busca: busca || undefined, pagina, porPagina: linhas },
        })
      ).data,
    placeholderData: keepPreviousData,
  })
  const itens = logs.data?.itens ?? []
  const total = logs.data?.total ?? 0
  const paginas = Math.max(1, Math.ceil(total / linhas))
  const quem = (l: Log) =>
    l.usuario ?? (l.caminho === '/api/entrar' && l.detalhe ? `"${l.detalhe}"` : 'Página pública')
  const tecnico = (l: Log) =>
    `${l.metodo === 'ABRIU' ? l.caminho : `${l.metodo} ${l.caminho}`}${l.ip ? ` · ${l.ip}` : ''}`
  const falhou = (l: Log) =>
    l.status >= 400 && <span className="etiqueta etiqueta-perigo">Falhou ({l.status})</span>
  const vazio = logs.data && !itens.length && (
    <Vazio
      icone={busca ? 'busca' : 'documento'}
      titulo={busca ? 'Nada encontrado' : 'Nenhum registro ainda'}
    />
  )

  return (
    <div className="space-y-4">
      <CampoBusca
        valor={termo}
        aoMudar={setTermo}
        rotulo="Buscar por usuário, paciente ou caminho"
      />
      {/* Só a tabela rola (no computador); a página fica parada, como em Pacientes. */}
      <div className="cartao flex min-h-0 flex-col overflow-hidden p-0">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-borda px-4 py-2.5 text-sm text-suave">
          <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="font-bold">
              {logs.isFetching ? 'Buscando…' : `${total} ${total === 1 ? 'registro' : 'registros'}`}
            </span>
            <label className="flex items-center gap-2">
              Linhas por página
              <CampoSelect
                className="w-auto py-1"
                value={linhas}
                onChange={(e) => {
                  setLinhas(Number(e.target.value))
                  setPagina(1)
                }}
                vazio={false}
                opcoes={[10, 25, 50, 100]}
              />
            </label>
            <button
              className="botao-leve"
              onClick={() => logs.refetch()}
              disabled={logs.isFetching}
            >
              Atualizar
            </button>
          </span>
          {paginas > 1 && (
            <span className="flex items-center gap-1">
              <span className="mr-2">
                Página {pagina} de {paginas}
              </span>
              {(
                [
                  ['primeira', 1, 'Primeira página'],
                  ['esquerda', pagina - 1, 'Página anterior'],
                  ['direita', pagina + 1, 'Próxima página'],
                  ['ultima', paginas, 'Última página'],
                ] as const
              ).map(([icone, destino, rotulo]) => (
                <button
                  key={rotulo}
                  className="botao-leve botao-icone"
                  aria-label={rotulo}
                  title={rotulo}
                  disabled={destino < 1 || destino > paginas || destino === pagina}
                  onClick={() => {
                    rolagem.current?.scrollTo({ top: 0 })
                    setPagina(destino)
                  }}
                >
                  <Icone nome={icone} />
                </button>
              ))}
            </span>
          )}
        </div>
        {logs.isPending && <p className="px-4 py-10 text-center text-suave">Carregando…</p>}
        {logs.isError && (
          <p className="px-4 py-10 text-center text-perigo">{mensagemDeErro(logs.error)}</p>
        )}
        {vazio}
        {/* Celular: cartões; a tabela só a partir de md. */}
        <ul className={`divide-y divide-borda md:hidden ${logs.isFetching ? 'opacity-60' : ''}`}>
          {itens.map((l) => (
            <li key={l.id} className="space-y-1 px-4 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 font-bold break-words text-titulo">{quem(l)}</span>
                {falhou(l)}
              </div>
              <p className="break-words">{textoLog(l)}</p>
              <p className="text-xs text-suave tabular-nums">
                {new Date(l.em).toLocaleString('pt-BR')}
              </p>
              <code className="block text-xs break-all text-suave">{tecnico(l)}</code>
            </li>
          ))}
        </ul>
        {itens.length > 0 && (
          <div
            ref={rolagem}
            className="hidden min-h-0 overflow-auto md:block lg:max-h-[calc(100dvh-22rem)]"
          >
            <table className="w-full min-w-[52rem] text-left">
              <thead className="sticky top-0 z-10 bg-superficie">
                <tr>
                  {['Quando', 'Quem', 'O que fez', 'Detalhe técnico', ''].map((t) => (
                    <th key={t} className={`${TH} shadow-[inset_0_-1px_0_var(--borda)]`}>
                      {t || <span className="sr-only">Resultado</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className={logs.isFetching ? 'opacity-60' : ''}>
                {itens.map((l) => (
                  <tr
                    key={l.id}
                    className="border-b border-borda last:border-0 hover:bg-primaria-clara"
                  >
                    <td className="px-4 py-2 whitespace-nowrap text-suave tabular-nums">
                      {new Date(l.em).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-2 font-bold text-titulo">{quem(l)}</td>
                    <td className="px-4 py-2">{textoLog(l)}</td>
                    <td className="px-4 py-2">
                      <code className="text-xs break-all text-suave">{tecnico(l)}</code>
                    </td>
                    <td className="px-4 py-2 text-right">{falhou(l)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
