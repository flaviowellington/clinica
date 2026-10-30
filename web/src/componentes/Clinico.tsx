// Odontograma, Plano e Ficha Clínica e Fichas de Especialidade (R-019, R-061, R-068, R-069, R-078).
import { useState } from 'react'
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
import { DENTES_DECIDUOS, DENTES_PERMANENTES } from '../../../shared/orcamentos'
import {
  DENTES_VALIDOS,
  ESPECIALIDADES_FICHA,
  FACES,
  LIMITE_OBSERVACAO,
  STATUS_DENTE_FICHA,
  denteComFaces,
} from '../../../shared/prontuario'
import { Dialogo } from './Dialogo'
import { CampoData } from './CampoData'
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
}

const STATUS: Record<Status, { rotulo: string; classe: string; cor: string }> = {
  A_REALIZAR: {
    rotulo: 'A realizar',
    classe: 'bg-aviso/15 text-aviso',
    cor: '#d97706',
  },
  EXECUTADO: {
    rotulo: 'Executado',
    classe: 'bg-info/15 text-info',
    cor: '#0284c7',
  },
  EXISTENTE: { rotulo: 'Existente', classe: 'bg-suave/15 text-suave', cor: '#6b7280' },
}
// Ao pintar o dente, "A realizar" vence "Executado", que vence "Existente".
const PRIORIDADE: Status[] = ['A_REALIZAR', 'EXECUTADO', 'EXISTENTE']

const chaveProcedimentos = (id: number) => ['procedimentos', id]

function useProcedimentos(pacienteId: number) {
  return useQuery({
    queryKey: chaveProcedimentos(pacienteId),
    queryFn: async () =>
      (await api.get<ItemClinico[]>(`/pacientes/${pacienteId}/procedimentos`)).data,
  })
}

