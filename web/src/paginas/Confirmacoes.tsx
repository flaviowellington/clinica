// Confirmação e Alertas (F-002): consultas do dia, envio por e-mail e confirmação à mão.
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, dataBR, isoLocal, mensagemDeErro, somarDias } from '../api'
import { avisar } from '../estado'
import { STATUS, type StatusAgenda } from '../../../shared/agenda'
import { CampoData } from '../componentes/CampoData'
import { Icone } from '../componentes/Icones'

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

  const total = lista.data?.length ?? 0
  const colunas = ['Horário', 'Paciente', 'Contato', 'Profissional', 'Situação', 'Envio', '']

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titulo">Confirmações</h1>
          <p className="subtitulo">Confirme as consultas do dia por e-mail ou à mão.</p>
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
            <Icone nome="confirmacoes" className="h-4 w-4" />
            {enviandoTodos ? 'Enviando…' : `Enviar e-mail a todos (${pendentesComEmail.length})`}
          </button>
        </div>
      </header>

      <p className="alerta-info">
        O paciente recebe um e-mail com um link e confirma sozinho. Quem não tem e-mail pode ser
        confirmado à mão depois da ligação. WhatsApp e SMS ainda estão desligados.
      </p>

      <div className="cartao overflow-x-auto p-0">
        <table className="w-full min-w-[52rem] text-left">
          <thead>
            <tr>
              {colunas.map((t) => (
                <th
                  key={t}
                  className="border-b border-borda px-4 py-2.5 text-xs font-bold tracking-wide text-suave uppercase"
                >
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={lista.isFetching ? 'opacity-60' : ''}>
            {lista.data?.map((c) => {
              const ultima = c.mensagens[0]
              return (
                <tr
                  key={c.id}
                  className="border-b border-borda align-top last:border-0 hover:bg-primaria-clara"
                >
                  <td className="px-4 py-2.5 font-bold tabular-nums">{c.inicio}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {c.paciente && (
                      <Link
                        to="/pacientes/$id"
                        params={{ id: String(c.paciente.id) }}
                        className="font-bold text-primaria hover:underline"
                      >
                        {c.paciente.nome}
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-suave">
                    {c.paciente?.celular && <span className="block">{c.paciente.celular}</span>}
                    {c.paciente?.email ?? 'Sem e-mail'}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{c.profissional.nome}</td>
                  <td className="px-4 py-2.5">
                    {c.confirmadoEm ? (
                      <>
                        <span className="etiqueta etiqueta-sucesso">Confirmada</span>
                        <span className="mt-1 block text-xs text-suave">
                          {c.confirmadoPor} · {hora(c.confirmadoEm)}
                        </span>
                      </>
                    ) : (
                      <span className="etiqueta">{STATUS[c.status].rotulo}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {ultima ? (
                      <>
                        <span
                          className={`etiqueta ${ultima.status === 'FALHOU' ? 'etiqueta-perigo' : 'etiqueta-info'}`}
                          title={ultima.erro ?? undefined}
                        >
                          {ultima.status === 'FALHOU' ? 'Falhou' : 'E-mail enviado'}
                        </span>
                        <span className="mt-1 block text-xs text-suave">
                          {hora(ultima.criadoEm)}
                        </span>
                      </>
                    ) : (
                      <span className="text-suave">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {!c.confirmadoEm && (
                      <div className="flex justify-end gap-1">
                        <button
                          className="botao-leve botao-pequeno"
                          disabled={!c.paciente?.email || enviar.isPending}
                          title={c.paciente?.email ? undefined : 'Paciente sem e-mail no cadastro'}
                          onClick={() => enviar.mutate(c.id)}
                        >
                          <Icone nome="confirmacoes" className="h-4 w-4" />
                          Enviar e-mail
                        </button>
                        <button
                          className="botao-leve botao-pequeno"
                          disabled={confirmar.isPending}
                          onClick={() => confirmar.mutate(c.id)}
                        >
                          Confirmar
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
            {lista.data?.length === 0 && (
              <tr>
                <td colSpan={colunas.length} className="px-4 py-10 text-center text-suave">
                  Nenhuma consulta em {dataBR(data)}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="border-t border-borda px-4 py-2.5 text-sm font-bold text-suave">
          {total} {total === 1 ? 'consulta' : 'consultas'} · {confirmadas}{' '}
          {confirmadas === 1 ? 'confirmada' : 'confirmadas'}
        </div>
      </div>
    </div>
  )
}
