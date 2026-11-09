// Configurações da clínica (S-014).
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, consultaConfig, dataBR, mensagemDeErro } from '../api'
import { avisar } from '../estado'
import { Abas } from '../componentes/Abas'
import { CampoReais } from '../componentes/CampoReais'
import { Dialogo } from '../componentes/Dialogo'
import { confirmar } from '../componentes/Confirmar'
import { Icone } from '../componentes/Icones'
import { reais } from '../../../shared/financeiro'
import { normalizar } from '../../../shared/regras'
import {
  MODELOS_DOCUMENTO,
  TIPOS_PERGUNTA,
  type Pergunta,
  type TipoPergunta,
} from '../../../shared/prontuario'
import {
  VARIAVEIS_MENSAGEM,
  type ChaveConfig,
  type DadosClinica,
  type DocumentoPadrao,
  type Laboratorio,
  type ModeloAnamnese,
} from '../../../shared/configuracoes'
import { CampoSelect } from '../componentes/CampoSelect'
import { GradeSemana } from '../componentes/GradeSemana'
import { CampoEspecialidade } from './Profissionais'
import { Situacao } from './Pacientes'
import { CampoEmail } from '../componentes/CampoMascara'
import { ETAPAS, type Etapa } from '../../../shared/protetico'
import { Importacao } from './Importacao'

// Ordem: a clínica; o que é cadastrado antes (especialidades → procedimentos → laboratórios);
// o atendimento (anamnese → documentos); a comunicação.
export const ABAS = [
  { id: 'clinica', rotulo: 'Clínica' },
  { id: 'horarios', rotulo: 'Horários de atendimento' },
  { id: 'especialidades', rotulo: 'Especialidades' },
  { id: 'procedimentos', rotulo: 'Procedimentos e preços' },
  { id: 'laboratorios', rotulo: 'Laboratórios' },
  { id: 'anamnese', rotulo: 'Anamnese' },
  { id: 'documentos', rotulo: 'Modelos de documento' },
  { id: 'mensagens', rotulo: 'E-mail e mensagens' },
  { id: 'importacao', rotulo: 'Importar dados' },
] as const

/** Lista longa rola dentro do cartão, não a página (cabeçalho e abas ficam à vista). */
const ROLAGEM = 'max-h-[calc(100dvh-19rem)] min-h-40 overflow-y-auto'
type Aba = (typeof ABAS)[number]['id']

