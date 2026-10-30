import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  api,
  consultaProfissionais,
  errosDosCampos,
  isoLocal,
  mensagemDeErro,
  somarDias,
  type Paciente,
} from '../api'
import { avisar } from '../estado'
import { BuscaPaciente } from './BuscaPaciente'
import { CampoData } from './CampoData'
import { Dialogo } from './Dialogo'
import { CampoSelect } from './CampoSelect'

export interface MensagemRetorno {
  id: number
  canal: 'WHATSAPP' | 'SMS' | 'EMAIL' | 'NAO_ENVIAR'
  status: 'ENVIADA' | 'FALHOU' | 'RECEBIDA'
  texto: string | null
  erro: string | null
  criadoEm: string
}

/** Situação do aviso automático, com a cor da etiqueta. */
const SITUACOES = {
  AGUARDANDO_ENVIO: { rotulo: 'Aguardando envio', cor: 'var(--suave)' },
  ENVIADO: { rotulo: 'Mensagem enviada', cor: 'var(--info)' },
  FALHOU: { rotulo: 'Falha no envio', cor: 'var(--perigo)' },
  RESPONDEU: { rotulo: 'Respondeu', cor: 'var(--aviso)' },
  CONFIRMADO: { rotulo: 'Confirmou', cor: 'var(--sucesso)' },
  DESMARCADO: { rotulo: 'Desmarcou', cor: 'var(--perigo)' },
} as const

const CANAL = { WHATSAPP: 'WhatsApp', SMS: 'SMS', EMAIL: 'E-mail', NAO_ENVIAR: '' } as const

export interface Retorno {
  id: number
  data: string
  motivo: string | null
  situacao: keyof typeof SITUACOES
  envioPrevisto: string
  paciente: {
    id: number
    nome: string
    celular: string | null
    telefone: string | null
    email: string | null
  }
  profissional: { id: number; nome: string }
  mensagens: MensagemRetorno[]
}

export const consultaRetornos = {
  queryKey: ['retornos'],
  queryFn: async () => (await api.get<Retorno[]>('/retornos')).data,
}

const dataBR = (iso: string) => iso.split('-').reverse().join('/')
const quando = (instante: string) =>
  new Date(instante).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const digitos = (n: string) => n.replace(/\D/g, '')
/** Link do WhatsApp: só dígitos, com 55 quando o número veio sem DDI. */
const whatsapp = (n: string) => `https://wa.me/${digitos(n).length <= 11 ? '55' : ''}${digitos(n)}`

/**
 * Lista da lateral da agenda: retornos abertos (inclusive atrasados). Clicar abre o painel
 * com contatos e a situação do aviso. Só sai da lista quando o paciente confirma ou desmarca.
 */
export function ListaRetornos() {
  const lista = useQuery(consultaRetornos)
  const [abertoId, setAbertoId] = useState<number | null>(null)
  const aberto = lista.data?.find((r) => r.id === abertoId)
  const hoje = isoLocal(new Date())
  return (
    <div className="cartao space-y-2">
      <p className="font-medium">Alertas de retorno</p>
      {lista.data?.length === 0 && (
        <p className="text-suave">Nenhum retorno nos próximos 60 dias.</p>
      )}
      <ul className="space-y-0.5">
        {lista.data?.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              aria-expanded={abertoId === r.id}
              onClick={() => setAbertoId(abertoId === r.id ? null : r.id)}
              className={`flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-primaria-clara ${abertoId === r.id ? 'bg-primaria-clara' : ''}`}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: SITUACOES[r.situacao].cor }}
                title={SITUACOES[r.situacao].rotulo}
              />
              <span className="min-w-0 flex-1 truncate">{r.paciente.nome}</span>
              <span className={r.data < hoje ? 'text-perigo' : 'text-suave'}>
                {r.data.slice(8)}/{r.data.slice(5, 7)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <Dialogo aberto={!!aberto} aoFechar={() => setAbertoId(null)} titulo="Alerta de retorno">
        {aberto && <DetalheRetorno r={aberto} hoje={hoje} />}
      </Dialogo>
    </div>
  )
}

