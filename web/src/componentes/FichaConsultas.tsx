// Abas de consulta da ficha: Agendamentos e Indicações do paciente.
import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { api, dataBR, type Paciente } from '../api'
import { STATUS } from '../../../shared/agenda'
import type { StatusAgenda } from '../../../shared/agenda'

function Tabela(props: { colunas: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead className="border-b border-borda text-suave">
          <tr>
            {props.colunas.map((t) => (
              <th key={t} className="px-3 py-2 font-medium">
                {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{props.children}</tbody>
      </table>
    </div>
  )
}
const linha = 'border-b border-borda last:border-0'
const celula = 'px-3 py-2'

interface AgendamentoPaciente {
  id: number
  data: string
  inicio: string
  fim: string
  status: StatusAgenda
  categoria: string | null
  observacoes: string | null
  desmarcadoEm: string | null
  motivoDesmarcacao: string | null
  profissional: { nome: string }
}

export function AgendamentosPaciente({ paciente }: { paciente: Paciente }) {
  const lista = useQuery({
    queryKey: ['agendamentos-paciente', paciente.id],
    queryFn: async () =>
      (await api.get<AgendamentoPaciente[]>(`/pacientes/${paciente.id}/agendamentos`)).data,
  })
  return (
    <section className="cartao space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Agendamentos</h2>
        <Link to="/agenda" className="botao py-1.5">
          Ir para a agenda
        </Link>
      </div>
      {lista.data?.length === 0 && <p className="text-suave">Nenhuma consulta marcada até hoje.</p>}
      {!!lista.data?.length && (
        <Tabela colunas={['Data', 'Horário', 'Profissional', 'Situação', 'Observações']}>
          {lista.data.map((a) => (
            <tr key={a.id} className={`${linha} ${a.desmarcadoEm ? 'text-suave' : ''}`}>
              <td className={celula}>{dataBR(a.data)}</td>
              <td className={celula}>
                {a.inicio} – {a.fim}
              </td>
              <td className={celula}>{a.profissional.nome}</td>
              <td className={celula}>
                {a.desmarcadoEm ? (
                  <span title={a.motivoDesmarcacao ?? undefined}>Desmarcada</span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <span
                      className="size-2 rounded-full"
                      style={{ background: STATUS[a.status].cor }}
                    />
                    {STATUS[a.status].rotulo}
                  </span>
                )}
              </td>
              <td className={celula}>{a.motivoDesmarcacao ?? a.observacoes ?? ''}</td>
            </tr>
          ))}
        </Tabela>
      )}
    </section>
  )
}

interface DadosIndicacao {
  indicadoPor: string | null
  quemIndicou: { id: number; nome: string } | null
  indicados: { id: number; nome: string; criadoEm: string }[]
}

export function Indicacoes({ paciente }: { paciente: Paciente }) {
  const r = useQuery({
    queryKey: ['indicacoes', paciente.id],
    queryFn: async () =>
      (await api.get<DadosIndicacao>(`/pacientes/${paciente.id}/indicacoes`)).data,
  })
  const linkPaciente = (p: { id: number; nome: string }) => (
    <Link
      to="/pacientes/$id"
      params={{ id: String(p.id) }}
      className="text-primaria hover:underline"
    >
      {p.nome}
    </Link>
  )
  return (
    <div className="space-y-4">
      <section className="cartao space-y-2">
        <h2 className="font-semibold">Quem indicou este paciente</h2>
        {!r.data?.indicadoPor && <p className="text-suave">Não foi indicado por ninguém.</p>}
        {r.data?.indicadoPor && (
          <p>{r.data.quemIndicou ? linkPaciente(r.data.quemIndicou) : r.data.indicadoPor}</p>
        )}
      </section>
      <section className="cartao space-y-3">
        <h2 className="font-semibold">Pacientes que ele indicou</h2>
        {r.data?.indicados.length === 0 && (
          <p className="text-suave">
            Nenhum. Quando um paciente novo for cadastrado com “Indicado por” igual ao nome deste,
            ele aparece aqui.
          </p>
        )}
        <ul className="space-y-1">
          {r.data?.indicados.map((p) => (
            <li key={p.id}>
              {linkPaciente(p)}{' '}
              <span className="text-suave">· cadastrado em {dataBR(p.criadoEm)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
