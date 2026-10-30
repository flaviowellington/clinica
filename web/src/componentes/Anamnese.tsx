// Anamnese: Atual e Histórico, respostas com alerta, obrigatórias (R-058, R-059, R-074, R-075).
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import {
  api,
  consultaConfig,
  consultaEu,
  dataBR,
  errosDosCampos,
  mensagemDeErro,
  type Paciente,
} from '../api'
import { avisar } from '../estado'
import { pode } from '../../../shared/permissoes'
import {
  LIMITE_OBSERVACAO,
  MODELO_ANAMNESE,
  alertasDaAnamnese,
  faltandoObrigatorias,
  type Pergunta,
} from '../../../shared/prontuario'
import type { ModeloAnamnese } from '../../../shared/configuracoes'
import { Dialogo } from './Dialogo'
import { EditorAnamnese } from '../paginas/Configuracoes'

interface Anamnese {
  id: number
  atual: boolean
  respondente: 'PACIENTE' | 'PROFISSIONAL'
  perguntas: Pergunta[]
  observacoes: string | null
  criadoEm: string
  alteradoEm: string
  criadoPor: { nome: string }
}

const RESPONDENTE = { PACIENTE: 'Paciente', PROFISSIONAL: 'Profissional' } as const
const OBRIGATORIAS = 'Preencha todas as respostas obrigatórias antes de continuar.'

export function Anamneses({ paciente }: { paciente: Paciente }) {
  const { data: eu } = useSuspenseQuery(consultaEu)
  const lista = useQuery({
    queryKey: ['anamneses', paciente.id],
    queryFn: async () => (await api.get<Anamnese[]>(`/pacientes/${paciente.id}/anamneses`)).data,
  })
  const [aberta, setAberta] = useState<Anamnese | 'nova' | null>(null)
  // Modelo padrão da clínica (Configurações > Anamnese) e os modelos extras.
  const padrao = useQuery(consultaConfig('anamnese')).data ?? MODELO_ANAMNESE
  const extras = useQuery(consultaConfig('modelosAnamnese')).data ?? []
  const modelos = [{ nome: 'Padrão da clínica', perguntas: padrao }, ...extras]
  const podeEditar = pode(eu.perfis, 'prontuario.editar')
  const atual = lista.data?.[0]
  const historico = lista.data?.slice(1) ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Anamnese</h2>
        {podeEditar && (
          <button className="botao py-1.5" onClick={() => setAberta('nova')}>
            Nova anamnese
          </button>
        )}
      </div>

      {lista.data?.length === 0 && (
        <p className="cartao text-suave">Este paciente ainda não tem anamnese.</p>
      )}
      {atual && (
        <VerAnamnese anamnese={atual} aoEditar={podeEditar ? () => setAberta(atual) : undefined} />
      )}

      {!!historico.length && (
        <section className="cartao space-y-2">
          <h3 className="font-semibold">Histórico</h3>
          {historico.map((a) => (
            <details key={a.id} className="rounded-md border border-borda p-3">
              <summary>
                Anamnese de {dataBR(a.criadoEm)} · respondida por {RESPONDENTE[a.respondente]}
              </summary>
              <div className="mt-3">
                <Respostas anamnese={a} />
              </div>
            </details>
          ))}
        </section>
      )}

      <Dialogo
        aberto={!!aberta}
        aoFechar={() => setAberta(null)}
        titulo={aberta === 'nova' ? 'Nova anamnese' : 'Editar anamnese'}
        largo
      >
        {aberta && (
          <FormAnamnese
            paciente={paciente}
            modelos={modelos}
            anamnese={aberta === 'nova' ? undefined : aberta}
            aoTerminar={() => setAberta(null)}
          />
        )}
      </Dialogo>
    </div>
  )
}

function VerAnamnese({ anamnese: a, aoEditar }: { anamnese: Anamnese; aoEditar?: () => void }) {
  const alertas = alertasDaAnamnese(a.perguntas)
  return (
    <section className="cartao space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">
            Atual{' '}
            <span className="font-normal text-suave">
              · criada em {dataBR(a.criadoEm)} por {a.criadoPor.nome} · respondida por{' '}
              {RESPONDENTE[a.respondente]}
            </span>
          </h3>
          {alertas.length > 0 && (
            <p className="text-perigo">{alertas.length} resposta(s) com alerta</p>
          )}
        </div>
        {aoEditar && (
          <button className="botao-leve py-1.5" onClick={aoEditar}>
            Editar
          </button>
        )}
      </div>
      <Respostas anamnese={a} />
    </section>
  )
}

