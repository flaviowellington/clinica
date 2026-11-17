// Sala de espera: quem já chegou e há quanto tempo espera (painel da agenda, menu e ficha).
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import {
  api,
  consultaAgenda,
  consultaEu,
  consultaProfissionais,
  horaBR,
  isoLocal,
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

/**
 * Consultas de hoje com o paciente na espera, por ordem de chegada.
 * Só para o profissional da consulta: cada um vê as dele; quem não é profissional não vê nada.
 */
export function useNaEspera() {
  const { data: eu } = useSuspenseQuery(consultaEu)
  const ver = pode(eu.perfis, 'agenda.ver')
  const meuId = useQuery({ ...consultaProfissionais, enabled: ver }).data?.meuId ?? null
  const hoje = isoLocal(new Date())
  const { data } = useQuery({ ...consultaAgenda(hoje, hoje), enabled: ver && meuId !== null })
  const lista = (data ?? [])
    .filter(
      (a) =>
        a.status === 'EM_ESPERA' &&
        a.checkinEm &&
        a.paciente &&
        a.profissional.id === meuId,
    )
    .sort((a, b) => a.checkinEm!.localeCompare(b.checkinEm!))
  return { lista, podeChamar: pode(eu.perfis, 'agenda.editar') }
}

/** Cartão da agenda com quem está esperando. Some quando não há ninguém. */
export function SalaEspera() {
  const { lista, podeChamar } = useNaEspera()
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
        <Icone nome="direita" className="h-4 w-4 shrink-0 text-suave transition group-open:rotate-90" />
      </summary>
      <ul className="space-y-2 px-3 pb-3">
        {lista.map((a, i) => (
          <li
            key={a.id}
            className="flex items-center gap-2 rounded-xl p-2.5"
            style={{
              backgroundColor: `color-mix(in srgb, ${tomEspera(a.checkinEm!, agora)} 14%, var(--superficie))`,
            }}
          >
            <div className="min-w-0 flex-1 space-y-1">
              <Link
                to="/pacientes/$id"
                params={{ id: String(a.paciente!.id) }}
                className="block truncate font-extrabold text-titulo hover:underline"
              >
                {a.paciente!.nome}
              </Link>
              <p className="text-xs text-suave">
                Chegou {horaBR(a.checkinEm!)} · consulta {a.inicio}
              </p>
              <TempoEspera checkinEm={a.checkinEm!} />
            </div>
            {podeChamar && (
              <button
                type="button"
                className={`${i === 0 ? 'botao' : 'botao-leve'} min-h-11 shrink-0 px-3`}
                disabled={trocar.isPending}
                onClick={() => trocar.mutate({ id: a.id, status: 'EM_ATENDIMENTO' })}
              >
                Chamar
              </button>
            )}
          </li>
        ))}
      </ul>
    </details>
  )
}

/** Faixa no topo da ficha: só para o profissional da consulta de hoje. */
export function FaixaEspera({ pacienteId }: { pacienteId: number }) {
  const { lista, podeChamar } = useNaEspera()
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
          Na sala de espera há{' '}
          <TempoEspera checkinEm={a.checkinEm!} className="align-middle" />
        </p>
        <p className="text-sm text-suave">
          Chegou às {horaBR(a.checkinEm!)} · consulta com você às {a.inicio}
        </p>
      </div>
      {podeChamar && (
        <button
          type="button"
          className="botao min-h-11"
          disabled={trocar.isPending}
          onClick={() => trocar.mutate({ id: a.id, status: 'EM_ATENDIMENTO' })}
        >
          <Icone nome="iniciar" className="h-4 w-4" />
          Iniciar atendimento
        </button>
      )}
    </div>
  )
}
