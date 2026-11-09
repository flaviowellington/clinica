// Mensagens: escolher o paciente, um modelo e o canal (e-mail ou WhatsApp). À direita, a conversa
// com o que já foi enviado e a prévia da nova mensagem (server/src/mensagens.ts).
// Confirmação e assinatura usam as rotas próprias; os outros modelos saem como texto livre.
import { useState } from 'react'
import { isAxiosError } from 'axios'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, dataBR, mensagemDeErro } from '../api'
import { avisar } from '../estado'
import { BuscaPaciente } from '../componentes/BuscaPaciente'
import { confirmar } from '../componentes/Confirmar'
import { Icone, type NomeIcone } from '../componentes/Icones'

interface Dados {
  paciente: { id: number; nome: string; email: string | null; celular: string | null }
  consultas: {
    id: number
    data: string
    inicio: string
    confirmadoEm: string | null
    profissional: { nome: string }
  }[]
  autorizacoes: {
    id: number
    titulo: string
    criadoEm: string
    assinadoEm: string | null
    planejamento: boolean
  }[]
  historico: {
    id: number
    canal: Canal
    tipo: string
    assunto: string | null
    texto: string | null
    status: 'ENVIADA' | 'FALHOU'
    criadoEm: string
  }[]
}
/** Procedimento do plano / ficha clínica (GET /pacientes/:id/procedimentos). */
interface ItemFicha {
  origem: 'CLINICO' | 'ORCAMENTO'
  id: number
  nome: string
  dente: string | null
  faces: string | null
  status: 'A_REALIZAR' | 'EXECUTADO' | 'EXISTENTE'
  profissional: { nome: string }
  orcamentoStatus: string | null
  autorizacao: { id: number } | null
}
type Canal = 'EMAIL' | 'WHATSAPP'
type Modelo = 'confirmacao' | 'retorno' | 'assinatura' | 'pdf' | 'aniversario' | 'texto'
/** Vindo da ficha (?envio=…&pedido=…): o que já abre escolhido. */
export const ENVIOS = ['procedimentos', 'planejamento', 'pdf'] as const
export type EnvioMensagem = (typeof ENVIOS)[number]

// `texto` só nos modelos que saem como texto livre (o texto vira editável antes de enviar).
const MODELOS: {
  id: Modelo
  rotulo: string
  icone: NomeIcone
  cor: string
  texto?: (nome: string) => string
}[] = [
  {
    id: 'confirmacao',
    rotulo: 'Confirmação',
    icone: 'confirmacoes',
    cor: 'text-primaria bg-primaria/12',
  },
  {
    id: 'retorno',
    rotulo: 'Retorno',
    icone: 'agenda',
    cor: 'text-sucesso bg-sucesso/12',
    texto: (n) =>
      `Olá, ${n}! Já está na hora do seu retorno. Responda esta mensagem que a gente encontra um horário.`,
  },
  { id: 'assinatura', rotulo: 'Assinatura', icone: 'lapis', cor: 'text-aviso bg-aviso/12' },
  { id: 'pdf', rotulo: 'PDF assinado', icone: 'documento', cor: 'text-sucesso bg-sucesso/12' },
  {
    id: 'aniversario',
    rotulo: 'Aniversário',
    icone: 'estrela',
    cor: 'text-perigo bg-perigo/12',
    texto: (n) => `Feliz aniversário, ${n}! Toda a equipe da clínica deseja um ótimo dia.`,
  },
  {
    id: 'texto',
    rotulo: 'Texto livre',
    icone: 'conversa',
    cor: 'text-suave bg-suave/12',
    texto: () => '',
  },
]
const NOME_CANAL: Record<Canal, string> = { EMAIL: 'E-mail', WHATSAPP: 'WhatsApp' }
const NOME_TIPO: Record<string, string> = {
  CONFIRMACAO: 'Confirmação',
  AUTORIZACAO: 'Plano para assinar',
  AUTORIZACAO_ASSINADA: 'PDF assinado',
  TEXTO: 'Mensagem',
}
const quando = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

/** Botão de escolha (modelo, consulta, canal): contorno roxo quando marcado. */
const escolha = (marcado: boolean) =>
  `rounded-xl border-2 ${marcado ? 'border-primaria bg-primaria-clara text-titulo font-extrabold' : 'border-borda bg-superficie font-bold hover:border-primaria/50'}`

