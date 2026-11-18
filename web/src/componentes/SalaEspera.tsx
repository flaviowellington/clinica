// Sala de espera: quem já chegou e há quanto tempo espera (painel da agenda, menu e ficha).
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import {
  api,
  consultaEspera,
  consultaEu,
  consultaProfissionais,
  horaBR,
  mensagemDeErro,
  type Agendamento,
} from '../api'
import { avisar, useAgora } from '../estado'
import { pode } from '../../../shared/permissoes'
import { ESPERA_LONGA, minutosDeEspera, type StatusAgenda } from '../../../shared/agenda'
import { Icone } from './Icones'

/** Cor da espera: âmbar, e vermelho a partir de ESPERA_LONGA. */
export const tomEspera = (checkinEm: string, agora: Date) =>
  minutosDeEspera(checkinEm, agora) >= ESPERA_LONGA ? 'var(--perigo)' : 'var(--aviso)'

/** Etiqueta "⏱ 12 min", que anda sozinha. */
export function TempoEspera(props: { checkinEm: string; antes?: string; className?: string }) {
  const agora = useAgora()
  return (
    <span
      className={`inline-flex w-fit shrink-0 items-center gap-1 rounded-full px-2 text-xs leading-5 font-extrabold whitespace-nowrap text-superficie tabular-nums ${props.className ?? ''}`}
      style={{ backgroundColor: tomEspera(props.checkinEm, agora) }}
    >
      <Icone nome="relogio" className="size-3.5" />
      {props.antes}
      {minutosDeEspera(props.checkinEm, agora)} min
    </span>
  )
}

/** Troca o status e já atualiza a lista em memória (reabrir antes de recarregar mostra o novo). */
export function useTrocarStatus(aoTerminar?: () => void) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: number; status: StatusAgenda }) =>
      (await api.patch<Agendamento>(`/agenda/${v.id}/status`, { status: v.status })).data,
    onSuccess: (novo) => {
      qc.setQueriesData<unknown>({ queryKey: ['agenda'] }, (l: unknown) =>
        Array.isArray(l) ? l.map((x: Agendamento) => (x.id === novo.id ? novo : x)) : l,
      )
      avisar('Status atualizado')
      qc.invalidateQueries({ queryKey: ['agenda'] })
      qc.invalidateQueries({ queryKey: ['agendamentos-paciente'] })
      aoTerminar?.()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
}

/** O profissional chama da espera: a recepção é avisada e confirma (useChamadosPendentes). */
export function useChamar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => (await api.post<Agendamento>(`/agenda/${id}/chamar`)).data,
    onSuccess: (novo) => {
      qc.setQueriesData<unknown>({ queryKey: ['agenda'] }, (l: unknown) =>
        Array.isArray(l) ? l.map((x: Agendamento) => (x.id === novo.id ? novo : x)) : l,
      )
      avisar('Recepção avisada')
      qc.invalidateQueries({ queryKey: ['agenda'] })
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
}

/** Recepção: chamados de hoje que ainda não confirmou, do mais antigo para o mais novo. */
export function useChamadosPendentes() {
  const { data: eu } = useSuspenseQuery(consultaEu)
  const ver = eu.perfis.includes('RECEPCAO') && pode(eu.perfis, 'agenda.ver')
  const { data } = useQuery({ ...consultaEspera, enabled: ver })
  // `enabled` só evita a busca: o cache é o mesmo da sala do profissional.
  if (!ver) return []
  return (data ?? [])
    .filter((a) => a.status === 'EM_ESPERA' && a.chamadoEm && a.paciente)
    .sort((a, b) => a.chamadoEm!.localeCompare(b.chamadoEm!))
}

/** Aviso fixo da recepção: "Fulano chamou Beltrano" até confirmar que encaminhou. */
export function ChamadosRecepcao() {
  const lista = useChamadosPendentes()
  const trocar = useTrocarStatus()
  if (!lista.length) return null
  return (
    <div
      role="alert"
      className="fixed inset-x-4 top-4 z-40 space-y-2 md:inset-x-auto md:right-4 md:w-96"
    >
      {lista.map((a) => (
        <div key={a.id} className="cartao flex flex-col gap-3 border-2 border-aviso shadow-lg">
          <p className="flex items-start gap-2">
            <Icone nome="relogio" className="mt-0.5 h-5 w-5 shrink-0 text-aviso" />
            <span className="min-w-0">
              <span className="block font-extrabold text-titulo">
                {a.profissional.nome} chamou {a.paciente!.nome}
              </span>
              <span className="block text-sm text-suave">
                Encaminhe o paciente · chamado às {horaBR(a.chamadoEm!)}
              </span>
            </span>
          </p>
          <button
            type="button"
            className="botao min-h-11"
            disabled={trocar.isPending}
            onClick={() => trocar.mutate({ id: a.id, status: 'EM_ATENDIMENTO' })}
          >
            Confirmar que chamei
          </button>
        </div>
      ))}
    </div>
  )
}

/**
 * Pacientes que chegaram hoje (consulta de qualquer dia) e esperam, por ordem de chegada.
 * Só para o profissional da consulta: cada um vê as dele; quem não é profissional não vê nada.
 */
export function useNaEspera() {
  const { data: eu } = useSuspenseQuery(consultaEu)
  const ver = pode(eu.perfis, 'agenda.ver')
  const meuId = useQuery({ ...consultaProfissionais, enabled: ver }).data?.meuId ?? null
  const { data } = useQuery({ ...consultaEspera, enabled: ver && meuId !== null })
  const lista = (data ?? [])
    .filter(
      (a) => a.status === 'EM_ESPERA' && a.checkinEm && a.paciente && a.profissional.id === meuId,
    )
    .sort((a, b) => a.checkinEm!.localeCompare(b.checkinEm!))
  return { lista, podeChamar: pode(eu.perfis, 'agenda.editar') }
}

