// Controle Protético (R-082): quadro de 5 colunas com a ordem de serviço em cada cartão.
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import {
  api,
  consultaEu,
  consultaProfissionais,
  dataBR,
  errosDosCampos,
  isoLocal,
  mensagemDeErro,
  type Paciente,
} from '../api'
import { avisar } from '../estado'
import { pode } from '../../../shared/permissoes'
import { reais } from '../../../shared/financeiro'
import { ETAPAS, ORDEM_ETAPAS, type Etapa } from '../../../shared/protetico'
import { Dialogo } from '../componentes/Dialogo'
import { Avatar, BuscaPaciente, CampoBusca, iniciais } from '../componentes/BuscaPaciente'
import { normalizar } from '../../../shared/regras'
import { CampoData } from '../componentes/CampoData'
import { CampoReais } from '../componentes/CampoReais'
import { Icone } from '../componentes/Icones'
import { CampoSelect } from '../componentes/CampoSelect'
import { confirmar } from '../componentes/Confirmar'

interface Trabalho {
  id: number
  etapa: Etapa
  laboratorio: string
  laboratorioContato: string | null
  trabalho: string
  dentes: string | null
  cor: string | null
  prazo: string | null
  valorCentavos: number
  enviadoEm: string | null
  retornoEm: string | null
  instaladoEm: string | null
  observacoes: string | null
  paciente: { id: number; nome: string; celular: string | null }
  profissional: { id: number; nome: string }
}

const consultaProtetico = {
  queryKey: ['protetico'],
  queryFn: async () => (await api.get<Trabalho[]>('/protetico')).data,
}

/** Nomes distintos (ignorando acento e maiúscula), do mais usado ao menos usado. */
function contar(nomes: string[], unidade: string) {
  const vistos = new Map<string, { nome: string; n: number }>()
  for (const nome of nomes) {
    const k = normalizar(nome)
    const v = vistos.get(k)
    if (v) v.n++
    else vistos.set(k, { nome, n: 1 })
  }
  return [...vistos.values()]
    .sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome))
    .map((v) => ({ nome: v.nome, detalhe: `${v.n} ${unidade}${v.n > 1 ? 's' : ''}` }))
}

/**
 * Escolher um nome da lista, no mesmo padrão da busca de paciente: até 3 sugestões enquanto
 * digita, "Novo …" quando não existe, e o escolhido vira um cartão com "Trocar".
 */