function Respostas({ anamnese: a }: { anamnese: Anamnese }) {
  const alertas = new Set(alertasDaAnamnese(a.perguntas).map((p) => p.texto))
  return (
    <div className="space-y-2">
      <dl className="grid gap-x-6 gap-y-2 md:grid-cols-2">
        {a.perguntas.map((p) => (
          <div key={p.texto} className={alertas.has(p.texto) ? 'text-perigo' : ''}>
            <dt className={alertas.has(p.texto) ? '' : 'text-suave'}>{p.texto}</dt>
            <dd className="font-medium">
              {p.resposta || '—'}
              {p.descricao && <span className="font-normal"> · {p.descricao}</span>}
            </dd>
          </div>
        ))}
      </dl>
      {a.observacoes && (
        <p>
          <span className="text-suave">Observações:</span> {a.observacoes}
        </p>
      )}
    </div>
  )
}

/** Nada é gravado até "Salvar" (R-058). Editar altera a mesma; nova vira a Atual (R-075). */
const emBranco = (m: ModeloAnamnese) =>
  m.perguntas.map((p) => ({ ...p, resposta: null, descricao: null }))

function FormAnamnese(props: {
  paciente: Paciente
  anamnese?: Anamnese
  /** O primeiro é o padrão da clínica. */
  modelos: ModeloAnamnese[]
  aoTerminar: () => void
}) {
  const qc = useQueryClient()
  const { data: eu } = useSuspenseQuery(consultaEu)
  const a = props.anamnese
  const [respondente, setRespondente] = useState(a?.respondente ?? 'PROFISSIONAL')
  const [escolhido, setEscolhido] = useState(0)
  const [criando, setCriando] = useState(false)
  const [nomeModelo, setNomeModelo] = useState('')
  const [perguntas, setPerguntas] = useState<Pergunta[]>(a?.perguntas ?? emBranco(props.modelos[0]))
  const [observacoes, setObservacoes] = useState(a?.observacoes ?? '')
  const [tentou, setTentou] = useState(false)
  const mudar = (i: number, d: Partial<Pergunta>) =>
    setPerguntas(perguntas.map((p, k) => (k === i ? { ...p, ...d } : p)))

  const salvar = useMutation({
    mutationFn: async () => {
      const corpo = { respondente, perguntas, observacoes }
      return a
        ? (await api.put(`/prontuario/anamneses/${a.id}`, corpo)).data
        : (await api.post(`/pacientes/${props.paciente.id}/anamneses`, corpo)).data
    },
    onSuccess: () => {
      avisar('Anamnese salva')
      qc.invalidateQueries({ queryKey: ['anamneses', props.paciente.id] })
      qc.invalidateQueries({ queryKey: ['alertas', String(props.paciente.id)] })
      qc.invalidateQueries({ queryKey: ['resumo', props.paciente.id] })
      props.aoTerminar()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const usar = (i: number, modelos = props.modelos) => {
    if (
      i !== escolhido &&
      perguntas.some((p) => p.resposta || p.descricao) &&
      !confirm('Trocar de modelo apaga as respostas já preenchidas. Continuar?')
    )
      return
    setEscolhido(i)
    setPerguntas(emBranco(modelos[i]))
    setTentou(false)
  }

  // Modelo novo entra na lista de modelos da clínica e já passa a ser usado.
  const criarModelo = useMutation({
    mutationFn: async (novas: Pergunta[]) => {
      const lista = [...props.modelos.slice(1), { nome: nomeModelo, perguntas: novas }]
      return (await api.put<ModeloAnamnese[]>('/configuracoes/modelosAnamnese', lista)).data
    },
    onSuccess: (extras) => {
      qc.setQueryData(['config', 'modelosAnamnese'], extras)
      const modelos = [props.modelos[0], ...extras]
      setCriando(false)
      setNomeModelo('')
      setEscolhido(modelos.length - 1)
      setPerguntas(emBranco(modelos[modelos.length - 1]))
      avisar('Modelo criado')
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })

  const faltando = new Set(faltandoObrigatorias(perguntas))
  const doServidor = errosDosCampos(salvar.error)

  const seletor = !a && (
    <div className="space-y-2">
      <p className="rotulo">Modelo</p>
      <div role="tablist" aria-label="Modelo da anamnese" className="flex flex-wrap gap-2">
        {props.modelos.map((m, i) => (
          <button
            key={m.nome}
            type="button"
            role="tab"
            aria-selected={!criando && escolhido === i}
            className={`${!criando && escolhido === i ? 'botao' : 'botao-leve'} botao-pequeno`}
            onClick={() => {
              setCriando(false)
              usar(i)
            }}
          >
            {m.nome}
          </button>
        ))}
        {pode(eu.perfis, 'configuracao.editar') && (
          <button
            type="button"
            role="tab"
            aria-selected={criando}
            className={`${criando ? 'botao' : 'botao-fantasma'} botao-pequeno`}
            onClick={() => setCriando(true)}
          >
            + Novo modelo
          </button>
        )}
      </div>
    </div>
  )

  if (criando)
    return (
      <div className="space-y-4">
        {seletor}
        <EditorAnamnese
          inicial={[{ texto: '', tipo: 'SIM_NAO' }]}
          salvando={criarModelo.isPending}
          aoSalvar={(novas) => criarModelo.mutate(novas)}
          aoCancelar={() => setCriando(false)}
        >
          <label className="block">
            <span className="rotulo">Nome do modelo</span>
            <input
              className="campo"
              value={nomeModelo}
              maxLength={80}
              required
              placeholder="Ex.: Ortodontia, Infantil, Cirurgia"
              onChange={(e) => setNomeModelo(e.target.value)}
            />
          </label>
        </EditorAnamnese>
      </div>
    )

  return (
    <div className="space-y-4">
      {seletor}
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          setTentou(true)
          if (faltando.size) return avisar(OBRIGATORIAS, true)
          salvar.mutate()
        }}
      >
        {!a && (
          <fieldset className="flex flex-wrap gap-4">
            <legend className="rotulo">Quem responde</legend>
            {(['PROFISSIONAL', 'PACIENTE'] as const).map((r) => (
              <label key={r} className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={respondente === r}
                  onChange={() => setRespondente(r)}
                />
                {RESPONDENTE[r]}
              </label>
            ))}
          </fieldset>
        )}

        {tentou && faltando.size > 0 && (
          <p role="alert" className="text-perigo">
            {OBRIGATORIAS}
          </p>
        )}

        <ol className="space-y-3">
          {perguntas.map((p, i) => {
            const erro = (tentou && faltando.has(i)) || doServidor[i]
            const nome = `pergunta-${i}`
            return (
              <li key={p.texto} className="rounded-md border border-borda p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p id={`${nome}-texto`} className="font-medium">
                    {p.texto}
                    {p.obrigatoria && <span className="text-perigo"> *</span>}
                  </p>
                  <label
                    className="flex items-center gap-2 text-suave"
                    title="Resposta vira alerta do paciente"
                  >
                    <input
                      type="checkbox"
                      checked={!!p.alerta}
                      onChange={(e) => mudar(i, { alerta: e.target.checked })}
                    />
                    Alerta
                  </label>
                </div>
                <div className="mt-2" role="group" aria-labelledby={`${nome}-texto`}>
                  {p.tipo === 'DESCRITIVA' ? (
                    <textarea
                      className="campo"
                      rows={2}
                      maxLength={LIMITE_OBSERVACAO}
                      value={p.resposta ?? ''}
                      aria-labelledby={`${nome}-texto`}
                      onChange={(e) => mudar(i, { resposta: e.target.value })}
                    />
                  ) : (
                    <div className="flex flex-wrap items-center gap-4">
                      {(p.tipo === 'SIM_NAO' ? ['Sim', 'Não'] : (p.opcoes ?? [])).map((o) => (
                        <label key={o} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={nome}
                            checked={p.resposta === o}
                            onChange={() => mudar(i, { resposta: o })}
                          />
                          {o}
                        </label>
                      ))}
                      {p.tipo === 'SIM_NAO' && (
                        <input
                          className="campo min-w-48 flex-1 py-1"
                          placeholder="Detalhes"
                          aria-label={`Detalhes: ${p.texto}`}
                          maxLength={LIMITE_OBSERVACAO}
                          value={p.descricao ?? ''}
                          onChange={(e) => mudar(i, { descricao: e.target.value })}
                        />
                      )}
                    </div>
                  )}
                </div>
                {erro && <p className="mt-1 text-perigo">Preenchimento obrigatório</p>}
              </li>
            )
          })}
        </ol>

        <label className="block">
          <span className="rotulo">Observações</span>
          <textarea
            className="campo"
            rows={3}
            maxLength={LIMITE_OBSERVACAO}
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
          />
        </label>

        <div className="flex justify-end gap-2">
          <button type="button" className="botao-leve" onClick={props.aoTerminar}>
            Cancelar
          </button>
          <button className="botao" disabled={salvar.isPending}>
            Salvar
          </button>
        </div>
      </form>
    </div>
  )
}
