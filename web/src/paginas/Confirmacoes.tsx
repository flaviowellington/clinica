// Confirmação e Alertas (F-002): consultas do dia, envio por e-mail e confirmação à mão.
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, dataBR, isoLocal, mensagemDeErro, somarDias } from '../api'
import { avisar } from '../estado'
import { STATUS, type StatusAgenda } from '../../../shared/agenda'
import { CampoData } from '../componentes/CampoData'

interface Mensagem {
  id: number
  canal: string
  status: 'ENVIADA' | 'FALHOU'
  erro: string | null
  criadoEm: string
}
interface Consulta {
  id: number
  data: string
  inicio: string
  status: StatusAgenda
  confirmadoEm: string | null
  confirmadoPor: string | null
  paciente: { id: number; nome: string; celular: string | null; email: string | null } | null
  profissional: { nome: string }
  mensagens: Mensagem[]
}

const hora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export function Confirmacoes() {
  const qc = useQueryClient()
  // Padrão: amanhã, que é o dia que a recepção costuma confirmar.
  const [data, setData] = useState(somarDias(isoLocal(new Date()), 1))
  const chave = ['confirmacoes', data]
  const lista = useQuery({
    queryKey: chave,
    queryFn: async () => (await api.get<Consulta[]>('/confirmacoes', { params: { data } })).data,
    enabled: !!data,
  })
  const atualizar = () => qc.invalidateQueries({ queryKey: chave })
  const enviar = useMutation({
    mutationFn: async (id: number) =>
      (await api.post(`/confirmacoes/${id}/enviar`, { canal: 'EMAIL' })).data,
    onSuccess: () => avisar('E-mail de confirmação enviado'),
    onError: (e) => avisar(mensagemDeErro(e), true),
    onSettled: atualizar,
  })
  const confirmar = useMutation({
    mutationFn: async (id: number) => (await api.post(`/confirmacoes/${id}/confirmar`)).data,
    onSuccess: () => {
      avisar('Consulta confirmada')
      atualizar()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const [enviandoTodos, setEnviandoTodos] = useState(false)
  const pendentesComEmail =
    lista.data?.filter(
      (c) =>
        !c.confirmadoEm && c.paciente?.email && !c.mensagens.some((m) => m.status === 'ENVIADA'),
    ) ?? []

  async function enviarTodos() {
    setEnviandoTodos(true)
    let ok = 0
    for (const c of pendentesComEmail)
      try {
        await api.post(`/confirmacoes/${c.id}/enviar`, { canal: 'EMAIL' })
        ok++
      } catch (e) {
        avisar(`${c.paciente?.nome}: ${mensagemDeErro(e)}`, true)
      }
    setEnviandoTodos(false)
    if (ok) avisar(`${ok} e-mail(s) enviado(s)`)
    atualizar()
  }

  const confirmadas = lista.data?.filter((c) => c.confirmadoEm).length ?? 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Confirmações</h1>
          <p className="text-suave">
            {lista.data?.length ?? 0} consulta(s) · {confirmadas} confirmada(s)
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label>
            <span className="rotulo">Dia</span>
            <CampoData value={data} onChange={setData} />
          </label>
          <button
            className="botao"
            disabled={!pendentesComEmail.length || enviandoTodos}
            onClick={enviarTodos}
          >
            {enviandoTodos ? 'Enviando…' : `Enviar e-mail a todos (${pendentesComEmail.length})`}
          </button>
        </div>
      </div>
      <p className="cartao text-suave">
        O paciente recebe um e-mail com um link e confirma sozinho. Quem não tem e-mail pode ser
        confirmado à mão depois da ligação. WhatsApp e SMS ainda estão desligados.
      </p>

      <div className="cartao overflow-x-auto p-0">
        <table className="w-full text-left">
          <thead className="border-b border-borda text-suave">
            <tr>
              {['Horário', 'Paciente', 'Contato', 'Profissional', 'Situação', 'Envio', ''].map(
                (t) => (
                  <th key={t} className="px-3 py-2 font-medium">
                    {t}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {lista.data?.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-suave">
                  Nenhuma consulta em {dataBR(data)}.
                </td>
              </tr>
            )}
            {lista.data?.map((c) => {
              const ultima = c.mensagens[0]
              return (
                <tr key={c.id} className="border-b border-borda align-top last:border-0">
                  <td className="px-3 py-2 font-medium">{c.inicio}</td>
                  <td className="px-3 py-2">
                    {c.paciente && (
                      <Link
                        to="/pacientes/$id"
                        params={{ id: String(c.paciente.id) }}
                        className="hover:text-primaria"
                      >
                        {c.paciente.nome}
                      </Link>
                    )}
                  </td>
                  <td className="px-3 py-2 text-suave">
                    {c.paciente?.celular && <span className="block">{c.paciente.celular}</span>}
                    {c.paciente?.email ?? 'sem e-mail'}
                  </td>
                  <td className="px-3 py-2">{c.profissional.nome}</td>
                  <td className="px-3 py-2">
                    {c.confirmadoEm ? (
                      <span className="text-sucesso">
                        Confirmada
                        <span className="block text-xs text-suave">
                          {c.confirmadoPor} · {hora(c.confirmadoEm)}
                        </span>
                      </span>
                    ) : (
                      STATUS[c.status].rotulo
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {ultima ? (
                      <span
                        className={ultima.status === 'FALHOU' ? 'text-perigo' : 'text-suave'}
                        title={ultima.erro ?? undefined}
                      >
                        {ultima.status === 'FALHOU' ? 'Falhou' : 'E-mail enviado'} ·{' '}
                        {hora(ultima.criadoEm)}
                      </span>
                    ) : (
                      <span className="text-suave">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {!c.confirmadoEm && (
                      <>
                        <button
                          className="text-primaria hover:underline disabled:opacity-40"
                          disabled={!c.paciente?.email || enviar.isPending}
                          title={c.paciente?.email ? undefined : 'Paciente sem e-mail no cadastro'}
                          onClick={() => enviar.mutate(c.id)}
                        >
                          Enviar e-mail
                        </button>
                        <button
                          className="ml-3 text-primaria hover:underline"
                          onClick={() => confirmar.mutate(c.id)}
                        >
                          Confirmar
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
