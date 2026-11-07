// Confirmação e Alertas (F-002): consultas do dia, envio por e-mail e confirmação à mão.
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { api, consultaEu, dataBR, isoLocal, mensagemDeErro, somarDias, useOcultos } from '../api'
import { pode } from '../../../shared/permissoes'
import { avisar } from '../estado'
import { STATUS, type StatusAgenda } from '../../../shared/agenda'
import { MiniCalendario } from '../componentes/MiniCalendario'
import { Icone } from '../componentes/Icones'
import { ProfissionaisSuspenso, Suspenso } from './FinanceiroAbas'

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
  profissional: { id: number; nome: string }
  mensagens: Mensagem[]
}

const SITUACOES = {
  todas: { rotulo: 'Todas as situações', cor: 'bg-borda' },
  pendentes: { rotulo: 'A confirmar', cor: 'bg-info' },
  confirmadas: { rotulo: 'Confirmadas', cor: 'bg-sucesso' },
} as const
type Situacao = keyof typeof SITUACOES

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
  const [filtro, setFiltro] = useState<Situacao>('todas')
  const { data: eu } = useSuspenseQuery(consultaEu)
  // O profissional só vê as consultas dele (o servidor já filtra): sem filtro de profissionais.
  const verTodos = pode(eu.perfis, 'confirmacoes.todas')
  const [ocultos, setOcultos] = useOcultos('confirmacoes', () => [])
  const [calendario, setCalendario] = useState(false)
  // A lista, os números e o "enviar a todos" seguem o filtro de profissionais.
  const consultas = (lista.data ?? []).filter((c) => !ocultos.includes(c.profissional.id))
  const porProf = new Map<number, number>()
  for (const c of lista.data ?? [])
    porProf.set(c.profissional.id, (porProf.get(c.profissional.id) ?? 0) + 1)
  const pendentesComEmail =
    consultas.filter(
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

  const total = consultas.length
  const confirmadas = consultas.filter((c) => c.confirmadoEm).length
  const enviadas = consultas.filter(
    (c) => !c.confirmadoEm && c.mensagens[0]?.status === 'ENVIADA',
  ).length
  const semEmail = consultas.filter((c) => !c.confirmadoEm && !c.paciente?.email).length
  const pct = total ? Math.round((confirmadas / total) * 100) : 0
  const visiveis = consultas.filter((c) =>
    filtro === 'todas' ? true : filtro === 'confirmadas' ? !!c.confirmadoEm : !c.confirmadoEm,
  )
  const contagem = { todas: total, pendentes: total - confirmadas, confirmadas }

  return (
    <div className="flex flex-col gap-5 lg:h-[calc(100dvh-2rem)]">
      <header className="flex shrink-0 flex-wrap items-center gap-3.5">
        <h1 className="titulo">Confirmações</h1>
        <span aria-hidden="true" className="h-6 w-px bg-borda" />
        <span className="text-base text-suave">
          {lista.isPending
            ? 'Carregando…'
            : `${total} ${total === 1 ? 'consulta' : 'consultas'} em ${dataBR(data)}`}
        </span>
        <button
          className="botao ml-auto"
          disabled={!pendentesComEmail.length || enviandoTodos}
          onClick={enviarTodos}
        >
          <Icone nome="confirmacoes" className="h-4 w-4" />
          {enviandoTodos ? 'Enviando…' : `Enviar e-mail a todos (${pendentesComEmail.length})`}
        </button>
      </header>

      {/* ---------- Filtros (barra da Agenda 2) ---------- */}
      <div className="cartao flex shrink-0 flex-wrap items-center gap-2 py-2">
        {calendario && <div className="fixed inset-0 z-30" onClick={() => setCalendario(false)} />}
        <div className="relative flex w-full items-center gap-1 sm:w-auto">
          <button
            type="button"
            className="botao-leve px-2.5 py-1.5"
            onClick={() => setData(somarDias(data, -1))}
            aria-label="Dia anterior"
          >
            <Icone nome="esquerda" className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={`botao-leve flex flex-1 items-center justify-center gap-2 py-1.5 sm:flex-none ${calendario ? 'border-primaria bg-primaria-clara text-titulo' : ''}`}
            aria-expanded={calendario}
            onClick={() => setCalendario(!calendario)}
          >
            <Icone nome="agenda" className="h-4 w-4" />
            {dataBR(data)}
          </button>
          <button
            type="button"
            className="botao-leve px-2.5 py-1.5"
            onClick={() => setData(somarDias(data, 1))}
            aria-label="Próximo dia"
          >
            <Icone nome="direita" className="h-4 w-4" />
          </button>
          {calendario && (
            <div className="absolute top-full left-0 z-40 mt-1 w-64 shadow-lg">
              <MiniCalendario
                data={data}
                hoje={isoLocal(new Date())}
                aoEscolher={(d) => {
                  setData(d)
                  setCalendario(false)
                }}
              />
            </div>
          )}
        </div>
        {verTodos && (
          <ProfissionaisSuspenso
            ocultos={ocultos}
            aoMudar={setOcultos}
            valor={(id) => porProf.get(id) ?? 0}
          />
        )}
        <Suspenso
          marcado={filtro !== 'todas'}
          painel="w-64 p-1.5"
          rotulo={`${SITUACOES[filtro].rotulo} ▾`}
        >
          {(fechar) => (
            <ul>
              {(Object.keys(SITUACOES) as Situacao[]).map((t) => (
                <li key={t}>
                  <button
                    type="button"
                    aria-pressed={filtro === t}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left font-bold hover:bg-primaria-clara ${filtro === t ? 'bg-primaria-clara text-titulo' : ''}`}
                    onClick={() => {
                      setFiltro(t)
                      fechar()
                    }}
                  >
                    <span aria-hidden className={`size-2.5 rounded-full ${SITUACOES[t].cor}`} />
                    <span className="flex-1">{SITUACOES[t].rotulo}</span>
                    <span className="text-sm text-suave tabular-nums">{contagem[t]}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Suspenso>
      </div>

      <section className="cartao shrink-0 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-lg font-extrabold text-titulo">
            {confirmadas} de {total} {total === 1 ? 'consulta confirmada' : 'consultas confirmadas'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {enviadas > 0 && (
              <span className="etiqueta etiqueta-info">{enviadas} aguardando resposta</span>
            )}
            {semEmail > 0 && (
              <span className="etiqueta etiqueta-aviso">{semEmail} sem e-mail · ligar</span>
            )}
          </div>
        </div>
        <div
          className="h-2.5 overflow-hidden rounded-full bg-superficie-2"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Consultas confirmadas"
        >
          <div
            className="h-full rounded-full bg-sucesso transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="ajuda">
          O paciente recebe um e-mail com um link e confirma sozinho. Quem não tem e-mail pode ser
          confirmado à mão depois da ligação. WhatsApp e SMS ainda estão desligados.
        </p>
      </section>

      <div className="relative min-h-0 flex-1 space-y-5 lg:-mr-2 lg:overflow-y-auto lg:pr-2">
        <ul className={`space-y-2 ${lista.isFetching ? 'opacity-60' : ''}`}>
          {visiveis.map((c) => {
            const ultima = c.mensagens[0]
            const cor = c.confirmadoEm
              ? 'border-l-sucesso'
              : ultima?.status === 'FALHOU'
                ? 'border-l-perigo'
                : ultima
                  ? 'border-l-info'
                  : 'border-l-borda'
            return (
              <li
                key={c.id}
                className={`cartao flex flex-wrap items-center gap-x-5 gap-y-3 border-l-4 py-3 ${cor}`}
              >
                <span className="w-14 shrink-0 text-lg font-extrabold text-titulo tabular-nums">
                  {c.inicio}
                </span>

                <div className="min-w-48 flex-1">
                  {c.paciente && (
                    <Link
                      to="/pacientes/$id"
                      params={{ id: String(c.paciente.id) }}
                      className="font-bold text-primaria hover:underline"
                    >
                      {c.paciente.nome}
                    </Link>
                  )}
                  <span className="block text-sm text-suave">{c.profissional.nome}</span>
                </div>

                <div className="min-w-48 flex-1 space-y-0.5 text-sm text-suave">
                  {c.paciente?.celular && (
                    <span className="flex items-center gap-1.5">
                      <Icone nome="celular" className="h-3.5 w-3.5 shrink-0" />
                      {c.paciente.celular}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5 break-all">
                    <Icone nome="confirmacoes" className="h-3.5 w-3.5 shrink-0" />
                    {c.paciente?.email ?? <em>Sem e-mail</em>}
                  </span>
                </div>

                <div className="w-44 shrink-0 space-y-1">
                  {c.confirmadoEm ? (
                    <>
                      <span className="etiqueta etiqueta-sucesso">✓ Confirmada</span>
                      <span className="block text-xs text-suave">
                        {c.confirmadoPor} · {hora(c.confirmadoEm)}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="etiqueta">{STATUS[c.status].rotulo}</span>
                      {ultima && (
                        <span
                          className={`block text-xs font-bold ${ultima.status === 'FALHOU' ? 'text-perigo' : 'text-info'}`}
                          title={ultima.erro ?? undefined}
                        >
                          {ultima.status === 'FALHOU' ? 'Envio falhou' : 'E-mail enviado'} ·{' '}
                          {hora(ultima.criadoEm)}
                        </span>
                      )}
                    </>
                  )}
                </div>

                {/* Sempre presente e com largura fixa: assim as colunas alinham entre linhas. */}
                <div className="ml-auto flex shrink-0 justify-end gap-1 whitespace-nowrap sm:w-56">
                  {!c.confirmadoEm && (
                    <>
                      <button
                        className="botao-leve botao-pequeno"
                        disabled={!c.paciente?.email || enviar.isPending}
                        title={c.paciente?.email ? undefined : 'Paciente sem e-mail no cadastro'}
                        onClick={() => enviar.mutate(c.id)}
                      >
                        <Icone nome="confirmacoes" className="h-4 w-4" />
                        {ultima ? 'Reenviar' : 'Enviar e-mail'}
                      </button>
                      <button
                        className="botao-leve botao-pequeno"
                        disabled={confirmar.isPending}
                        onClick={() => confirmar.mutate(c.id)}
                      >
                        Confirmar
                      </button>
                    </>
                  )}
                </div>
              </li>
            )
          })}
          {lista.data && visiveis.length === 0 && (
            <li className="cartao py-10 text-center text-suave">
              {total === 0
                ? `Nenhuma consulta em ${dataBR(data)}.`
                : 'Nenhuma consulta nesta situação.'}
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}