/** Conteúdo do diálogo de um alerta de retorno: dados, contatos e situação do aviso. */
function DetalheRetorno({ r, hoje }: { r: Retorno; hoje: string }) {
  const s = SITUACOES[r.situacao]
  const resposta = r.mensagens.find((m) => m.status === 'RECEBIDA')
  const atrasado = r.data < hoje
  const contatos = [
    { rotulo: 'Celular', valor: r.paciente.celular },
    { rotulo: 'E-mail', valor: r.paciente.email },
  ].filter((c) => c.valor)

  return (
    <div className="space-y-5">
      <div>
        <Link
          to="/pacientes/$id"
          params={{ id: String(r.paciente.id) }}
          className="text-lg font-semibold hover:text-primaria"
        >
          {r.paciente.nome}
        </Link>
        <p className={atrasado ? 'text-perigo' : 'text-suave'}>
          Retorno em {dataBR(r.data)}
          {atrasado && ' (atrasado)'} · {r.profissional.nome}
        </p>
        {r.motivo && <p className="text-suave">Motivo: {r.motivo}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 rounded-md border border-borda p-3">
          <p className="rotulo">Contatos</p>
          {!contatos.length && <p className="text-suave">Sem contato no cadastro.</p>}
          <dl className="space-y-2">
            {contatos.map((c) => (
              <div key={c.rotulo}>
                <dt className="text-xs text-suave">{c.rotulo}</dt>
                <dd className="font-medium break-all">{c.valor}</dd>
              </div>
            ))}
          </dl>
          {r.paciente.celular && (
            <a
              href={whatsapp(r.paciente.celular)}
              target="_blank"
              rel="noreferrer"
              className="botao-leve inline-block py-1"
            >
              Abrir no WhatsApp
            </a>
          )}
        </div>

        <div className="space-y-2 rounded-md border border-borda p-3">
          <p className="rotulo">Aviso automático (WhatsApp)</p>
          <span
            className="inline-flex items-center gap-2 rounded-full px-2.5 py-0.5 text-sm font-medium"
            style={{ background: `color-mix(in srgb, ${s.cor} 15%, transparent)`, color: s.cor }}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: s.cor }} />
            {s.rotulo}
          </span>
          {r.situacao === 'AGUARDANDO_ENVIO' && (
            <p className="text-suave">
              {r.envioPrevisto <= hoje
                ? 'Sai no próximo envio automático.'
                : `Envio previsto para ${dataBR(r.envioPrevisto)}.`}
            </p>
          )}
          {r.situacao === 'ENVIADO' && (
            <p className="text-suave">Aguardando a resposta do paciente.</p>
          )}
          {r.situacao === 'FALHOU' && (
            <p className="text-perigo">
              {r.mensagens.find((m) => m.status === 'FALHOU')?.erro} Entre em contato manualmente.
            </p>
          )}
          {resposta?.texto && (
            <blockquote className="rounded border-l-4 border-borda bg-superficie-2 px-2 py-1">
              “{resposta.texto}”
              <span className="block text-xs text-suave">{quando(resposta.criadoEm)}</span>
            </blockquote>
          )}
        </div>
      </div>

      {r.mensagens.length > 0 && (
        <div>
          <p className="rotulo">Histórico</p>
          <ul className="max-h-40 divide-y divide-borda overflow-y-auto rounded-md border border-borda">
            {r.mensagens.map((m) => (
              <li key={m.id} className="flex justify-between gap-2 px-3 py-1.5">
                <span>
                  {m.status === 'ENVIADA'
                    ? `Enviada por ${CANAL[m.canal]}`
                    : m.status === 'FALHOU'
                      ? `Falhou (${CANAL[m.canal]})`
                      : `Resposta por ${CANAL[m.canal]}`}
                </span>
                <span className="text-suave">{quando(m.criadoEm)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Conteúdo do diálogo "Alerta de retorno". O profissional começa como o usuário logado (B-013). */
export function NovoRetorno(props: { paciente?: Paciente; aoTerminar: () => void }) {
  const qc = useQueryClient()
  const { data: prof } = useQuery(consultaProfissionais)
  const [paciente, setPaciente] = useState<Paciente | null>(props.paciente ?? null)
  const [profissionalId, setProfissionalId] = useState<number | ''>(prof?.meuId ?? '')
  const criar = useMutation({
    mutationFn: async (d: Record<string, unknown>) => (await api.post('/retornos', d)).data,
    onSuccess: () => {
      avisar('Alerta de retorno criado')
      qc.invalidateQueries({ queryKey: ['retornos'] })
      props.aoTerminar()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const erros = errosDosCampos(criar.error)
  const erro = (c: string) => erros[c] && <p className="mt-1 text-perigo">{erros[c]}</p>
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        const f = Object.fromEntries(new FormData(e.currentTarget))
        criar.mutate({ ...f, pacienteId: paciente?.id, profissionalId })
      }}
    >
      <div>
        <span className="rotulo">Paciente</span>
        <BuscaPaciente valor={paciente} aoEscolher={setPaciente} autoFocus />
        {erro('pacienteId')}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="rotulo">Retornar em</span>
          <CampoData name="data" defaultValue={somarDias(isoLocal(new Date()), 180)} required />
          {erro('data')}
        </label>
        <label>
          <span className="rotulo">Profissional</span>
          <CampoSelect
            value={profissionalId}
            onChange={(e) => setProfissionalId(Number(e.target.value) || '')}
            opcoes={prof?.profissionais.map((p) => [p.id, p.nome] as const)}
          />
          {erro('profissionalId')}
        </label>
      </div>
      <label className="block">
        <span className="rotulo">Motivo</span>
        <input name="motivo" className="campo" placeholder="Ex.: revisão semestral" />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" className="botao-leve" onClick={props.aoTerminar}>
          Cancelar
        </button>
        <button className="botao" disabled={criar.isPending}>
          Criar alerta
        </button>
      </div>
    </form>
  )
}
