import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, consultaConfig, dataBR, horaBR, mensagemDeErro, type Agendamento } from '../api'
import { avisar } from '../estado'
import { CATEGORIAS, COM_CHECKIN, STATUS, type StatusAgenda } from '../../../shared/agenda'
import { reais } from '../../../shared/financeiro'
import { whatsapp } from '../paginas/Pacientes'
import { CampoSelect } from './CampoSelect'
import { Icone, type NomeIcone } from './Icones'

/** Cartão do agendamento (C-005): paciente, selo financeiro, horário, desmarcação e status. */
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
  const cores: Record<string, string> = useQuery(consultaConfig('categorias')).data ?? CATEGORIAS

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

  const desmarcada = !!a.desmarcadoEm
  const riscado = desmarcada ? 'text-suave line-through' : ''
  const travado = chegou ? 'O paciente já chegou: volte o status para "Agendado"' : undefined

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 pr-8">
        <span
          aria-hidden
          className="grid size-12 shrink-0 place-items-center rounded-full bg-primaria-clara text-lg font-extrabold text-primaria"
        >
          {a.paciente ? iniciais(nome) : <Icone nome="pausa" />}
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg font-extrabold text-titulo">{nome}</p>
          {a.paciente?.celular && <p className="text-suave">{a.paciente.celular}</p>}
        </div>
      </div>

      {a.paciente && (
        <div className="flex items-center gap-3">
          <Quadro icone="pacientes" />
          <Link
            to="/pacientes/$id"
            params={{ id: String(a.paciente.id) }}
            className="flex-1 font-bold text-secundaria hover:underline"
          >
            Prontuário
          </Link>
          {a.paciente.celular && (
            <a
              href={whatsapp(a.paciente.celular)}
              target="_blank"
              rel="noreferrer"
              className="botao-leve botao-icone"
              aria-label="Conversar no WhatsApp"
              title="Conversar no WhatsApp"
            >
              <Icone nome="conversa" className="h-4 w-4" />
            </a>
          )}
          <Link
            to="/pacientes/$id"
            params={{ id: String(a.paciente.id) }}
            search={{ aba: 'orcamentos' }}
            className="botao-leve botao-icone"
            aria-label="Orçamentos do paciente"
            title="Orçamentos do paciente"
          >
            <Icone nome="financeiro" className="h-4 w-4" />
          </Link>
        </div>
      )}

      {/* R-032: o selo olha só parcelas vencidas e em aberto. */}
      {a.paciente && a.emAtrasoCentavos !== undefined && (
        <p
          className={`rounded-xl py-2 text-center font-bold ${
            a.emAtrasoCentavos ? 'bg-perigo/15 text-perigo' : 'bg-sucesso/15 text-sucesso'
          }`}
        >
          {a.emAtrasoCentavos ? `Em atraso: ${reais(a.emAtrasoCentavos)}` : 'Financeiro OK'}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Quadro icone="agenda" />
        <div className={`min-w-0 flex-1 ${riscado}`}>
          <p className="font-bold first-letter:uppercase">
            {diaExtenso(a.data)} | {a.inicio} – {a.fim}
          </p>
          <p className={desmarcada ? '' : 'text-suave'}>{a.profissional.nome}</p>
        </div>
        {props.podeEditar && !desmarcada && (
          <>
            {a.tipo === 'CONSULTA' && (
              <button
                type="button"
                className="botao-leve botao-icone"
                disabled={chegou}
                onClick={() => setDesmarcando(true)}
                aria-label="Desmarcar"
                title={travado ?? 'Desmarcar'}
              >
                <Icone nome="desmarcar" className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              className="botao-leve botao-icone text-perigo"
              disabled={chegou}
              onClick={() => setConfirmando(true)}
              aria-label="Excluir"
              title={travado ?? 'Excluir'}
            >
              <Icone nome="lixeira" className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {desmarcada && (
        <div className="flex items-start gap-3">
          <Quadro icone="desmarcar" perigo />
          <div className="min-w-0">
            <p className="font-bold text-perigo">
              Agendamento desmarcado em {dataBR(a.desmarcadoEm)} às {horaBR(a.desmarcadoEm!)}
            </p>
            {a.motivoDesmarcacao && <p className="text-suave">Motivo: {a.motivoDesmarcacao}</p>}
          </div>
        </div>
      )}

      {chegou && a.checkinEm && (
        <p className="text-suave">
          Check-in às {horaBR(a.checkinEm)}: não dá para desmarcar nem excluir.
        </p>
      )}
      {a.observacoes && (
        <p className="rounded-xl bg-superficie-2 px-3 py-2 whitespace-pre-wrap">
          {a.observacoes}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-borda px-3 py-2.5">
        <Icone nome="etiqueta" className="h-4 w-4 text-suave" />
        <span className="text-suave">Categoria</span>
        {a.categoria ? (
          <span className="etiqueta">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: cores[a.categoria] ?? 'currentColor' }}
            />
            {a.categoria}
          </span>
        ) : (
          <span className="etiqueta">Sem categoria</span>
        )}
        {a.primeiraConsulta && <span className="etiqueta etiqueta-info">Primeira consulta</span>}
      </div>

      {/* Rodapé encosta nas bordas do balão (p-5). */}
      <div className="-mx-5 -mb-5 flex flex-wrap items-center justify-between gap-3 rounded-b-2xl border-t border-borda bg-superficie-2 px-5 py-3">
        <p className="text-sm text-suave">
          Agendado por {a.criadoPor.nome} em {dataBR(a.criadoEm)} às {horaBR(a.criadoEm)}
        </p>
        {a.tipo === 'CONSULTA' && (
          <div className="w-44">
            <CampoSelect
              aria-label="Status"
              value={a.status}
              disabled={!props.podeEditar || desmarcada || status.isPending}
              onChange={(e) => status.mutate(e.target.value as StatusAgenda)}
              vazio={false}
              opcoes={Object.entries(STATUS).map(([v, s]) => [v, s.rotulo] as const)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

/** Ícone num quadrado claro, à esquerda de cada linha do cartão. */
function Quadro({ icone, perigo }: { icone: NomeIcone; perigo?: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid size-9 shrink-0 place-items-center rounded-xl ${
        perigo ? 'bg-perigo/15 text-perigo' : 'bg-superficie-2 text-primaria'
      }`}
    >
      <Icone nome={icone} className="h-4 w-4" />
    </span>
  )
}

const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter((p) => p.length > 2)
    .map((p) => p[0])
    .filter((_, i, l) => i === 0 || i === l.length - 1)
    .join('')
    .toUpperCase() || nome[0]?.toUpperCase()

/** "ter, 03 de novembro" */
const diaExtenso = (iso: string) =>
  new Date(`${iso}T12:00:00`)
    .toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'long' })
    .replace('.', '')
