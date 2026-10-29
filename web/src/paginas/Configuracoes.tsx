// Configurações da clínica (S-014).
import { useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, consultaConfig, mensagemDeErro } from '../api'
import { avisar } from '../estado'
import { Abas } from '../componentes/Abas'
import { CampoReais } from '../componentes/CampoReais'
import { Dialogo } from '../componentes/Dialogo'
import { reais } from '../../../shared/financeiro'
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
  type Medicamento,
} from '../../../shared/configuracoes'
import { CampoSelect } from '../componentes/CampoSelect'
import { CampoEmail } from '../componentes/CampoMascara'

const ABAS = [
  { id: 'clinica', rotulo: 'Clínica' },
  { id: 'procedimentos', rotulo: 'Procedimentos e preços' },
  { id: 'anamnese', rotulo: 'Anamnese' },
  { id: 'documentos', rotulo: 'Modelos de documento' },
  { id: 'medicamentos', rotulo: 'Medicamentos' },
  { id: 'especialidades', rotulo: 'Especialidades' },
  { id: 'mensagens', rotulo: 'E-mail e mensagens' },
] as const
type Aba = (typeof ABAS)[number]['id']

export function Configuracoes() {
  const { aba: daUrl } = useSearch({ from: '/logado/configuracoes' })
  const navegar = useNavigate({ from: '/configuracoes' })
  const aba = (ABAS.find((a) => a.id === daUrl)?.id ?? 'clinica') as Aba
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Configurações</h1>
      <Abas
        abas={[...ABAS]}
        atual={aba}
        aoTrocar={(a) => navegar({ search: { aba: a === 'clinica' ? undefined : a } })}
      />
      {aba === 'clinica' && <Clinica />}
      {aba === 'procedimentos' && <Procedimentos />}
      {aba === 'anamnese' && <ModeloAnamnese />}
      {aba === 'documentos' && <ModelosDocumento />}
      {aba === 'medicamentos' && <Medicamentos />}
      {aba === 'especialidades' && <Especialidades />}
      {aba === 'mensagens' && <Mensagens />}
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

function Rodape({ salvando, texto = 'Salvar' }: { salvando: boolean; texto?: string }) {
  return (
    <div className="flex justify-end">
      <button className="botao" disabled={salvando}>
        {texto}
      </button>
    </div>
  )
}

// ── Clínica ─────────────────────────────────────────────────────────────────
function Clinica() {
  const c = useQuery(consultaConfig('clinica'))
  const salvar = useSalvar('clinica')
  if (!c.data) return <p className="text-suave">Carregando…</p>
  const campo = (nome: keyof DadosClinica, rotulo: string, extra = {}) => (
    <label>
      <span className="rotulo">{rotulo}</span>
      <input name={nome} className="campo" defaultValue={c.data[nome]} {...extra} />
    </label>
  )
  return (
    <form
      className="cartao max-w-3xl space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        salvar.mutate(Object.fromEntries(new FormData(e.currentTarget)))
      }}
    >
      <p className="text-suave">Aparece nos recibos, documentos e e-mails ao paciente.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {campo('nome', 'Nome da clínica *', { required: true })}
        {campo('cnpj', 'CNPJ')}
        {campo('endereco', 'Endereço')}
        {campo('cidade', 'Cidade (vai na data dos documentos)')}
        {campo('telefone', 'Telefone')}
        {campo('email', 'E-mail de contato', { type: 'email' })}
      </div>
      <Rodape salvando={salvar.isPending} />
    </form>
  )
}

