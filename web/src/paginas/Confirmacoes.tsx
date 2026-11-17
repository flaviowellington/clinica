// Confirmação e Alertas (F-002): consultas do dia, envio (Mensagens ou WhatsApp) e confirmação à mão.
import { useState } from 'react'
import { isAxiosError } from 'axios'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { api, consultaEu, dataBR, isoLocal, mensagemDeErro, somarDias, useOcultos } from '../api'
import { pode } from '../../../shared/permissoes'
import { avisar } from '../estado'
import { STATUS, type StatusAgenda } from '../../../shared/agenda'
import { MiniCalendario } from '../componentes/MiniCalendario'
import { Icone } from '../componentes/Icones'
import { Dialogo } from '../componentes/Dialogo'
import { confirmar as perguntarConfirmar } from '../componentes/Confirmar'
import { ProfissionaisSuspenso, Suspenso } from './FinanceiroAbas'

type Canal = 'EMAIL' | 'WHATSAPP'
const NOME_CANAL: Record<Canal, string> = { EMAIL: 'E-mail', WHATSAPP: 'WhatsApp' }
const PALAVRA = 'confirmo'
/** Sem a API do WhatsApp o servidor responde 501 com o link do WhatsApp Web pronto. */
const linkWhatsApp = (e: unknown): string | undefined =>
  isAxiosError(e) ? e.response?.data?.whatsappWeb : undefined

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
  // WhatsApp direto: abre a aba antes do pedido (senão o navegador bloqueia o pop-up depois do await).
  const whatsapp = useMutation({
    mutationFn: async ({ id }: { id: number; aba: Window | null }) =>
      (await api.post(`/confirmacoes/${id}/enviar`, { canal: 'WHATSAPP' })).data,
    onSuccess: (_d, { aba }) => {
      aba?.close()
      avisar('Confirmação enviada pelo WhatsApp')
    },
    onError: (e, { aba }) => {
      const link = linkWhatsApp(e)
      if (link && aba) aba.location.href = link
      else {
        aba?.close()
        avisar(mensagemDeErro(e), true)
      }
    },
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
  const [todos, setTodos] = useState(false)
  const [canalTodos, setCanalTodos] = useState<Canal>('EMAIL')
  const [palavra, setPalavra] = useState('')
  const fecharTodos = () => {
    setTodos(false)
    setPalavra('')
  }
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
  const pendentes = consultas.filter(
    (c) => !c.confirmadoEm && c.paciente && !c.mensagens.some((m) => m.status === 'ENVIADA'),
  )
  const destinatarios = (canal: Canal) =>
    pendentes.filter((c) => (canal === 'EMAIL' ? c.paciente?.email : c.paciente?.celular))
  const alvo = destinatarios(canalTodos)

  async function enviarTodos() {
    const canal = canalTodos
    fecharTodos()
    setEnviandoTodos(true)
    let ok = 0
    for (const c of alvo)
      try {
        await api.post(`/confirmacoes/${c.id}/enviar`, { canal })
        ok++
      } catch (e) {
        // Sem a API do WhatsApp todos falhariam igual: para no primeiro.
        if (linkWhatsApp(e)) {
          avisar('A API do WhatsApp ainda não está ligada. Envie um a um pelo WhatsApp Web.', true)
          break
        }
        avisar(`${c.paciente?.nome}: ${mensagemDeErro(e)}`, true)
      }
    setEnviandoTodos(false)
    if (ok) avisar(`${ok} confirmação(ões) enviada(s) por ${NOME_CANAL[canal]}`)
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
          disabled={!pendentes.length || enviandoTodos}
          onClick={() => setTodos(true)}
        >
          <Icone nome="enviar" className="h-4 w-4" />
          {enviandoTodos ? 'Enviando…' : `Enviar para todos (${pendentes.length})`}
        </button>
      </header>

      <Dialogo aberto={todos} aoFechar={fecharTodos} titulo="Enviar para todos">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (palavra.trim().toLowerCase() === PALAVRA && alvo.length) enviarTodos()
          }}
        >
          <p>
            Envia a confirmação para quem ainda não recebeu nenhuma em {dataBR(data)}. Por onde?
          </p>
          <div role="group" aria-label="Enviar por" className="grid grid-cols-2 gap-2">
            {(['EMAIL', 'WHATSAPP'] as Canal[]).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={canalTodos === c}
                className={`min-h-11 rounded-xl border-2 px-3 ${canalTodos === c ? 'border-primaria bg-primaria-clara font-extrabold text-titulo' : 'border-borda font-bold hover:border-primaria/50'}`}
                onClick={() => setCanalTodos(c)}
              >
                {NOME_CANAL[c]} ({destinatarios(c).length})
              </button>
            ))}
          </div>
          {alvo.length < pendentes.length && (
            <p className="ajuda">
              {pendentes.length - alvo.length} sem {canalTodos === 'EMAIL' ? 'e-mail' : 'celular'}{' '}
              no cadastro ficam de fora.
            </p>
          )}
          <div>
            <label className="rotulo" htmlFor="todos-confirma">
              Digite <span className="text-perigo">{PALAVRA}</span> para enviar
            </label>
            <input
              id="todos-confirma"
              className="campo"
              autoComplete="off"
              autoFocus
              value={palavra}
              onChange={(e) => setPalavra(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 border-t border-borda pt-4">
            <button type="button" className="botao-leve" onClick={fecharTodos}>
              Cancelar
            </button>
            <button
              className="botao"
              disabled={palavra.trim().toLowerCase() !== PALAVRA || !alvo.length}
            >
              Enviar {alvo.length} por {NOME_CANAL[canalTodos]}
            </button>
          </div>
        </form>
      </Dialogo>

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
          O paciente recebe a mensagem com um link e confirma sozinho. Sem a API do WhatsApp, o
          botão WhatsApp abre o WhatsApp Web com o texto pronto. Quem não responde pode ser
          confirmado à mão depois da ligação.
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
                <div className="ml-auto flex w-full shrink-0 flex-wrap justify-end gap-1 whitespace-nowrap sm:w-96">
                  {!c.confirmadoEm && (
                    <>
                      {c.paciente && (
                        <Link
                          to="/mensagens"
                          search={{ paciente: c.paciente.id, consulta: c.id }}
                          className="botao-leve botao-pequeno"
                        >
                          <Icone nome="enviar" className="h-4 w-4" />
                          {ultima ? 'Reenviar' : 'Enviar mensagem'}
                        </Link>
                      )}
                      <button
                        className="botao-leve botao-pequeno"
                        disabled={!c.paciente?.celular || whatsapp.isPending}
                        title={
                          c.paciente?.celular
                            ? 'Enviar pelo WhatsApp'
                            : 'Paciente sem celular no cadastro'
                        }
                        aria-label="Enviar pelo WhatsApp"
                        onClick={() =>
                          whatsapp.mutate({ id: c.id, aba: window.open('', '_blank') })
                        }
                      >
                        <Icone nome="conversa" className="h-4 w-4" />
                        WhatsApp
                      </button>
                      <button
                        className="botao-leve botao-pequeno"
                        disabled={confirmar.isPending}
                        onClick={async () => {
                          const ok = await perguntarConfirmar(
                            `Marcar a consulta de ${c.paciente?.nome ?? 'sem paciente'} às ${c.inicio} como confirmada?`,
                            { titulo: 'Confirmar consulta?', botao: 'Confirmar', perigo: false },
                          )
                          if (ok) confirmar.mutate(c.id)
                        }}
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
