import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, dataBR, horaBR, mensagemDeErro, type Agendamento } from '../api'
import { avisar } from '../estado'
import { COM_CHECKIN, STATUS, type StatusAgenda } from '../../../shared/agenda'
import { CampoSelect } from './CampoSelect'

/** Detalhes de um agendamento: status, check-in e excluir (C-005). */
export function CartaoConsulta(props: {
  a: Agendamento
  podeEditar: boolean
  aoFechar: () => void
}) {
  const { a } = props
  const qc = useQueryClient()
  const [confirmando, setConfirmando] = useState(false)
  const [desmarcando, setDesmarcando] = useState(false)
  const atualizar = () => qc.invalidateQueries({ queryKey: ['agenda'] })

  const status = useMutation({
    mutationFn: async (s: StatusAgenda) =>
      (await api.patch<Agendamento>(`/agenda/${a.id}/status`, { status: s })).data,
    onSuccess: (novo) => {
      // Já troca na lista em memória: reabrir antes de a agenda recarregar mostra o status novo.
      qc.setQueriesData<unknown>({ queryKey: ['agenda'] }, (l: unknown) =>
        Array.isArray(l) ? l.map((x: Agendamento) => (x.id === novo.id ? novo : x)) : l,
      )
      avisar('Status atualizado')
      atualizar()
      props.aoFechar()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const excluir = useMutation({
    mutationFn: async () => (await api.delete(`/agenda/${a.id}`)).data,
    onSuccess: () => {
      avisar('Agendamento excluído')
      atualizar()
      props.aoFechar()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const desmarcar = useMutation({
    mutationFn: async (motivo: string) =>
      (await api.post(`/agenda/${a.id}/desmarcar`, { motivo })).data,
    onSuccess: () => {
      avisar('Consulta desmarcada')
      atualizar()
      props.aoFechar()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const chegou = COM_CHECKIN.includes(a.status)
  const nome = a.paciente?.nome ?? a.titulo ?? 'Compromisso'

  if (desmarcando)
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          desmarcar.mutate(String(new FormData(e.currentTarget).get('motivo') ?? ''))
        }}
      >
        <p>
          Desmarcar a consulta de <strong>{nome}</strong>? O horário fica livre e a desmarcação
          aparece no relatório.
        </p>
        <label className="block">
          <span className="rotulo">Motivo</span>
          <input
            name="motivo"
            className="campo"
            placeholder="Ex.: paciente pediu para remarcar"
            autoFocus
          />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className="botao-leve" onClick={() => setDesmarcando(false)}>
            Voltar
          </button>
          <button className="botao" disabled={desmarcar.isPending}>
            Desmarcar
          </button>
        </div>
      </form>
    )

  if (confirmando)
    return (
      <div className="space-y-4">
        <p>
          Excluir {a.tipo === 'CONSULTA' ? 'a consulta de' : 'o compromisso'}{' '}
          <strong>{nome}</strong>? Isso não pode ser desfeito.
        </p>
        <div className="flex justify-end gap-2">
          <button className="botao-leve" onClick={() => setConfirmando(false)}>
            Voltar
          </button>
          <button
            className="botao-perigo"
            disabled={excluir.isPending}
            onClick={() => excluir.mutate()}
          >
            Excluir
          </button>
        </div>
      </div>
    )

  return (
    <div className="space-y-3">
      <div>
        <p className="text-lg font-semibold">{nome}</p>
        {a.paciente?.celular && <p className="text-suave">{a.paciente.celular}</p>}
        {a.paciente && (
          <Link
            to="/pacientes/$id"
            params={{ id: String(a.paciente.id) }}
            className="text-primaria"
          >
            Abrir prontuário
          </Link>
        )}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-suave">Quando</dt>
        <dd>
          {dataBR(a.data)}, {a.inicio}–{a.fim}
        </dd>
        <dt className="text-suave">Profissional</dt>
        <dd>{a.profissional.nome}</dd>
        {a.categoria && (
          <>
            <dt className="text-suave">Categoria</dt>
            <dd>{a.categoria}</dd>
          </>
        )}
        {a.primeiraConsulta && (
          <>
            <dt className="text-suave">Primeira consulta</dt>
            <dd>Sim</dd>
          </>
        )}
        {a.observacoes && (
          <>
            <dt className="text-suave">Observações</dt>
            <dd className="whitespace-pre-wrap">{a.observacoes}</dd>
          </>
        )}
        {a.checkinEm && (
          <>
            <dt className="text-suave">Chegou às</dt>
            <dd>{horaBR(a.checkinEm)}</dd>
          </>
        )}
      </dl>
      <p className="text-suave">
        Marcado por {a.criadoPor.nome} em {dataBR(a.criadoEm)} às {horaBR(a.criadoEm)}
      </p>

      {a.tipo === 'CONSULTA' && (
        <div>
          <label className="rotulo" htmlFor="status">
            Status
          </label>
          <CampoSelect
            id="status"
            value={a.status}
            disabled={!props.podeEditar || status.isPending}
            onChange={(e) => status.mutate(e.target.value as StatusAgenda)}
            vazio={false}
            opcoes={Object.entries(STATUS).map(([v, s]) => [v, s.rotulo] as const)}
          />
        </div>
      )}

      {props.podeEditar && (
        <div className="flex items-center justify-end gap-3">
          {chegou && (
            <span className="text-suave">
              O paciente já chegou: não dá para desmarcar nem excluir.
            </span>
          )}
          {a.tipo === 'CONSULTA' && (
            <button className="botao-leve" disabled={chegou} onClick={() => setDesmarcando(true)}>
              Desmarcar
            </button>
          )}
          <button
            className="botao-leve text-perigo"
            disabled={chegou}
            onClick={() => setConfirmando(true)}
          >
            Excluir
          </button>
        </div>
      )}
    </div>
  )
}