/** Cartão da agenda com quem está esperando. Some quando não há ninguém. */
export function SalaEspera() {
  const { lista, podeChamar } = useNaEspera()
  const chamar = useChamar()
  const trocar = useTrocarStatus()
  // Celular: começa recolhido, para a grade aparecer na primeira tela.
  const [aberto, setAberto] = useState(() => matchMedia('(min-width: 1024px)').matches)
  const agora = useAgora()
  if (!lista.length) return null
  return (
    <details
      open={aberto}
      onToggle={(e) => setAberto(e.currentTarget.open)}
      className="cartao group border-2 border-aviso p-0"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
        <Icone nome="relogio" className="h-5 w-5 shrink-0 text-aviso" />
        <span className="min-w-0 flex-1">
          <span className="font-extrabold text-titulo">Sua sala de espera</span>
          <span className="block text-xs text-suave group-open:hidden">
            Mais antigo há {minutosDeEspera(lista[0].checkinEm!, agora)} min
          </span>
        </span>
        <span className="rounded-full bg-aviso px-2 text-sm font-extrabold text-superficie tabular-nums">
          {lista.length}
        </span>
        <Icone
          nome="direita"
          className="h-4 w-4 shrink-0 text-suave transition group-open:rotate-90"
        />
      </summary>
      <ul className="space-y-2 px-3 pb-3">
        {lista.map((a, i) => (
          <li
            key={a.id}
            className="flex flex-col gap-2 rounded-xl p-2.5"
            style={{
              backgroundColor: `color-mix(in srgb, ${tomEspera(a.checkinEm!, agora)} 14%, var(--superficie))`,
            }}
          >
            {/* Nome inteiro (quebra linha); ações no pé do cartão. */}
            <div className="min-w-0 space-y-1">
              <Link
                to="/pacientes/$id"
                params={{ id: String(a.paciente!.id) }}
                className="block font-extrabold break-words text-titulo hover:underline"
              >
                {a.paciente!.nome}
              </Link>
              <p className="text-xs text-suave">
                Chegou {horaBR(a.checkinEm!)} · consulta {a.inicio}
              </p>
              <TempoEspera checkinEm={a.checkinEm!} />
            </div>
            {a.chamadoEm ? (
              // Chamou e prefere ir buscar: confirma ele mesmo, sem esperar a recepção.
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex-1 text-xs font-bold text-suave">Aguardando recepção</span>
                {podeChamar && (
                  <button
                    type="button"
                    className="botao-leve botao-pequeno"
                    disabled={trocar.isPending}
                    onClick={() => trocar.mutate({ id: a.id, status: 'EM_ATENDIMENTO' })}
                  >
                    Eu chamei
                  </button>
                )}
              </div>
            ) : (
              podeChamar && (
                // "Chamar" passa pela recepção; "Eu vou chamar" já começa o atendimento.
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="botao-leve botao-pequeno flex-1"
                    disabled={trocar.isPending}
                    onClick={() => trocar.mutate({ id: a.id, status: 'EM_ATENDIMENTO' })}
                  >
                    Eu vou chamar
                  </button>
                  <button
                    type="button"
                    className={`${i === 0 ? 'botao' : 'botao-leve'} botao-pequeno flex-1`}
                    disabled={chamar.isPending}
                    onClick={() => chamar.mutate(a.id)}
                  >
                    Chamar
                  </button>
                </div>
              )
            )}
          </li>
        ))}
      </ul>
    </details>
  )
}

/** Faixa no topo da ficha: só para o profissional da consulta. */
export function FaixaEspera({ pacienteId }: { pacienteId: number }) {
  const { lista, podeChamar } = useNaEspera()
  const chamar = useChamar()
  const trocar = useTrocarStatus()
  const a = lista.find((x) => x.paciente!.id === pacienteId)
  if (!a) return null
  return (
    <div
      role="status"
      className="mx-4 mb-4 flex flex-wrap items-center gap-3 rounded-2xl border-2 border-aviso bg-aviso/10 px-4 py-3"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-aviso text-superficie">
        <Icone nome="relogio" />
      </span>
      <div className="min-w-0 flex-[1_1_14rem]">
        <p className="font-extrabold text-titulo">
          Na sala de espera há <TempoEspera checkinEm={a.checkinEm!} className="align-middle" />
        </p>
        <p className="text-sm text-suave">
          Chegou às {horaBR(a.checkinEm!)} · consulta com você às {a.inicio}
        </p>
      </div>
      {a.chamadoEm ? (
        <>
          <span className="text-sm font-bold text-suave">Chamado · aguardando recepção</span>
          {podeChamar && (
            <button
              type="button"
              className="botao-leve min-h-11"
              disabled={trocar.isPending}
              onClick={() => trocar.mutate({ id: a.id, status: 'EM_ATENDIMENTO' })}
            >
              Eu chamei
            </button>
          )}
        </>
      ) : (
        podeChamar && (
          <>
            <button
              type="button"
              className="botao min-h-11"
              disabled={chamar.isPending}
              onClick={() => chamar.mutate(a.id)}
            >
              <Icone nome="iniciar" className="h-4 w-4" />
              Chamar paciente
            </button>
            <button
              type="button"
              className="botao-leve min-h-11"
              disabled={trocar.isPending}
              onClick={() => trocar.mutate({ id: a.id, status: 'EM_ATENDIMENTO' })}
            >
              Eu vou chamar
            </button>
          </>
        )
      )}
    </div>
  )
}