// ── Procedimentos e preços ──────────────────────────────────────────────────
interface Procedimento {
  id: number
  nome: string
  especialidade: string | null
  valorCentavos: number
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
  const termo = busca.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  const visiveis = (lista.data ?? []).filter((p) =>
    p.nome.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().includes(termo),
  )
  return (
    <section className="cartao space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <input
          className="campo max-w-sm"
          placeholder="Buscar procedimento"
          aria-label="Buscar procedimento"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <button className="botao" onClick={() => setEditando('novo')}>
          Novo procedimento
        </button>
      </div>
      <p className="text-suave">
        Mudar o preço vale para orçamentos novos; os já feitos guardam o valor da época.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="border-b border-borda text-suave">
            <tr>
              {['Procedimento', 'Especialidade', 'Valor', 'Situação', ''].map((t) => (
                <th key={t} className="px-3 py-2 font-medium">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((p) => (
              <tr
                key={p.id}
                className={`border-b border-borda last:border-0 ${p.ativo ? '' : 'text-suave'}`}
              >
                <td className="px-3 py-2">{p.nome}</td>
                <td className="px-3 py-2">{p.especialidade ?? '—'}</td>
                <td className="px-3 py-2">{reais(p.valorCentavos)}</td>
                <td className="px-3 py-2">{p.ativo ? 'Ativo' : 'Inativo'}</td>
                <td className="px-3 py-2 text-right">
                  <button className="text-primaria hover:underline" onClick={() => setEditando(p)}>
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
    </section>
  )
}

function FormProcedimento(props: { procedimento?: Procedimento; aoTerminar: () => void }) {
  const qc = useQueryClient()
  const p = props.procedimento
  const especialidades = useQuery(consultaConfig('especialidades'))
  const [valor, setValor] = useState(p?.valorCentavos ?? 0)
  const salvar = useMutation({
    mutationFn: async (d: Record<string, unknown>) =>
      p
        ? (await api.put(`/procedimentos/${p.id}`, d)).data
        : (await api.post('/procedimentos', d)).data,
    onSuccess: () => {
      avisar('Procedimento salvo')
      qc.invalidateQueries({ queryKey: ['procedimentos-tabela-completa'] })
      qc.invalidateQueries({ queryKey: ['procedimentos-tabela'] })
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
        salvar.mutate({ ...f, valorCentavos: valor, ativo: p ? f.ativo === 'on' : true })
      }}
    >
      <label className="block">
        <span className="rotulo">Nome *</span>
        <input name="nome" className="campo" defaultValue={p?.nome} required autoFocus />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="rotulo">Especialidade</span>
          <input
            name="especialidade"
            list="especialidades-cfg"
            className="campo"
            defaultValue={p?.especialidade ?? ''}
          />
          <datalist id="especialidades-cfg">
            {especialidades.data?.map((e) => (
              <option key={e} value={e} />
            ))}
          </datalist>
        </label>
        <CampoReais id="proc-valor" rotulo="Valor *" valor={valor} aoMudar={setValor} />
      </div>
      {p && (
        <label className="flex items-center gap-2">
          <input type="checkbox" name="ativo" defaultChecked={p.ativo} /> Ativo (aparece nos
          orçamentos)
        </label>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className="botao-leve" onClick={props.aoTerminar}>
          Cancelar
        </button>
        <button className="botao" disabled={salvar.isPending}>
          Salvar
        </button>
      </div>
    </form>
  )
}

// ── Anamnese ────────────────────────────────────────────────────────────────
function ModeloAnamnese() {
  const c = useQuery(consultaConfig('anamnese'))
  return c.data ? <EditorAnamnese inicial={c.data} /> : <p className="text-suave">Carregando…</p>
}

function EditorAnamnese({ inicial }: { inicial: Pergunta[] }) {
  const [perguntas, setPerguntas] = useState(inicial)
  const salvar = useSalvar('anamnese', 'Modelo da anamnese salvo')
  const mudar = (i: number, d: Partial<Pergunta>) =>
    setPerguntas(perguntas.map((p, k) => (k === i ? { ...p, ...d } : p)))
  const mover = (i: number, passo: number) => {
    const n = [...perguntas]
    ;[n[i], n[i + passo]] = [n[i + passo], n[i]]
    setPerguntas(n)
  }
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        salvar.mutate(perguntas)
      }}
    >
      <p className="text-suave">
        Vale para as anamneses novas. As já preenchidas guardam as perguntas da época.
      </p>
      <ol className="space-y-2">
        {perguntas.map((p, i) => (
          <li key={i} className="cartao space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-suave">{i + 1}.</span>
              <input
                className="campo min-w-60 flex-1"
                value={p.texto}
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
            <div className="flex flex-wrap items-center gap-4">
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
                  checked={!!p.alerta}
                  onChange={(e) => mudar(i, { alerta: e.target.checked })}
                />
                Resposta vira alerta
              </label>
              <span className="flex-1" />
              <button
                type="button"
                className="text-primaria disabled:opacity-30"
                disabled={!i}
                onClick={() => mover(i, -1)}
                aria-label={`Subir pergunta ${i + 1}`}
              >
                ↑
              </button>
              <button
                type="button"
                className="text-primaria disabled:opacity-30"
                disabled={i === perguntas.length - 1}
                onClick={() => mover(i, 1)}
                aria-label={`Descer pergunta ${i + 1}`}
              >
                ↓
              </button>
              <button
                type="button"
                className="text-perigo hover:underline"
                onClick={() => setPerguntas(perguntas.filter((_, k) => k !== i))}
              >
                Remover
              </button>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex justify-between">
        <button
          type="button"
          className="botao-leve"
          onClick={() => setPerguntas([...perguntas, { texto: '', tipo: 'SIM_NAO' }])}
        >
          Adicionar pergunta
        </button>
        <button className="botao" disabled={!perguntas.length || salvar.isPending}>
          Salvar modelo
        </button>
      </div>
    </form>
  )
}

// ── Modelos de documento ────────────────────────────────────────────────────
function ModelosDocumento() {
  const c = useQuery(consultaConfig('documentos'))
  const salvar = useSalvar('documentos', 'Modelos salvos')
  if (!c.data) return <p className="text-suave">Carregando…</p>
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        salvar.mutate(Object.fromEntries(new FormData(e.currentTarget)))
      }}
    >
      <p className="text-suave">
        Variáveis: {'{paciente} {cpf} {profissional} {cro} {data} {cidade} {clinica}'}, e no
        atestado {'{horario} {dias}'}. Cada uma é trocada pelo valor ao gerar o documento.
      </p>
      {(Object.keys(MODELOS_DOCUMENTO) as (keyof typeof MODELOS_DOCUMENTO)[]).map((id) => (
        <label key={id} className="cartao block">
          <span className="rotulo">{MODELOS_DOCUMENTO[id].titulo}</span>
          <textarea
            name={id}
            className="campo font-serif"
            rows={8}
            defaultValue={c.data[id]}
            required
          />
        </label>
      ))}
      <Rodape salvando={salvar.isPending} texto="Salvar modelos" />
    </form>
  )
}

// ── Medicamentos e especialidades ───────────────────────────────────────────
function Medicamentos() {
  const c = useQuery(consultaConfig('medicamentos'))
  return c.data ? <ListaMedicamentos inicial={c.data} /> : <p className="text-suave">Carregando…</p>
}

function ListaMedicamentos({ inicial }: { inicial: Medicamento[] }) {
  const [lista, setLista] = useState(inicial)
  const [nome, setNome] = useState('')
  const [posologia, setPosologia] = useState('')
  const salvar = useSalvar('medicamentos', 'Medicamentos salvos')
  const gravar = (nova: Medicamento[]) => {
    setLista(nova)
    salvar.mutate(nova)
  }
  return (
    <section className="cartao max-w-3xl space-y-3">
      <p className="text-suave">Aparecem na receita, para inserir com a posologia padrão.</p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          gravar([...lista, { nome: nome.trim(), posologia: posologia.trim() }])
          setNome('')
          setPosologia('')
        }}
      >
        <label className="min-w-48 flex-1">
          <span className="rotulo">Medicamento</span>
          <input
            className="campo"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Amoxicilina 500 mg"
            required
          />
        </label>
        <label className="min-w-60 flex-[2]">
          <span className="rotulo">Posologia padrão</span>
          <input
            className="campo"
            value={posologia}
            onChange={(e) => setPosologia(e.target.value)}
            placeholder="Ex.: 1 cápsula de 8 em 8 horas por 7 dias"
          />
        </label>
        <button className="botao" disabled={salvar.isPending}>
          Adicionar
        </button>
      </form>
      {!lista.length && <p className="text-suave">Nenhum medicamento cadastrado.</p>}
      <ul className="divide-y divide-borda">
        {lista.map((m, i) => (
          <li key={i} className="flex items-center gap-2 py-2">
            <span className="flex-1">
              <strong>{m.nome}</strong> <span className="text-suave">{m.posologia}</span>
            </span>
            <button
              className="text-perigo hover:underline"
              onClick={() => gravar(lista.filter((_, k) => k !== i))}
            >
              Remover
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Especialidades() {
  const c = useQuery(consultaConfig('especialidades'))
  return c.data ? (
    <ListaEspecialidades inicial={c.data} />
  ) : (
    <p className="text-suave">Carregando…</p>
  )
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
    <section className="cartao max-w-xl space-y-3">
      <p className="text-suave">Sugeridas no cadastro de profissionais e de procedimentos.</p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          gravar([...lista, nova.trim()])
          setNova('')
        }}
      >
        <input
          className="campo"
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          aria-label="Nova especialidade"
          required
        />
        <button className="botao shrink-0" disabled={salvar.isPending}>
          Adicionar
        </button>
      </form>
      <ul className="divide-y divide-borda">
        {lista.map((e) => (
          <li key={e} className="flex items-center py-2">
            <span className="flex-1">{e}</span>
            <button
              className="text-perigo hover:underline"
              onClick={() => gravar(lista.filter((x) => x !== e))}
            >
              Remover
            </button>
          </li>
        ))}
      </ul>
    </section>
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
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="cartao space-y-3">
        <h2 className="font-semibold">E-mail da clínica</h2>
        {estado.data?.configurado ? (
          <p className="text-sucesso">
            Configurado: envia como {estado.data.remetente ?? '—'} ({estado.data.servidor}).
          </p>
        ) : (
          <p className="text-perigo">Ainda não configurado.</p>
        )}
        <p className="text-suave">
          O endereço e a senha ficam no arquivo <code>server/.env</code> do servidor (não nesta
          tela, por segurança): <code>SMTP_HOST</code>, <code>SMTP_PORTA</code>,{' '}
          <code>SMTP_USUARIO</code>, <code>SMTP_SENHA</code> e <code>EMAIL_REMETENTE</code>. No
          Gmail, a senha é uma “senha de app”.
        </p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            teste.mutate(String(new FormData(e.currentTarget).get('para')))
          }}
        >
          <div className="flex-1">
            <CampoEmail
              name="para"
              placeholder="Enviar teste para…"
              aria-label="E-mail para o teste"
              required
            />
          </div>
          <button className="botao shrink-0" disabled={teste.isPending}>
            Enviar teste
          </button>
        </form>
        <p className="text-suave">
          WhatsApp e SMS: preparados, mas desligados até a clínica contratar um provedor.
        </p>
      </section>

      <section className="cartao space-y-3">
        <h2 className="font-semibold">Texto da confirmação de consulta</h2>
        {c.data && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              salvar.mutate(Object.fromEntries(new FormData(e.currentTarget)))
            }}
          >
            <textarea
              name="confirmacao"
              className="campo"
              rows={6}
              defaultValue={c.data.confirmacao}
              required
              maxLength={1000}
            />
            <p className="text-suave">
              Variáveis: {VARIAVEIS_MENSAGEM.map((v) => `{${v}}`).join(' ')}. O {'{link}'} é
              obrigatório: é por ele que o paciente confirma.
            </p>
            <Rodape salvando={salvar.isPending} />
          </form>
        )}
      </section>
    </div>
  )
}