function Escolha(props: {
  rotulo: string
  valor: string
  aoMudar: (v: string) => void
  opcoes: { nome: string; detalhe: string }[]
  placeholder: string
  textoNovo: string
  /** Texto embaixo do nome no cartão do escolhido (padrão: o detalhe da opção). */
  detalheEscolhido?: string
}) {
  const [busca, setBusca] = useState('')
  const [aberta, setAberta] = useState(false)
  const termo = busca.trim()
  const n = normalizar(termo)
  const achados = props.opcoes.filter((o) => normalizar(o.nome).includes(n)).slice(0, 3)
  const existe = props.opcoes.some((o) => normalizar(o.nome) === n)
  const escolher = (v: string) => {
    props.aoMudar(v)
    setBusca('')
    setAberta(false)
  }

  if (props.valor)
    return (
      <div className="flex items-center gap-3 rounded-xl border-2 border-primaria/40 bg-primaria-clara px-3 py-2">
        <Avatar texto={iniciais(props.valor)} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{props.valor}</p>
          <p className="truncate text-xs text-suave">
            {props.detalheEscolhido ??
              props.opcoes.find((o) => normalizar(o.nome) === normalizar(props.valor))?.detalhe ??
              'Novo'}
          </p>
        </div>
        <button
          type="button"
          className="botao-fantasma botao-pequeno"
          onClick={() => props.aoMudar('')}
        >
          Trocar
        </button>
      </div>
    )

  const mostrar = aberta && (achados.length > 0 || (!!termo && !existe))
  return (
    <div
      className="relative"
      onFocus={() => setAberta(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setAberta(false)}
    >
      <CampoBusca
        rotulo={props.rotulo}
        placeholder={props.placeholder}
        valor={busca}
        aoMudar={setBusca}
        aoEnter={() => termo && escolher(achados[0]?.nome ?? termo)}
      />
      {mostrar && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-borda bg-superficie shadow-[0_10px_30px_-8px_color-mix(in_srgb,black_30%,transparent)]"
        >
          {termo && !existe && (
            <button
              type="button"
              onClick={() => escolher(termo)}
              className="flex w-full items-center gap-2 border-b border-borda bg-superficie-2 px-3 py-2.5 text-left hover:bg-primaria-clara focus-visible:bg-primaria-clara"
            >
              <Icone nome="mais" className="h-5 w-5 shrink-0 text-suave" />
              <span className="min-w-0 truncate">
                {props.textoNovo}: <span className="font-bold">{termo}</span>
              </span>
            </button>
          )}
          {achados.map((o) => (
            <button
              key={o.nome}
              type="button"
              onClick={() => escolher(o.nome)}
              className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-primaria-clara focus-visible:bg-primaria-clara"
            >
              <Avatar texto={iniciais(o.nome)} pequeno />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-primaria">{o.nome}</span>
                <span className="text-xs text-suave">{o.detalhe}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Cor do topo de cada coluna, para separar bem uma etapa da outra.
const COR_ETAPA: Record<Etapa, string> = {
  PRE_ENVIO: 'border-t-suave',
  EM_LABORATORIO: 'border-t-info',
  AGENDAMENTO: 'border-t-secundaria',
  INSTALADO: 'border-t-sucesso',
}

// Prazo mais próximo primeiro; sem prazo vai para o fim.
const porPrazo = (a: Trabalho, b: Trabalho) =>
  (a.prazo ?? '9999').localeCompare(b.prazo ?? '9999') || a.id - b.id

function situacaoPrazo(t: Trabalho, hoje: string) {
  if (!t.prazo) return null
  if (t.etapa === 'INSTALADO') return { tipo: 'ok', classe: '', texto: `Prazo ${dataBR(t.prazo)}` }
  const dias = Math.round((Date.parse(t.prazo) - Date.parse(hoje)) / 864e5)
  if (dias < 0)
    return {
      tipo: 'atrasado',
      classe: 'etiqueta-perigo',
      texto: `Atrasado há ${-dias} dia${dias < -1 ? 's' : ''}`,
    }
  if (dias === 0) return { tipo: 'perto', classe: 'etiqueta-aviso', texto: 'Prazo hoje' }
  if (dias <= 3)
    return {
      tipo: 'perto',
      classe: 'etiqueta-aviso',
      texto: `Em ${dias} dia${dias > 1 ? 's' : ''} · ${dataBR(t.prazo)}`,
    }
  return { tipo: 'ok', classe: '', texto: `Prazo ${dataBR(t.prazo)}` }
}

export function Protetico() {
  const { data: eu } = useSuspenseQuery(consultaEu)
  const qc = useQueryClient()
  const lista = useQuery(consultaProtetico)
  const [aberto, setAberto] = useState<Trabalho | 'novo' | null>(null)
  const [arrastando, setArrastando] = useState<number | null>(null)
  const [alvo, setAlvo] = useState<Etapa | null>(null)
  const podeEditar = pode(eu.perfis, 'protetico.editar')
  const hoje = isoLocal(new Date())

  const mover = useMutation({
    mutationFn: async (d: { id: number; etapa: Etapa }) =>
      (await api.patch(`/protetico/${d.id}/etapa`, { etapa: d.etapa })).data,
    onMutate: (d) => {
      // Move na hora; se o servidor recusar, a lista volta ao recarregar.
      qc.setQueryData<Trabalho[]>(['protetico'], (l) =>
        l?.map((t) => (t.id === d.id ? { ...t, etapa: d.etapa } : t)),
      )
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
    onSettled: () => qc.invalidateQueries({ queryKey: ['protetico'] }),
  })

  const dragTerminou = () => {
    setArrastando(null)
    setAlvo(null)
  }
  const origem = lista.data?.find((t) => t.id === arrastando)?.etapa

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Controle Protético</h1>
          <p className="subtitulo">
            Trabalhos de laboratório, do envio à instalação. Arraste o cartão ou use as setas.
          </p>
        </div>
        {podeEditar && (
          <button className="botao" onClick={() => setAberto('novo')}>
            <Icone nome="mais" className="size-4" /> Novo trabalho
          </button>
        )}
      </header>

      {/* Colunas com largura mínima: se não couberem, o quadro rola de lado (com encaixe), nunca se sobrepõem. */}
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3">
        {ORDEM_ETAPAS.map((etapa, k) => {
          const cartoes = (lista.data?.filter((t) => t.etapa === etapa) ?? []).sort(porPrazo)
          const atrasados = cartoes.filter(
            (t) => situacaoPrazo(t, hoje)?.tipo === 'atrasado',
          ).length
          const ehAlvo = alvo === etapa && origem !== etapa
          return (
            <section
              key={etapa}
              aria-label={ETAPAS[etapa]}
              className={`flex min-h-[60vh] min-w-56 shrink-0 grow basis-[85%] snap-start flex-col rounded-2xl border-2 border-t-[6px] bg-superficie-2 sm:basis-0 ${COR_ETAPA[etapa]} ${
                ehAlvo ? 'border-dashed !border-primaria bg-primaria-clara' : 'border-borda'
              }`}
              onDragOver={(e) => {
                if (!podeEditar || arrastando === null) return
                e.preventDefault()
                if (alvo !== etapa) setAlvo(etapa)
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setAlvo(null)
              }}
              onDrop={() => {
                if (arrastando !== null && origem !== etapa) mover.mutate({ id: arrastando, etapa })
                dragTerminou()
              }}
            >
              <h2 className="flex items-center gap-2 border-b border-borda px-3 py-2.5 text-base">
                <span className="truncate">{ETAPAS[etapa]}</span>
                {atrasados > 0 && (
                  <span
                    className="etiqueta etiqueta-perigo ml-auto"
                    title={`${atrasados} atrasado${atrasados > 1 ? 's' : ''}`}
                  >
                    ! {atrasados}
                  </span>
                )}
                <span className={`etiqueta bg-superficie ${atrasados ? '' : 'ml-auto'}`}>
                  {cartoes.length}
                </span>
              </h2>

              <div className="flex min-h-40 flex-col gap-2 p-2">
                {ehAlvo && (
                  <p className="rounded-xl border-2 border-dashed border-primaria px-3 py-4 text-center font-bold text-primaria">
                    Soltar em {ETAPAS[etapa]}
                  </p>
                )}
                {!cartoes.length && !ehAlvo && (
                  <p className="m-auto py-6 text-center text-suave">Nenhum trabalho</p>
                )}
                {cartoes.map((t) => {
                  const prazo = situacaoPrazo(t, hoje)
                  const anterior = ORDEM_ETAPAS[k - 1]
                  const proxima = ORDEM_ETAPAS[k + 1]
                  return (
                    <article
                      key={t.id}
                      draggable={podeEditar}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move'
                        setArrastando(t.id)
                      }}
                      onDragEnd={dragTerminou}
                      className={`cartao p-0 shadow-sm hover:border-primaria/50 ${
                        podeEditar ? 'cursor-grab active:cursor-grabbing' : ''
                      } ${arrastando === t.id ? 'opacity-40' : ''} ${
                        prazo?.tipo === 'atrasado' ? 'border-l-4 border-l-perigo' : ''
                      }`}
                    >
                      <button
                        className="block w-full space-y-1 p-3 text-left"
                        onClick={() => setAberto(t)}
                      >
                        <p className="font-bold text-titulo">{t.paciente.nome}</p>
                        <p>
                          {t.trabalho}
                          {t.dentes && <span className="text-suave"> · {t.dentes}</span>}
                        </p>
                        <p className="text-xs text-suave">
                          {t.laboratorio} · {t.profissional.nome}
                        </p>
                        {prazo && (
                          <span
                            className={`etiqueta mt-1 ${prazo.classe}`}
                            title={`Prazo de entrega: ${dataBR(t.prazo!)}`}
                          >
                            {prazo.texto}
                          </span>
                        )}
                      </button>
                      {podeEditar && (
                        <div className="flex items-center gap-2 border-t border-borda p-2">
                          {anterior && (
                            <button
                              className="botao-leve botao-icone size-8 shrink-0"
                              title={`Voltar para ${ETAPAS[anterior]}`}
                              aria-label={`Voltar ${t.paciente.nome} para ${ETAPAS[anterior]}`}
                              onClick={() => mover.mutate({ id: t.id, etapa: anterior })}
                            >
                              <Icone nome="esquerda" className="size-4" />
                            </button>
                          )}
                          {proxima && (
                            <button
                              className="botao-leve botao-pequeno ml-auto min-w-0 py-1.5"
                              title={`Avançar para ${ETAPAS[proxima]}`}
                              aria-label={`Avançar ${t.paciente.nome} para ${ETAPAS[proxima]}`}
                              onClick={() => mover.mutate({ id: t.id, etapa: proxima })}
                            >
                              <span className="truncate">{ETAPAS[proxima]}</span>
                              <Icone nome="direita" className="size-4 shrink-0" />
                            </button>
                          )}
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      <Dialogo
        aberto={!!aberto}
        aoFechar={() => setAberto(null)}
        titulo={aberto === 'novo' ? 'Novo trabalho protético' : 'Ordem de serviço'}
        largo
      >
        {aberto && (
          <FormTrabalho
            trabalho={aberto === 'novo' ? undefined : aberto}
            podeEditar={podeEditar}
            aoTerminar={() => setAberto(null)}
          />
        )}
      </Dialogo>
    </div>
  )
}

function FormTrabalho(props: { trabalho?: Trabalho; podeEditar: boolean; aoTerminar: () => void }) {
  const qc = useQueryClient()
  const t = props.trabalho
  const { data: prof } = useQuery(consultaProfissionais)
  const [paciente, setPaciente] = useState<Pick<Paciente, 'id' | 'nome'> | null>(
    t?.paciente ?? null,
  )
  const [laboratorio, setLaboratorio] = useState(t?.laboratorio ?? '')
  const [trabalho, setTrabalho] = useState(t?.trabalho ?? '')
  // Sugestões saem dos trabalhos já cadastrados (a lista do quadro).
  const todos = useQuery(consultaProtetico).data ?? []
  const doLaboratorio = todos.filter(
    (x) => !laboratorio || normalizar(x.laboratorio) === normalizar(laboratorio),
  )
  // Contato do laboratório: o mais recente informado em algum trabalho dele.
  const contatoDe = (lab: string) =>
    todos
      .filter((x) => x.laboratorioContato && normalizar(x.laboratorio) === normalizar(lab))
      .sort((a, b) => b.id - a.id)[0]?.laboratorioContato ?? ''
  const [contato, setContato] = useState(t?.laboratorioContato ?? '')
  const laboratorios = contar(
    todos.map((x) => x.laboratorio),
    'trabalho',
  )
  // Valor padrão de um trabalho: o do cadastro mais recente com esse nome no laboratório.
  const valorPadrao = (nome: string) =>
    doLaboratorio
      .filter((x) => x.id !== t?.id && normalizar(x.trabalho) === normalizar(nome))
      .sort((a, b) => b.id - a.id)[0]?.valorCentavos
  const [profissionalId, setProfissionalId] = useState<number | ''>(
    t?.profissional.id ?? prof?.meuId ?? '',
  )
  const [valor, setValor] = useState(t?.valorCentavos ?? 0)
  const [datas, setDatas] = useState({
    prazo: t?.prazo ?? '',
    enviadoEm: t?.enviadoEm ?? '',
    retornoEm: t?.retornoEm ?? '',
    instaladoEm: t?.instaladoEm ?? '',
  })
  const atualizar = () => {
    qc.invalidateQueries({ queryKey: ['protetico'] })
    props.aoTerminar()
  }
  const salvar = useMutation({
    mutationFn: async (d: Record<string, unknown>) =>
      t ? (await api.put(`/protetico/${t.id}`, d)).data : (await api.post('/protetico', d)).data,
    onSuccess: () => {
      avisar(t ? 'Ordem de serviço salva' : 'Trabalho criado em Pré-envio')
      atualizar()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const excluir = useMutation({
    mutationFn: async () => (await api.delete(`/protetico/${t!.id}`)).data,
    onSuccess: () => {
      avisar('Trabalho excluído')
      atualizar()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const erros = errosDosCampos(salvar.error)
  const erro = (c: string) => erros[c] && <p className="mt-1 text-perigo">{erros[c]}</p>
  const data = (campo: keyof typeof datas, rotulo: string) => (
    <label>
      <span className="rotulo">{rotulo}</span>
      <CampoData
        anoCurto
        calendarioNoFluxo
        value={datas[campo]}
        onChange={(v) => setDatas({ ...datas, [campo]: v })}
      />
    </label>
  )

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        const f = Object.fromEntries(new FormData(e.currentTarget))
        salvar.mutate({
          ...f,
          ...datas,
          laboratorio,
          laboratorioContato: contato,
          trabalho,
          pacienteId: paciente?.id,
          profissionalId,
          valorCentavos: valor,
        })
      }}
    >
      <fieldset disabled={!props.podeEditar} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className="rotulo flex justify-between">
              Paciente *
              {paciente && (
                <Link
                  to="/pacientes/$id"
                  params={{ id: String(paciente.id) }}
                  className="text-xs font-bold text-primaria hover:underline"
                >
                  Abrir ficha
                </Link>
              )}
            </span>
            <BuscaPaciente
              valor={paciente as Paciente | null}
              aoEscolher={setPaciente}
              autoFocus={!t}
            />
            {erro('pacienteId')}
          </div>
          <label>
            <span className="rotulo">Profissional *</span>
            <CampoSelect
              value={profissionalId}
              onChange={(e) => setProfissionalId(Number(e.target.value) || '')}
              opcoes={prof?.profissionais.map((p) => [p.id, p.nome] as const)}
            />
            {erro('profissionalId')}
          </label>
          <div>
            <span id="rotulo-laboratorio" className="rotulo">
              Laboratório *
            </span>
            <Escolha
              rotulo="rotulo-laboratorio"
              valor={laboratorio}
              aoMudar={(v) => {
                setLaboratorio(v)
                setContato(v ? contatoDe(v) : '')
              }}
              opcoes={laboratorios.map((o) => ({
                ...o,
                detalhe: `${o.detalhe} · ${contatoDe(o.nome) || 'Sem contato'}`,
              }))}
              detalheEscolhido={`${
                laboratorios.find((o) => normalizar(o.nome) === normalizar(laboratorio))?.detalhe ??
                'Novo'
              } · ${contato || 'Sem contato'}`}
              placeholder="Buscar laboratório"
              textoNovo="Novo laboratório"
            />
            {erro('laboratorio')}
            {laboratorio && (
              <input
                className="campo mt-2"
                aria-label="Contato do laboratório"
                placeholder="Contato do laboratório (telefone, WhatsApp, e-mail)"
                maxLength={120}
                value={contato}
                onChange={(e) => setContato(e.target.value)}
              />
            )}
          </div>
          <div>
            <span id="rotulo-trabalho" className="rotulo">
              Trabalho *
            </span>
            <Escolha
              rotulo="rotulo-trabalho"
              valor={trabalho}
              aoMudar={(v) => {
                setTrabalho(v)
                const p = v && valorPadrao(v)
                if (p !== '' && p !== undefined) setValor(p)
              }}
              // Só os trabalhos já feitos pelo laboratório escolhido (mais usados primeiro), com o último valor.
              opcoes={contar(
                doLaboratorio.map((x) => x.trabalho),
                '',
              ).map((o) => ({
                nome: o.nome,
                detalhe: reais(
                  doLaboratorio
                    .filter((x) => normalizar(x.trabalho) === normalizar(o.nome))
                    .sort((a, b) => b.id - a.id)[0].valorCentavos,
                ),
              }))}
              placeholder="Ex.: coroa em porcelana"
              textoNovo="Novo trabalho"
            />
            {erro('trabalho')}
          </div>
          <label>
            <span className="rotulo">Dentes</span>
            <input
              name="dentes"
              className="campo"
              defaultValue={t?.dentes ?? ''}
              placeholder="Ex.: 11, 21"
            />
          </label>
          <label>
            <span className="rotulo">Cor</span>
            <input name="cor" className="campo" defaultValue={t?.cor ?? ''} placeholder="Ex.: A2" />
          </label>
          <CampoReais
            id="protetico-valor"
            rotulo="Valor do laboratório"
            valor={valor}
            aoMudar={setValor}
          />
          {data('prazo', 'Prazo de entrega')}
        </div>
        <label className="block">
          <span className="rotulo">Observações</span>
          <textarea
            name="observacoes"
            className="campo"
            rows={3}
            maxLength={1500}
            defaultValue={t?.observacoes ?? ''}
          />
        </label>
        {/* Datas opcionais: o quadro preenche sozinho ao mover o cartão. */}
        <div className="space-y-3 border-t-2 border-dashed border-borda pt-3">
          <p className="text-xs text-suave">
            Opcional: estas datas são preenchidas sozinhas ao mover o cartão no quadro.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {data('enviadoEm', 'Enviado em')}
            {data('retornoEm', 'Voltou em')}
            {data('instaladoEm', 'Instalado em')}
          </div>
        </div>
        {t && (
          <p className="text-suave">
            Etapa atual: <strong>{ETAPAS[t.etapa]}</strong> · valor {reais(t.valorCentavos)}
          </p>
        )}
      </fieldset>
      {props.podeEditar && (
        <div className="flex justify-between gap-2">
          {t ? (
            <button
              type="button"
              className="botao-leve text-perigo"
              disabled={excluir.isPending}
              onClick={async () =>
                (await confirmar(`Excluir o trabalho de ${t.paciente.nome}? Ele sai do quadro.`)) &&
                excluir.mutate()
              }
            >
              Excluir
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" className="botao-leve" onClick={props.aoTerminar}>
              Cancelar
            </button>
            <button className="botao" disabled={salvar.isPending}>
              Salvar
            </button>
          </div>
        </div>
      )}
    </form>
  )
}