export function Configuracoes() {
  const { aba: daUrl } = useSearch({ from: '/logado/configuracoes' })
  const navegar = useNavigate({ from: '/configuracoes' })
  const aba = (ABAS.find((a) => a.id === daUrl)?.id ?? 'clinica') as Aba
  return (
    <div className="space-y-5">
      <header>
        <h1 className="titulo">Configurações</h1>
        <p className="subtitulo">Dados da clínica, tabelas e modelos usados no dia a dia.</p>
      </header>
      <Abas
        abas={[...ABAS]}
        atual={aba}
        aoTrocar={(a) => navegar({ search: { aba: a === 'clinica' ? undefined : a } })}
      />
      {aba === 'clinica' && <Clinica />}
      {aba === 'horarios' && <Horarios />}
      {aba === 'procedimentos' && <Procedimentos />}
      {aba === 'laboratorios' && <Laboratorios />}
      {aba === 'anamnese' && <ModelosAnamnese />}
      {aba === 'documentos' && <ModelosDocumento />}
      {aba === 'especialidades' && <Especialidades />}
      {aba === 'mensagens' && <Mensagens />}
      {aba === 'importacao' && <Importacao />}
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
      <div className={props.colado ? '' : 'space-y-4 p-5'}>{props.children}</div>
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
      className="max-w-3xl"
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          salvar.mutate(Object.fromEntries(new FormData(e.currentTarget)))
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
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

// ── Procedimentos e preços ──────────────────────────────────────────────────
interface Procedimento {
  id: number
  nome: string
  especialidade: string | null
  valorCentavos: number
  custoCentavos: number
  ativo: boolean
}

function Procedimentos() {
  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState<Procedimento | 'novo' | null>(null)
  const lista = useQuery({
    queryKey: ['procedimentos-tabela-completa'],
    queryFn: async () =>
      (await api.get<Procedimento[]>('/procedimentos', { params: { todos: 1 } })).data,
  })
  const visiveis = (lista.data ?? []).filter((p) => normalizar(p.nome).includes(normalizar(busca)))
  const ativos = lista.data?.filter((p) => p.ativo).length ?? 0
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
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borda px-4 py-3">
          <CampoBusca valor={busca} aoMudar={setBusca} rotulo="Buscar procedimento" />
          {lista.data && (
            <span className="text-sm font-bold text-suave">
              {ativos} {ativos === 1 ? 'ativo' : 'ativos'} · {lista.data.length} no total
            </span>
          )}
        </div>
        {lista.isPending && <p className="px-4 py-10 text-center text-suave">Carregando…</p>}
        {lista.data && !visiveis.length ? (
          <Vazio
            icone="busca"
            titulo={busca ? 'Nenhum procedimento encontrado' : 'Nenhum procedimento cadastrado'}
            texto={busca ? 'Confira o nome ou limpe a busca.' : undefined}
          />
        ) : (
          <div className="max-h-[calc(100dvh-24rem)] min-h-40 overflow-auto">
            <table className="w-full min-w-[44rem] text-left">
              <thead className="sticky top-0 z-10 bg-superficie shadow-[inset_0_-1px_0_var(--borda)]">
                <tr>
                  <th className={TH}>Procedimento</th>
                  <th className={TH}>Especialidade</th>
                  <th className={`${TH} text-right`}>Custo</th>
                  <th className={`${TH} text-right`}>Valor</th>
                  <th className={TH}>Situação</th>
                  <th className={TH}>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((p) => (
                  <tr
                    key={p.id}
                    className={`border-b border-borda last:border-0 hover:bg-primaria-clara ${p.ativo ? '' : 'text-suave'}`}
                  >
                    <td className={`px-4 py-2.5 font-bold ${p.ativo ? 'text-titulo' : ''}`}>
                      {p.nome}
                    </td>
                    <td className="px-4 py-2.5">{p.especialidade ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right text-suave tabular-nums">
                      {reais(p.custoCentavos)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold tabular-nums">
                      {reais(p.valorCentavos)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Situacao ativo={p.ativo} />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        className="botao-fantasma botao-pequeno"
                        onClick={() => setEditando(p)}
                      >
                        <Icone nome="lapis" className="h-4 w-4" />
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
  const [valor, setValor] = useState(p?.valorCentavos ?? 0)
  const [custo, setCusto] = useState(p?.custoCentavos ?? 0)
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
        salvar.mutate({
          ...f,
          valorCentavos: valor,
          custoCentavos: custo,
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
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <CampoReais id="proc-custo" rotulo="Custo *" valor={custo} aoMudar={setCusto} />
          <span className="ajuda">Material, laboratório: o que a clínica gasta.</span>
        </div>
        <div>
          <CampoReais id="proc-valor" rotulo="Valor final *" valor={valor} aoMudar={setValor} />
          <span className="ajuda">
            {valor > 0
              ? `Lucro: ${reais(valor - custo)} (${Math.round(((valor - custo) / valor) * 100)}%)`
              : 'Preço cobrado do paciente.'}
          </span>
        </div>
      </div>
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
            <div className="max-h-[calc(100dvh-34rem)] min-h-40 overflow-auto">
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
                          className="botao-fantasma botao-icone size-8 text-perigo hover:bg-perigo/10"
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
            <ul className="max-h-72 divide-y divide-borda overflow-y-auto">
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
        classeLista={`${props.padrao ? 'max-h-[calc(100dvh-27rem)]' : 'max-h-[calc(100dvh-32rem)]'} min-h-40 overflow-y-auto pr-1`}
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
                className="botao-fantasma botao-icone size-8"
                disabled={!i}
                onClick={() => mover(i, -1)}
                aria-label={`Subir pergunta ${i + 1}`}
                title="Subir"
              >
                <Icone nome="direita" className="h-4 w-4 -rotate-90" />
              </button>
              <button
                type="button"
                className="botao-fantasma botao-icone size-8"
                disabled={i === perguntas.length - 1}
                onClick={() => mover(i, 1)}
                aria-label={`Descer pergunta ${i + 1}`}
                title="Descer"
              >
                <Icone nome="direita" className="h-4 w-4 rotate-90" />
              </button>
              <button
                type="button"
                className="botao-fantasma botao-icone size-8 text-perigo hover:bg-perigo/10"
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
const VARIAVEIS_DOCUMENTO = ['paciente', 'cpf', 'profissional', 'cro', 'data', 'cidade', 'clinica']

function ModelosDocumento() {
  return (
    <div className="grid items-start gap-5 xl:grid-cols-2">
      <DocumentosPadrao />
      <ModelosFixos />
    </div>
  )
}

/** Documentos de texto fixo: o profissional escolhe, confere os dados e vai para o prontuário. */
function DocumentosPadrao() {
  const c = useQuery(consultaConfig('documentosPadrao'))
  const salvar = useSalvar('documentosPadrao', 'Documentos padrão salvos')
  const [editando, setEditando] = useState<number | 'novo' | null>(null)
  if (!c.data) return <Carregando />
  const lista = c.data
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
        {!lista.length && (
          <Vazio
            icone="arquivo"
            titulo="Nenhum documento padrão"
            texto="Crie, por exemplo, as orientações pós-cirúrgicas da clínica."
          />
        )}
        <ul className={`divide-y divide-borda ${ROLAGEM}`}>
          {lista.map((d, i) => (
            <li
              key={d.nome}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-primaria-clara"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secundaria-clara text-titulo">
                <Icone nome="arquivo" className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-titulo">{d.nome}</p>
                <p className="truncate text-suave">{d.texto.replace(/\s+/g, ' ')}</p>
              </div>
              <div className="flex items-center gap-1">
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
        {editando !== null && (
          <FormDocumentoPadrao
            documento={editando === 'novo' ? undefined : lista[editando]}
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
    </>
  )
}

function FormDocumentoPadrao(props: {
  documento?: DocumentoPadrao
  salvando: boolean
  aoSalvar: (d: DocumentoPadrao) => void
  aoCancelar: () => void
}) {
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        const f = new FormData(e.currentTarget)
        props.aoSalvar({ nome: String(f.get('nome')), texto: String(f.get('texto')) })
      }}
    >
      <label className="block">
        <span className="rotulo">Nome *</span>
        <input
          name="nome"
          className="campo"
          defaultValue={props.documento?.nome}
          maxLength={120}
          required
          autoFocus
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
          defaultValue={
            props.documento?.texto ?? '\n\n{cidade}, {data}.\n\n\n{profissional}\n{cro}'
          }
          required
        />
      </label>
      <p className="text-sm text-suave">
        Variáveis: <Variaveis nomes={[...VARIAVEIS_DOCUMENTO, 'horario', 'dias']} />. Com{' '}
        <code>{'{horario}'}</code> ou <code>{'{dias}'}</code> no texto, o profissional informa o
        valor na hora.
      </p>
      <Rodape ocupado={props.salvando} aoCancelar={props.aoCancelar} />
    </form>
  )
}

/** Atestado, declaração e receita: abrem num editor para o profissional completar. */
function ModelosFixos() {
  const c = useQuery(consultaConfig('documentos'))
  const salvar = useSalvar('documentos', 'Modelos salvos')
  const ids = Object.keys(MODELOS_DOCUMENTO) as (keyof typeof MODELOS_DOCUMENTO)[]
  const [aberto, setAberto] = useState(ids[0])
  if (!c.data) return <Carregando />
  return (
    <Secao
      titulo="Modelos para preencher"
      descricao="Abrem num editor para o profissional completar antes de salvar."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          salvar.mutate(Object.fromEntries(new FormData(e.currentTarget)))
        }}
      >
        <Abas
          abas={ids.map((id) => ({ id, rotulo: MODELOS_DOCUMENTO[id].titulo }))}
          atual={aberto}
          aoTrocar={setAberto}
        />
        {/* Todos ficam no formulário (escondidos) para o Salvar enviar os três. */}
        {ids.map((id) => (
          <label key={id} className={id === aberto ? 'block' : 'hidden'}>
            <span className="sr-only">{MODELOS_DOCUMENTO[id].titulo}</span>
            <textarea
              name={id}
              className="campo h-[calc(100dvh-34rem)] min-h-48 resize-none font-serif text-base leading-relaxed"
              rows={10}
              defaultValue={c.data[id]}
              required
            />
          </label>
        ))}
        <p className="text-sm text-suave">
          Variáveis:{' '}
          <Variaveis nomes={[...VARIAVEIS_DOCUMENTO, ...MODELOS_DOCUMENTO[aberto].variaveis]} />.
          Cada uma é trocada pelo valor ao gerar o documento.
        </p>
        <Rodape ocupado={salvar.isPending} texto="Salvar modelos" />
      </form>
    </Secao>
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
      <ul className="max-h-[calc(100dvh-25rem)] min-h-40 divide-y divide-borda overflow-y-auto">
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