export function Mensagens() {
  const { paciente: pacienteId, envio: vindo, pedido } = useSearch({ from: '/logado/mensagens' })
  const navegar = useNavigate({ from: '/mensagens' })
  const qc = useQueryClient()
  const [canal, setCanal] = useState<Canal>('EMAIL')
  const [modelo, setModelo] = useState<Modelo>(
    vindo === 'pdf' ? 'pdf' : vindo ? 'assinatura' : 'confirmacao',
  )
  const [consultaId, setConsultaId] = useState<number | null>(null)
  const [autorizacaoId, setAutorizacaoId] = useState<number | null>(pedido ?? null)
  const [assunto, setAssunto] = useState('')
  const [texto, setTexto] = useState('')
  // Sem a API do WhatsApp: o servidor devolve o link do WhatsApp Web com o texto pronto.
  const [whatsappWeb, setWhatsappWeb] = useState<string | null>(null)

  const chave = ['mensagens-paciente', pacienteId]
  const dados = useQuery({
    queryKey: chave,
    queryFn: async () => (await api.get<Dados>(`/mensagens/paciente/${pacienteId}`)).data,
    enabled: !!pacienteId,
  })
  const d = dados.data
  const p = d?.paciente
  const destino = p && (canal === 'EMAIL' ? p.email : p.celular)
  const primeiroNome = p?.nome.split(' ')[0] ?? ''
  const m = MODELOS.find((x) => x.id === modelo)!
  const livre = !!m.texto
  const consulta = d?.consultas.find((c) => c.id === consultaId) ?? d?.consultas[0]
  // Assinatura: aprovação de procedimentos avulsos ou de um planejamento.
  const [planejamento, setPlanejamento] = useState(vindo === 'planejamento')
  const abertos = d?.autorizacoes.filter((a) => !a.assinadoEm) ?? []
  const pedidos = abertos.filter((a) => a.planejamento === planejamento)
  // PDF assinado: qualquer pedido já assinado (procedimentos ou planejamento).
  const assinados = d?.autorizacoes.filter((a) => a.assinadoEm) ?? []
  const assinado = assinados.find((a) => a.id === autorizacaoId) ?? assinados[0]
  // Planejamento: o pedido já existe (criado na ficha). Procedimentos: só reenvia se escolhido.
  const autorizacao =
    pedidos.find((a) => a.id === autorizacaoId) ?? (planejamento ? pedidos[0] : undefined)
  // Procedimentos da ficha clínica que ainda não estão em nenhum pedido: o pedido nasce ao enviar.
  const [marcados, setMarcados] = useState<string[]>([])
  const chaveFicha = ['mensagens-procedimentos', pacienteId]
  const ficha = useQuery({
    queryKey: chaveFicha,
    queryFn: async () =>
      (await api.get<ItemFicha[]>(`/pacientes/${pacienteId}/procedimentos`)).data,
    enabled: !!pacienteId,
  })
  const livres = (ficha.data ?? []).filter(
    (i) =>
      !i.autorizacao &&
      (i.status === 'A_REALIZAR' || i.status === 'EXECUTADO') &&
      (i.origem === 'CLINICO' ||
        i.orcamentoStatus === 'ABERTO' ||
        i.orcamentoStatus === 'APROVADO'),
  )
  const escolhidos = livres.filter((i) => marcados.includes(`${i.origem}-${i.id}`))

  const enviar = useMutation({
    mutationFn: async (r: { caminho: string; corpo: object; criar?: ItemFicha[] }) => {
      let caminho = r.caminho
      if (r.criar) {
        const novo = await api.post<{ id: number }>('/autorizacoes', {
          pacienteId,
          plano: null,
          itens: r.criar.map((i) => ({ origem: i.origem, id: i.id })),
        })
        setMarcados([])
        caminho = `/autorizacoes/${novo.data.id}/enviar`
      }
      return (await api.post(caminho, { canal, ...r.corpo })).data
    },
    onMutate: () => setWhatsappWeb(null),
    onSuccess: (_d, r) => {
      avisar(`Enviado por ${NOME_CANAL[canal]} para ${destino}`)
      if (r.caminho.startsWith('/mensagens')) setTexto('')
    },
    // Mesmo com erro o pedido pode ter sido criado (ex.: WhatsApp sem API): recarrega as listas.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: chave })
      qc.invalidateQueries({ queryKey: chaveFicha })
    },
    onError: (e) => {
      const link = isAxiosError(e) ? e.response?.data?.whatsappWeb : undefined
      if (link) setWhatsappWeb(link)
      else avisar(mensagemDeErro(e), true)
    },
  })

  const escolherPaciente = (id: number | undefined) => {
    setWhatsappWeb(null)
    setConsultaId(null)
    setAutorizacaoId(null)
    navegar({ search: { paciente: id }, replace: true })
  }
  const escolherModelo = (x: (typeof MODELOS)[number]) => {
    setModelo(x.id)
    setWhatsappWeb(null)
    if (x.texto) {
      setTexto(x.texto(primeiroNome))
      setAssunto(x.id === 'texto' ? '' : x.rotulo)
    }
  }

  // O que vai sair: caminho, pergunta da confirmação e o texto da prévia.
  const envio = !p
    ? null
    : livre
      ? {
          caminho: `/mensagens/paciente/${p.id}`,
          corpo: { assunto, texto },
          pergunta: `Enviar esta mensagem para ${p.nome}?`,
          previa: texto,
          pronto: !!texto.trim(),
        }
      : modelo === 'confirmacao'
        ? consulta && {
            caminho: `/confirmacoes/${consulta.id}/enviar`,
            corpo: {},
            pergunta: `Enviar a confirmação da consulta de ${dataBR(consulta.data)} às ${consulta.inicio} para ${p.nome}?`,
            previa: `Confirmação da consulta de ${dataBR(consulta.data)} às ${consulta.inicio} com ${consulta.profissional.nome}, com o link para confirmar.`,
            pronto: true,
          }
        : modelo === 'pdf'
          ? assinado && {
              caminho: `/autorizacoes/${assinado.id}/enviar`,
              corpo: {},
              pergunta: `Enviar o PDF assinado de "${assinado.titulo}" para ${p.nome}?`,
              previa: `${assinado.titulo}: o documento assinado em PDF, com o link para baixar.`,
              pronto: true,
            }
          : !planejamento && escolhidos.length
            ? {
                caminho: '',
                corpo: {},
                criar: escolhidos,
                pergunta: `Criar o pedido com ${escolhidos.length} procedimento(s) e enviar para ${p.nome} assinar?`,
                previa: `Procedimentos: ${[...new Set(escolhidos.map((i) => i.nome))].join(', ')}, com o link para ler e assinar.`,
                pronto: true,
              }
            : autorizacao && {
                caminho: `/autorizacoes/${autorizacao.id}/enviar`,
                corpo: {},
                pergunta: `Enviar "${autorizacao.titulo}" para ${p.nome} assinar?`,
                previa: `${autorizacao.titulo}, com o link para ler e assinar.`,
                pronto: true,
              }

  async function mandar() {
    if (!envio) return
    const ok = await confirmar(envio.pergunta, {
      titulo: 'Enviar mensagem?',
      botao: `Enviar por ${NOME_CANAL[canal]}`,
      perigo: false,
    })
    if (ok) enviar.mutate(envio)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-center gap-3 rounded-2xl bg-[#340972] px-4 py-3 text-white md:px-5">
        {/* Volta para a página de onde veio (ficha, agenda…); aberto direto, vai para Pacientes. */}
        <button
          type="button"
          className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-white/10"
          aria-label="Voltar"
          title="Voltar"
          onClick={() =>
            window.history.length > 1 ? window.history.back() : navegar({ to: '/pacientes' })
          }
        >
          <Icone nome="esquerda" className="h-5 w-5" />
        </button>
        <h1 className="mr-auto text-2xl font-extrabold text-white">Mensagens</h1>
        {p && (
          <>
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white font-extrabold text-primaria">
              {iniciais(p.nome)}
            </span>
            <div className="min-w-0 flex-1 sm:flex-none">
              <p className="font-bold break-words">{p.nome}</p>
              <p className="text-xs text-white/80">
                {d.consultas[0]
                  ? `Próxima: ${dataBR(d.consultas[0].data)} às ${d.consultas[0].inicio}`
                  : 'Sem consulta marcada'}
              </p>
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              <Link
                to="/pacientes/$id"
                params={{ id: String(p.id) }}
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl px-3 font-bold whitespace-nowrap text-destaque hover:bg-white/10"
              >
                Abrir ficha
              </Link>
              <button
                type="button"
                className="min-h-11 flex-1 rounded-xl border border-white/40 px-4 font-bold hover:bg-white/10"
                onClick={() => escolherPaciente(undefined)}
              >
                Trocar
              </button>
            </div>
          </>
        )}
      </header>

      {!p && (
        <section className="cartao space-y-2">
          <h2 id="msg-paciente" className="rotulo">
            Para qual paciente?
          </h2>
          <BuscaPaciente
            rotulo="msg-paciente"
            valor={null}
            aoEscolher={(x) => escolherPaciente(x?.id)}
            autoFocus
          />
          {dados.isError && <p className="text-perigo">{mensagemDeErro(dados.error)}</p>}
        </section>
      )}

      {p && d && (
        // pb no celular: espaço para o envio, que fica fixo acima da barra de baixo.
        <div className="flex flex-wrap items-stretch gap-5 max-md:pb-36 md:grid md:h-[calc(100dvh-7.5rem)] md:min-h-[32rem] md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)] lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
          {/* O que e por onde */}
          <section className="cartao min-w-0 flex-[1_1_22rem] space-y-4 p-5 ring-2 ring-primaria md:flex md:flex-col md:overflow-y-auto">
            <h2 id="msg-modelo" className="text-lg">
              O que e por onde
            </h2>
            <div role="group" aria-labelledby="msg-modelo" className="grid grid-cols-3 gap-2">
              {MODELOS.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  aria-pressed={modelo === x.id}
                  className={`${escolha(modelo === x.id)} flex min-h-24 flex-col items-center justify-center gap-1.5 p-2 text-center text-xs`}
                  onClick={() => escolherModelo(x)}
                >
                  <span className={`grid size-10 place-items-center rounded-xl ${x.cor}`}>
                    <Icone nome={x.icone} className="h-5 w-5" />
                  </span>
                  {x.rotulo}
                </button>
              ))}
            </div>

            {modelo === 'confirmacao' && (
              <Opcoes
                titulo="Qual consulta"
                vazio="Nenhuma consulta marcada a partir de hoje."
                itens={d.consultas.map((c) => ({
                  id: c.id,
                  titulo: `${dataBR(c.data)} às ${c.inicio}`,
                  nota: c.profissional.nome,
                  etiqueta: c.confirmadoEm ? 'Confirmada' : undefined,
                }))}
                marcado={consulta?.id}
                aoMarcar={setConsultaId}
              />
            )}
            {modelo === 'assinatura' && (
              <div role="group" aria-label="Tipo de pedido" className="grid grid-cols-2 gap-2">
                {[false, true].map((pl) => (
                  <button
                    key={String(pl)}
                    type="button"
                    aria-pressed={planejamento === pl}
                    className={`${escolha(planejamento === pl)} min-h-11 px-2`}
                    onClick={() => setPlanejamento(pl)}
                  >
                    {pl ? 'Planejamentos' : 'Procedimentos'} (
                    {pl ? abertos.filter((a) => a.planejamento).length : livres.length})
                  </button>
                ))}
              </div>
            )}
            {modelo === 'assinatura' && !planejamento && (
              <fieldset className="space-y-2 md:flex md:min-h-36 md:flex-1 md:flex-col">
                <legend className="rotulo">Da ficha clínica</legend>
                <div className="max-h-60 space-y-2 overflow-y-auto pr-1 md:max-h-none md:min-h-0 md:flex-1">
                  {livres.map((i) => {
                    const k = `${i.origem}-${i.id}`
                    const on = marcados.includes(k)
                    return (
                      <label
                        key={k}
                        className={`${escolha(on)} flex min-h-13 items-center gap-3 px-3.5 py-2 font-normal`}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => {
                            setAutorizacaoId(null)
                            setMarcados(on ? marcados.filter((x) => x !== k) : [...marcados, k])
                          }}
                        />
                        <span className="min-w-0 flex-1">
                          <b className="block break-words">
                            {i.nome}
                            {i.dente && ` · ${i.dente}${i.faces ? ` (${i.faces})` : ''}`}
                          </b>
                          <span className="text-sm text-suave">
                            {i.status === 'EXECUTADO' ? 'Executado' : 'A realizar'} ·{' '}
                            {i.profissional.nome}
                          </span>
                        </span>
                      </label>
                    )
                  })}
                </div>
                {!livres.length && (
                  <p className="text-sm text-suave">
                    Nenhum procedimento da ficha clínica fora de pedido. Lance em Plano e Ficha
                    Clínica.
                  </p>
                )}
              </fieldset>
            )}
            {modelo === 'assinatura' && (planejamento || pedidos.length > 0) && (
              <Opcoes
                key={String(planejamento)}
                titulo={planejamento ? 'Qual pedido' : 'Já enviados · reenviar'}
                vazio="Nenhum planejamento esperando assinatura. Crie na ficha, em Plano e Ficha Clínica."
                itens={pedidos.map((a) => ({
                  id: a.id,
                  titulo: a.titulo,
                  nota: `Criado em ${dataBR(a.criadoEm.slice(0, 10))}`,
                }))}
                marcado={autorizacao?.id}
                aoMarcar={(id) => {
                  setMarcados([])
                  setAutorizacaoId(id)
                }}
              />
            )}
            {modelo === 'pdf' && (
              <Opcoes
                titulo="Qual documento assinado"
                vazio="Nenhum plano assinado ainda."
                itens={assinados.map((a) => ({
                  id: a.id,
                  titulo: a.titulo,
                  nota: `Assinado em ${dataBR(a.assinadoEm!.slice(0, 10))}`,
                }))}
                marcado={assinado?.id}
                aoMarcar={setAutorizacaoId}
              />
            )}

            {livre && canal === 'EMAIL' && (
              <label className="block space-y-1">
                <span className="rotulo">Assunto</span>
                <input
                  className="campo min-h-11 text-base md:text-sm"
                  value={assunto}
                  maxLength={200}
                  placeholder="Mensagem da clínica"
                  onChange={(e) => setAssunto(e.target.value)}
                />
              </label>
            )}

            {/* Por onde: no fim do cartão; muda o fundo da conversa e o botão de envio. */}
            <div className="space-y-2 border-t border-borda pt-4 md:mt-auto">
              <h3 id="msg-canal" className="rotulo mb-0">
                Enviar por
              </h3>
              <div role="group" aria-labelledby="msg-canal" className="grid grid-cols-2 gap-2">
                {(['EMAIL', 'WHATSAPP'] as Canal[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={canal === c}
                    className={`${escolha(canal === c)} min-h-11 px-4`}
                    onClick={() => {
                      setCanal(c)
                      setWhatsappWeb(null)
                    }}
                  >
                    {NOME_CANAL[c]}
                  </button>
                ))}
              </div>
              <p
                className={`min-w-0 text-sm break-words ${destino ? 'text-suave' : 'font-bold text-perigo'}`}
              >
                {destino ? (
                  <>
                    Vai para <b className="text-texto">{destino}</b>
                  </>
                ) : (
                  `O paciente não tem ${canal === 'EMAIL' ? 'e-mail' : 'celular'} no cadastro.`
                )}
              </p>
            </div>
          </section>

          {/* Conversa: o que já foi enviado + prévia da nova */}
          <section
            aria-label="Conversa"
            className="flex min-w-0 flex-[999_1_28rem] flex-col md:min-h-0 overflow-hidden rounded-2xl border border-borda bg-superficie"
          >
            <ol
              className={`flex flex-1 flex-col gap-3 md:min-h-0 md:overflow-y-auto [&>:first-child]:mt-auto p-4 md:p-5 ${canal === 'WHATSAPP' ? 'bg-sucesso/8' : 'bg-superficie-2'}`}
            >
              {[...d.historico].reverse().map((h) => (
                <li
                  key={h.id}
                  className="max-w-[85%] self-end rounded-2xl rounded-br-sm border border-borda bg-superficie px-3.5 py-2.5"
                >
                  <p className="font-bold text-titulo">{NOME_TIPO[h.tipo] ?? h.tipo}</p>
                  {h.texto && (
                    <p className="line-clamp-3 break-words whitespace-pre-line">{h.texto}</p>
                  )}
                  <p
                    className={`mt-1 text-xs font-bold ${h.status === 'FALHOU' ? 'text-perigo' : 'text-suave'}`}
                  >
                    {NOME_CANAL[h.canal]} · {quando(h.criadoEm)}
                    {h.status === 'FALHOU' && ' · não enviada'}
                  </p>
                </li>
              ))}
              {!d.historico.length && (
                <li className="self-center text-sm text-suave">
                  Nada enviado para este paciente ainda.
                </li>
              )}
              <li className="self-center rounded-full bg-superficie px-3 py-1 text-xs font-extrabold text-suave">
                Nova mensagem · prévia
              </li>
              <li className="max-w-[85%] self-end rounded-2xl rounded-br-sm bg-primaria px-3.5 py-2.5 text-sobre-primaria outline-2 outline-offset-3 outline-primaria/40 outline-dashed">
                <p className="break-words whitespace-pre-line">
                  {envio?.previa ||
                    (livre ? 'Escreva a mensagem abaixo.' : 'Escolha uma opção ao lado.')}
                </p>
                <p className="mt-1 text-xs opacity-80">{NOME_CANAL[canal]} · ainda não enviada</p>
              </li>
            </ol>

            {whatsappWeb && (
              <div className="alerta-aviso m-4 mb-0 flex flex-wrap items-center gap-3">
                <p className="min-w-0 flex-1">
                  A API do WhatsApp ainda não está ligada. Abra o WhatsApp Web com a mensagem
                  pronta.
                </p>
                <a className="botao min-h-11" href={whatsappWeb} target="_blank" rel="noreferrer">
                  <Icone nome="externo" className="h-4 w-4" />
                  Abrir no WhatsApp
                </a>
              </div>
            )}

            <form
              className="flex flex-wrap items-end justify-end gap-2 border-borda p-3 max-md:fixed max-md:inset-x-3 max-md:bottom-24 max-md:z-40 max-md:rounded-2xl max-md:border max-md:bg-superficie max-md:shadow-lg md:border-t md:p-4"
              onSubmit={(e) => {
                e.preventDefault()
                mandar()
              }}
            >
              {livre && (
                <label className="min-w-0 flex-[1_1_16rem]">
                  <span className="sr-only">Mensagem</span>
                  <textarea
                    className="campo min-h-12 text-base md:min-h-24 md:text-sm"
                    rows={2}
                    value={texto}
                    maxLength={4000}
                    required
                    placeholder="Escreva a mensagem…"
                    onChange={(e) => setTexto(e.target.value)}
                  />
                </label>
              )}
              <button
                className="botao min-h-12 flex-1 sm:flex-none"
                disabled={!destino || !envio?.pronto || enviar.isPending}
              >
                <Icone nome="enviar" className="h-4 w-4" />
                {enviar.isPending ? 'Enviando…' : `Enviar por ${NOME_CANAL[canal]}`}
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}

