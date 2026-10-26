// Abas de consulta da ficha: Financeiro, Recibos, Agendamentos e Indicações do paciente.
import { useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { api, consultaEu, dataBR, type Paciente } from '../api'
import { pode } from '../../../shared/permissoes'
import { STATUS_CONTA_FINANCEIRA, TIPOS_LANCAMENTO, reais } from '../../../shared/financeiro'
import { STATUS } from '../../../shared/agenda'
import type { StatusAgenda } from '../../../shared/agenda'
import { Baixar, type Conta } from '../paginas/FinanceiroAbas'
import { Dialogo } from './Dialogo'

interface Lancamento {
  id: number
  data: string
  tipo: keyof typeof TIPOS_LANCAMENTO
  valorCentavos: number
  descricao: string
  forma: string | null
  criadoPor: { nome: string }
}
interface Financeiro {
  contas: Omit<Conta, 'paciente'>[]
  lancamentos: Lancamento[]
  saldoCentavos: number
}

const useFinanceiro = (pacienteId: number) =>
  useQuery({
    queryKey: ['financeiro-paciente', pacienteId],
    queryFn: async () => (await api.get<Financeiro>(`/pacientes/${pacienteId}/financeiro`)).data,
  })

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

export function FinanceiroPaciente({ paciente }: { paciente: Paciente }) {
  const { data: eu } = useSuspenseQuery(consultaEu)
  const qc = useQueryClient()
  const f = useFinanceiro(paciente.id)
  const [baixar, setBaixar] = useState<Conta | null>(null)
  const aberto =
    f.data?.contas.filter((c) => c.status === 'ABERTA').reduce((s, c) => s + c.valorCentavos, 0) ??
    0

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <section className="cartao">
          <p className="text-suave">Saldo do paciente</p>
          <p
            className={`text-2xl font-semibold ${(f.data?.saldoCentavos ?? 0) < 0 ? 'text-perigo' : 'text-sucesso'}`}
          >
            {reais(f.data?.saldoCentavos ?? 0)}
          </p>
          <p className="text-xs text-suave">Pagamentos menos tratamentos vendidos.</p>
        </section>
        <section className="cartao">
          <p className="text-suave">Parcelas em aberto</p>
          <p className="text-2xl font-semibold">{reais(aberto)}</p>
        </section>
      </div>

      <section className="cartao space-y-3">
        <h2 className="font-semibold">Parcelas</h2>
        {f.data?.contas.length === 0 && <p className="text-suave">Nenhuma parcela.</p>}
        {!!f.data?.contas.length && (
          <Tabela colunas={['Vencimento', 'Descrição', 'Forma', 'Situação', 'Valor', '']}>
            {f.data.contas.map((c) => (
              <tr key={c.id} className={linha}>
                <td className={celula}>{dataBR(c.vencimento)}</td>
                <td className={celula}>{c.descricao}</td>
                <td className={celula}>{c.forma ?? '—'}</td>
                <td className={celula}>
                  {STATUS_CONTA_FINANCEIRA[c.status]}
                  {c.pagoEm && <span className="text-suave"> em {dataBR(c.pagoEm)}</span>}
                </td>
                <td className={`${celula} font-medium`}>{reais(c.valorCentavos)}</td>
                <td className={`${celula} text-right`}>
                  {c.status === 'ABERTA' && pode(eu.perfis, 'financeiro.editar') && (
                    <button
                      className="text-primaria hover:underline"
                      onClick={() => setBaixar({ ...c, paciente: null })}
                    >
                      Receber
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </Tabela>
        )}
      </section>

      <section className="cartao space-y-3">
        <h2 className="font-semibold">Lançamentos</h2>
        {f.data?.lancamentos.length === 0 && <p className="text-suave">Nenhum lançamento.</p>}
        {!!f.data?.lancamentos.length && (
          <Tabela colunas={['Data', 'Tipo', 'Descrição', 'Forma', 'Valor', '']}>
            {f.data.lancamentos.map((l) => (
              <tr key={l.id} className={linha}>
                <td className={celula}>{dataBR(l.data)}</td>
                <td className={celula}>{TIPOS_LANCAMENTO[l.tipo]}</td>
                <td className={celula}>{l.descricao}</td>
                <td className={celula}>{l.forma ?? '—'}</td>
                <td className={`${celula} font-medium`}>{reais(l.valorCentavos)}</td>
                <td className={`${celula} text-right`}>
                  {l.tipo === 'ENTRADA' && (
                    <Link
                      to="/recibo/$id"
                      params={{ id: String(l.id) }}
                      className="text-primaria hover:underline"
                    >
                      Recibo
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </Tabela>
        )}
      </section>

      <Dialogo aberto={!!baixar} aoFechar={() => setBaixar(null)} titulo="Receber parcela">
        {baixar && (
          <Baixar
            conta={baixar}
            aoTerminar={() => {
              setBaixar(null)
              qc.invalidateQueries({ queryKey: ['financeiro-paciente', paciente.id] })
            }}
          />
        )}
      </Dialogo>
    </div>
  )
}

export function RecibosPaciente({ paciente }: { paciente: Paciente }) {
  const f = useFinanceiro(paciente.id)
  const recebidos = f.data?.lancamentos.filter((l) => l.tipo === 'ENTRADA') ?? []
  return (
    <section className="cartao space-y-3">
      <h2 className="font-semibold">Recibos</h2>
      {f.data && !recebidos.length && (
        <p className="text-suave">Nenhum pagamento recebido deste paciente ainda.</p>
      )}
      {!!recebidos.length && (
        <Tabela colunas={['Nº', 'Data', 'Referente a', 'Forma', 'Valor', '']}>
          {recebidos.map((l) => (
            <tr key={l.id} className={linha}>
              <td className={celula}>{l.id}</td>
              <td className={celula}>{dataBR(l.data)}</td>
              <td className={celula}>{l.descricao}</td>
              <td className={celula}>{l.forma ?? '—'}</td>
              <td className={`${celula} font-medium`}>{reais(l.valorCentavos)}</td>
              <td className={`${celula} text-right`}>
                <Link
                  to="/recibo/$id"
                  params={{ id: String(l.id) }}
                  className="text-primaria hover:underline"
                >
                  Abrir e imprimir
                </Link>
              </td>
            </tr>
          ))}
        </Tabela>
      )}
    </section>
  )
}

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
