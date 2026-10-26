// Anamnese: Atual e Histórico, respostas com alerta, obrigatórias (R-058, R-059, R-074, R-075).
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { api, consultaEu, dataBR, errosDosCampos, mensagemDeErro, type Paciente } from '../api'
import { avisar } from '../estado'
import { pode } from '../../../shared/permissoes'
import {
  LIMITE_OBSERVACAO,
  MODELO_ANAMNESE,
  alertasDaAnamnese,
  faltandoObrigatorias,
  type Pergunta,
} from '../../../shared/prontuario'
import { Dialogo } from './Dialogo'

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
function FormAnamnese(props: { paciente: Paciente; anamnese?: Anamnese; aoTerminar: () => void }) {
  const qc = useQueryClient()
  const a = props.anamnese
  const [respondente, setRespondente] = useState(a?.respondente ?? 'PROFISSIONAL')
  const [perguntas, setPerguntas] = useState<Pergunta[]>(
    a?.perguntas ?? MODELO_ANAMNESE.map((p) => ({ ...p, resposta: null, descricao: null })),
  )
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
  const faltando = new Set(faltandoObrigatorias(perguntas))
  const doServidor = errosDosCampos(salvar.error)

  return (
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
              <input type="radio" checked={respondente === r} onChange={() => setRespondente(r)} />
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
  )
}