const iniciais = (nome: string) =>
  nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join('')
    .toUpperCase()

/** Lista de escolha única (consulta ou pedido de assinatura). */
function Opcoes(props: {
  titulo: string
  vazio: string
  itens: { id: number; titulo: string; nota: string; etiqueta?: string }[]
  marcado: number | undefined
  aoMarcar: (id: number) => void
}) {
  // Lista curta: 3 de começo (a marcada sempre aparece), o resto num toque.
  const [todas, setTodas] = useState(false)
  const visiveis = todas
    ? props.itens
    : props.itens.filter((i, n) => n < 3 || i.id === props.marcado)
  return (
    <fieldset className="space-y-2">
      <legend className="rotulo">{props.titulo}</legend>
      {/* Aberta, a lista rola por dentro para não esticar o cartão (pedido do responsável). */}
      <div className={`space-y-2 ${todas ? 'max-h-60 overflow-y-auto pr-1' : ''}`}>
        {visiveis.map((i) => (
          <label
            key={i.id}
            className={`${escolha(props.marcado === i.id)} flex min-h-13 items-center gap-3 px-3.5 py-2 font-normal`}
          >
            <input
              type="radio"
              name={props.titulo}
              className="size-5 shrink-0"
              checked={props.marcado === i.id}
              onChange={() => props.aoMarcar(i.id)}
            />
            <span className="min-w-0 flex-1">
              <b className="block break-words">{i.titulo}</b>
              <span className="text-sm text-suave">{i.nota}</span>
            </span>
            {i.etiqueta && <span className="etiqueta etiqueta-sucesso">{i.etiqueta}</span>}
          </label>
        ))}
      </div>
      {visiveis.length < props.itens.length && (
        <button
          type="button"
          className="botao-fantasma min-h-11 w-full"
          onClick={() => setTodas(true)}
        >
          Mostrar todas ({props.itens.length})
        </button>
      )}
      {!props.itens.length && <p className="text-sm text-suave">{props.vazio}</p>}
    </fieldset>
  )
}