function Selo({ status }: { status: Status }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[status].classe}`}>
      {STATUS[status].rotulo}
    </span>
  )
}

// ── Odontograma ─────────────────────────────────────────────────────────────
export function Odontograma({ paciente }: { paciente: Paciente }) {
  const { data: eu } = useSuspenseQuery(consultaEu)
  const lista = useProcedimentos(paciente.id)
  const [dente, setDente] = useState<string | null>(null)
  const [dialogo, setDialogo] = useState<{ item?: ItemClinico; dente?: string } | null>(null)
  const podeEditar = pode(eu.perfis, 'prontuario.editar')

  const porDente = new Map<string, Set<Status>>()
  for (const i of lista.data ?? [])
    if (i.dente) porDente.set(i.dente, (porDente.get(i.dente) ?? new Set()).add(i.status))
  const visiveis = (lista.data ?? []).filter((i) => !dente || i.dente === dente)

  const linha = (dentes: number[], pequeno = false) => (
    <div className="flex justify-center gap-1">
      {dentes.map((n, k) => {
        const d = String(n)
        const status = PRIORIDADE.find((s) => porDente.get(d)?.has(s))
        return (
          <button
            key={n}
            type="button"
            aria-label={`Dente ${d}`}
            aria-pressed={dente === d}
            title={podeEditar ? 'Clique para filtrar; dois cliques para adicionar' : undefined}
            onClick={() => setDente(dente === d ? null : d)}
            onDoubleClick={() => podeEditar && setDialogo({ dente: d })}
            className={`flex shrink-0 flex-col items-center rounded-md border-2 ${pequeno ? 'w-7 text-xs' : 'w-9'} ${k === dentes.length / 2 ? 'ml-3' : ''} ${dente === d ? 'border-primaria bg-primaria-clara' : 'border-borda hover:border-primaria'}`}
          >
            <span
              className={`mt-1 block rounded-full border border-borda ${pequeno ? 'size-4' : 'size-6'}`}
              style={{ background: status ? STATUS[status].cor : undefined }}
            />
            <span className="py-0.5">{d}</span>
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="space-y-4">
      <section className="cartao space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Odontograma</h2>
          <div className="flex flex-wrap items-center gap-3">
            {PRIORIDADE.map((s) => (
              <span key={s} className="flex items-center gap-1 text-suave">
                <span className="size-3 rounded-full" style={{ background: STATUS[s].cor }} />
                {STATUS[s].rotulo}
              </span>
            ))}
            {podeEditar && (
              <button
                className="botao py-1.5"
                onClick={() => setDialogo({ dente: dente ?? undefined })}
              >
                Adicionar procedimento
              </button>
            )}
          </div>
        </div>
        <div className="space-y-2 overflow-x-auto pb-1">
          {linha(DENTES_PERMANENTES[0])}
          {linha(DENTES_PERMANENTES[1])}
          <div className="h-2" />
          {linha(DENTES_DECIDUOS[0], true)}
          {linha(DENTES_DECIDUOS[1], true)}
        </div>
      </section>

      <section className="cartao space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">
            {dente ? `Procedimentos do dente ${dente}` : 'Todos os procedimentos'}
          </h2>
          {dente && (
            <button className="text-primaria hover:underline" onClick={() => setDente(null)}>
              Ver todos
            </button>
          )}
        </div>
        {lista.isPending && <p className="text-suave">Carregando…</p>}
        {lista.data && !visiveis.length && (
          <p className="text-suave">
            Nenhum procedimento ainda.
            {podeEditar && ' Use “Adicionar procedimento” ou dê dois cliques num dente.'}
          </p>
        )}
        {!!visiveis.length && (
          <TabelaProcedimentos
            paciente={paciente}
            itens={visiveis}
            aoEditar={(item) => setDialogo({ item })}
          />
        )}
      </section>

      <Dialogo
        aberto={!!dialogo}
        aoFechar={() => setDialogo(null)}
        titulo={dialogo?.item ? 'Editar procedimento' : 'Adicionar procedimento'}
        largo
      >
        {dialogo && (
          <FormProcedimento
            paciente={paciente}
            item={dialogo.item}
            dente={dialogo.dente}
            aoTerminar={() => setDialogo(null)}
          />
        )}
      </Dialogo>
    </div>
  )
}

/** Lista do odontograma e da ficha clínica: "16MO", procedimento, status e ações. */
function TabelaProcedimentos(props: {
  paciente: Paciente
  itens: ItemClinico[]
  aoEditar: (i: ItemClinico) => void
  comObservacoes?: boolean
}) {
  const { data: eu } = useSuspenseQuery(consultaEu)
  const qc = useQueryClient()
  const atualizar = () => {
    qc.invalidateQueries({ queryKey: chaveProcedimentos(props.paciente.id) })
    qc.invalidateQueries({ queryKey: ['orcamentos', props.paciente.id] })
  }
  const excluir = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/prontuario/procedimentos/${id}`)).data,
    onSuccess: () => {
      avisar('Procedimento excluído')
      atualizar()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const executar = useMutation({
    mutationFn: async (id: number) => (await api.post(`/orcamentos/itens/${id}/executar`)).data,
    onSuccess: () => {
      avisar('Procedimento atualizado')
      atualizar()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const podeEditar = pode(eu.perfis, 'prontuario.editar')
  const podeExecutar = pode(eu.perfis, 'procedimento.executar')
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead className="border-b border-borda text-suave">
          <tr>
            {['Data', 'Dente', 'Procedimento', 'Situação', 'Profissional', ''].map((t) => (
              <th key={t} className="px-3 py-2 font-medium">
                {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.itens.map((i) => (
            <tr
              key={`${i.origem}-${i.id}`}
              className="border-b border-borda align-top last:border-0"
            >
              <td className="px-3 py-2 whitespace-nowrap">{dataBR(i.data)}</td>
              <td className="px-3 py-2 font-medium">{denteComFaces(i.dente, i.faces) || '—'}</td>
              <td className="px-3 py-2">
                {i.nome}
                {i.orcamentoId && (
                  <span className="block text-xs text-suave">Orçamento nº {i.orcamentoId}</span>
                )}
                {props.comObservacoes && i.observacao && (
                  <span className="block text-xs text-suave">Interna: {i.observacao}</span>
                )}
                {props.comObservacoes && i.observacaoPaciente && (
                  <span className="block text-xs text-suave">
                    Ao paciente: {i.observacaoPaciente}
                  </span>
                )}
              </td>
              <td className="px-3 py-2">
                <Selo status={i.status} />
              </td>
              <td className="px-3 py-2">{i.profissional.nome}</td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                {i.origem === 'CLINICO' && podeEditar && (
                  <>
                    <button
                      className="text-primaria hover:underline"
                      onClick={() => props.aoEditar(i)}
                    >
                      Editar
                    </button>{' '}
                    <button
                      className="ml-2 text-perigo hover:underline"
                      disabled={excluir.isPending}
                      onClick={async () =>
                        (await confirmar(
                          `Excluir "${i.nome}" do prontuário? Ele sai da lista, mas fica no histórico.`,
                        )) && excluir.mutate(i.id)
                      }
                    >
                      Excluir
                    </button>
                  </>
                )}
                {i.origem === 'ORCAMENTO' && podeExecutar && (
                  <button
                    className="text-primaria hover:underline"
                    disabled={executar.isPending}
                    onClick={() => executar.mutate(i.id)}
                  >
                    {i.status === 'A_REALIZAR' ? 'Marcar executado' : 'Desfazer execução'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface Procedimento {
  id: number
  nome: string
}

/** Diálogo "Adicionar procedimento": vai direto ao prontuário, sem cobrança (R-061). */
function FormProcedimento(props: {
  paciente: Paciente
  item?: ItemClinico
  dente?: string
  aoTerminar: () => void
}) {
  const qc = useQueryClient()
  const { data: prof } = useQuery(consultaProfissionais)
  const i = props.item
  const [nome, setNome] = useState(i?.nome ?? '')
  const [profissionalId, setProfissionalId] = useState<number | ''>(
    i?.profissional.id ?? prof?.meuId ?? '',
  )
  const [status, setStatus] = useState(i?.status ?? 'EXECUTADO')
  const [dente, setDente] = useState(i?.dente ?? props.dente ?? '')
  const [faces, setFaces] = useState(i?.faces ?? '')
  const [data, setData] = useState(i?.data ?? isoLocal(new Date()))
  const [observacao, setObservacao] = useState(i?.observacao ?? '')
  const [observacaoPaciente, setObservacaoPaciente] = useState(i?.observacaoPaciente ?? '')
  const tabela = useQuery({
    queryKey: ['procedimentos-tabela', nome],
    queryFn: async () =>
      (await api.get<Procedimento[]>('/procedimentos', { params: { busca: nome } })).data,
    enabled: !i,
  })
  const salvar = useMutation({
    mutationFn: async () => {
      const achado = tabela.data?.find((t) => t.nome === nome)
      const corpo = {
        procedimentoId: achado?.id ?? (i && nome === i.nome ? i.procedimentoId : null),
        nome,
        profissionalId,
        status,
        dente,
        faces,
        data,
        observacao,
        observacaoPaciente,
      }
      return i
        ? (await api.put(`/prontuario/procedimentos/${i.id}`, corpo)).data
        : (await api.post(`/pacientes/${props.paciente.id}/procedimentos`, corpo)).data
    },
    onSuccess: () => {
      avisar(i ? 'Procedimento atualizado' : 'Procedimento adicionado ao prontuário')
      qc.invalidateQueries({ queryKey: chaveProcedimentos(props.paciente.id) })
      props.aoTerminar()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const erros = errosDosCampos(salvar.error)
  const erro = (c: string) => erros[c] && <p className="mt-1 text-perigo">{erros[c]}</p>
  const denteValido = DENTES_VALIDOS.has(dente)

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
        {(['EXECUTADO', 'EXISTENTE'] as const).map((s) => (
          <label key={s} className="flex items-center gap-2">
            <input type="radio" checked={status === s} onChange={() => setStatus(s)} />
            {STATUS[s].rotulo}
          </label>
        ))}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-3">
        <label>
          <span className="rotulo">Dente (opcional)</span>
          <CampoSugestoes
            sugestoes={LISTA_DENTES}
            inputMode="numeric"
            value={dente}
            onChange={(v) => setDente(v.trim())}
            placeholder="Ex.: 16"
          />
          {erro('dente')}
        </label>
        <fieldset disabled={!denteValido}>
          <legend className="rotulo">Faces</legend>
          <div className="flex gap-2 pt-1">
            {FACES.map((f) => (
              <label key={f} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={faces.includes(f)}
                  onChange={(e) => setFaces(e.target.checked ? faces + f : faces.replace(f, ''))}
                />
                {f}
              </label>
            ))}
          </div>
        </fieldset>
        <label>
          <span className="rotulo">Data</span>
          <CampoData value={data} onChange={setData} />
          {erro('data')}
        </label>
      </div>

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

      <div className="flex justify-end gap-2">
        <button type="button" className="botao-leve" onClick={props.aoTerminar}>
          Cancelar
        </button>
        <button className="botao" disabled={!nome.trim() || !profissionalId || salvar.isPending}>
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
  const [dialogo, setDialogo] = useState<{ item?: ItemClinico } | null>(null)
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
          <TabelaProcedimentos paciente={paciente} itens={aFazer} aoEditar={() => {}} />
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
            itens={executados}
            aoEditar={(item) => setDialogo({ item })}
            comObservacoes
          />
        )}
      </section>

      <Dialogo
        aberto={!!dialogo}
        aoFechar={() => setDialogo(null)}
        titulo={dialogo?.item ? 'Editar procedimento' : 'Adicionar procedimento'}
        largo
      >
        {dialogo && (
          <FormProcedimento
            paciente={paciente}
            item={dialogo.item}
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
