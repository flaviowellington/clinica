import { useState } from 'react'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import {
  api,
  consultaEu,
  consultaProfissionais,
  dataBR,
  errosDosCampos,
  mensagemDeErro,
  type Paciente,
} from '../api'
import { avisar } from '../estado'
import { pode } from '../../../shared/permissoes'
import { normalizar } from '../../../shared/regras'
import { reais } from '../../../shared/financeiro'
import {
  DENTES_DECIDUOS,
  DENTES_PERMANENTES,
  STATUS_ORCAMENTO,
  descontoDoPercentual,
  percentualDoDesconto,
  totalOrcamento,
  type StatusOrcamento,
} from '../../../shared/orcamentos'
import { Dialogo } from './Dialogo'
import { CampoReais } from './CampoReais'
import { CampoSelect } from './CampoSelect'
import { confirmar } from './Confirmar'
import { Icone } from './Icones'
import { CampoSugestoes } from './CampoSugestoes'
import { FormProcedimento } from '../paginas/Configuracoes'
import { Passo, Resumo } from './NovoAgendamento'

interface Item {
  id?: number
  procedimentoId: number
  nome: string
  dente: string | null
  /** Faces do dente quando o item veio do odontograma (ex.: "MO"). */
  faces?: string | null
  valorCentavos: number
  custoCentavos: number
  executadoEm?: string | null
  observacao?: string | null
  observacaoPaciente?: string | null
}
interface Orcamento {
  id: number
  status: StatusOrcamento
  criadoEm: string
  aprovadoEm: string | null
  observacoes: string | null
  descontoCentavos: number
  totalCentavos: number
  profissional: { id: number; nome: string }
  criadoPor: { nome: string }
  itens: Item[]
  contas: {
    id: number
    parcela: number
    valorCentavos: number
    vencimento: string
    forma: string | null
    status: string
  }[]
}
interface Procedimento {
  id: number
  nome: string
  especialidade: string | null
  valorCentavos: number
  custoCentavos: number
}

const COR_STATUS: Record<StatusOrcamento, string> = {
  ABERTO: 'bg-info/15 text-info',
  APROVADO: 'bg-sucesso/15 text-sucesso',
  CANCELADO: 'bg-perigo/15 text-perigo',
}
const TODOS_DENTES = [...DENTES_PERMANENTES.flat(), ...DENTES_DECIDUOS.flat()].map(String)

export function SeloOrcamento({ status }: { status: StatusOrcamento }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COR_STATUS[status]}`}>
      {STATUS_ORCAMENTO[status]}
    </span>
  )
}

/** Bloco "Orçamentos" da ficha do paciente (S-004). */
export function OrcamentosPaciente({ paciente }: { paciente: Paciente }) {
  const { data: eu } = useSuspenseQuery(consultaEu)
  const [aberto, setAberto] = useState<Orcamento | 'novo' | null>(null)
  // Orçamentos marcados na lista para somar os valores.
  const [marcados, setMarcados] = useState<number[]>([])
  const lista = useQuery({
    queryKey: ['orcamentos', paciente.id],
    queryFn: async () =>
      (await api.get<Orcamento[]>('/orcamentos', { params: { pacienteId: paciente.id } })).data,
  })
  const titulo = aberto === 'novo' ? 'Novo orçamento' : aberto ? `Orçamento nº ${aberto.id}` : ''
  const selecionados = lista.data?.filter((o) => marcados.includes(o.id)) ?? []
  const todos = !!lista.data?.length && selecionados.length === lista.data.length
  const alternar = (id: number) =>
    setMarcados(marcados.includes(id) ? marcados.filter((m) => m !== id) : [...marcados, id])
  const qc = useQueryClient()
  const excluir = useMutation({
    mutationFn: (id: number) => api.delete(`/orcamentos/${id}`),
    onSuccess: () => {
      avisar('Orçamento excluído')
      qc.invalidateQueries({ queryKey: ['orcamentos', paciente.id] })
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const podeExcluir = (o: Orcamento) => pode(eu.perfis, 'orcamento.editar') && o.status === 'ABERTO'

  return (
    <section className="cartao space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Orçamentos e tratamentos</h2>
        {pode(eu.perfis, 'orcamento.editar') && paciente.ativo && (
          <button className="botao py-1.5" onClick={() => setAberto('novo')}>
            Novo orçamento
          </button>
        )}
      </div>
      {lista.data?.length === 0 && <p className="text-suave">Nenhum orçamento ainda.</p>}
      {!!lista.data?.length && (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-borda text-suave">
              <tr>
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Selecionar todos os orçamentos"
                    checked={todos}
                    onChange={() => setMarcados(todos ? [] : lista.data.map((o) => o.id))}
                  />
                </th>
                {['Nº', 'Data', 'Situação', 'Tratamento', 'Profissional', 'Valor'].map((t) => (
                  <th key={t} className="px-3 py-2 font-medium">
                    {t}
                  </th>
                ))}
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {lista.data.map((o) => (
                <tr
                  key={o.id}
                  className="group cursor-pointer border-b border-borda last:border-0 hover:bg-primaria-clara"
                  onClick={() => setAberto(o)}
                >
                  {/* Clicar na caixa só marca; o resto da linha abre o orçamento. */}
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Selecionar orçamento nº ${o.id}`}
                      checked={marcados.includes(o.id)}
                      onChange={() => alternar(o.id)}
                    />
                  </td>
                  <td className="px-3 py-2">{o.id}</td>
                  <td className="px-3 py-2">{dataBR(o.criadoEm)}</td>
                  <td className="px-3 py-2">
                    <SeloOrcamento status={o.status} />
                  </td>
                  <td className="max-w-80 truncate px-3 py-2">
                    {o.itens.map((i) => (i.dente ? `${i.nome} (${i.dente})` : i.nome)).join('; ')}
                  </td>
                  <td className="px-3 py-2">{o.profissional.nome}</td>
                  <td className="px-3 py-2 font-medium">{reais(o.totalCentavos)}</td>
                  <td className="px-1 py-1 text-right">
                    {podeExcluir(o) && (
                      <button
                        type="button"
                        className="botao-fantasma botao-icone text-suave opacity-0 group-hover:opacity-100 hover:text-perigo focus-visible:opacity-100"
                        aria-label={`Excluir orçamento nº ${o.id}`}
                        title="Excluir orçamento"
                        disabled={excluir.isPending}
                        onClick={async (e) => {
                          e.stopPropagation()
                          if (
                            await confirmar(`Excluir o orçamento nº ${o.id}?`, {
                              titulo: 'Excluir orçamento',
                              botao: 'Excluir',
                            })
                          )
                            excluir.mutate(o.id)
                        }}
                      >
                        <Icone nome="lixeira" className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selecionados.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-primaria bg-primaria-clara px-4 py-3">
          <div>
            <p className="text-suave">
              {selecionados.length}{' '}
              {selecionados.length === 1 ? 'orçamento selecionado' : 'orçamentos selecionados'}
            </p>
            <p className="text-2xl">
              Total:{' '}
              <strong>
                {reais(
                  totalOrcamento(selecionados.map((o) => ({ valorCentavos: o.totalCentavos }))),
                )}
              </strong>
            </p>
          </div>
          <button type="button" className="botao-leve py-1.5" onClick={() => setMarcados([])}>
            Limpar seleção
          </button>
        </div>
      )}
      <Dialogo aberto={!!aberto} aoFechar={() => setAberto(null)} titulo={titulo} largo>
        {aberto === 'novo' && (
          <EditorOrcamento paciente={paciente} aoTerminar={() => setAberto(null)} />
        )}
        {aberto && aberto !== 'novo' && aberto.status === 'ABERTO' && (
          <EditorOrcamento
            paciente={paciente}
            orcamento={aberto}
            aoTerminar={() => setAberto(null)}
          />
        )}
        {aberto && aberto !== 'novo' && aberto.status !== 'ABERTO' && (
          <VerOrcamento
            orcamento={aberto}
            pacienteId={paciente.id}
            aoTerminar={() => setAberto(null)}
          />
        )}
      </Dialogo>
    </section>
  )
}

const paraItem = (p: Procedimento): Item => ({
  procedimentoId: p.id,
  nome: p.nome,
  dente: null,
  valorCentavos: p.valorCentavos,
  custoCentavos: p.custoCentavos,
})

/** Busca na tabela de preços com seleção de vários procedimentos e o total dos marcados. */
function ListaProcedimentos(props: { botao: string; aoConfirmar: (ps: Procedimento[]) => void }) {
  const { data: eu } = useSuspenseQuery(consultaEu)
  const [busca, setBusca] = useState('')
  const [cadastrando, setCadastrando] = useState(false)
  // Marcados sobrevivem a novas buscas.
  const [marcados, setMarcados] = useState<Procedimento[]>([])
  const alternar = (p: Procedimento) =>
    setMarcados(
      marcados.some((m) => m.id === p.id)
        ? marcados.filter((m) => m.id !== p.id)
        : [...marcados, p],
    )
  const confirmar = () => {
    props.aoConfirmar(marcados)
    setMarcados([])
    setBusca('')
  }
  const tabela = useQuery({
    queryKey: ['procedimentos', busca],
    queryFn: async () =>
      (await api.get<Procedimento[]>('/procedimentos', { params: { busca } })).data,
  })
  return (
    // Busca e bandeja ficam sempre à vista; só a lista do meio rola.
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="relative shrink-0">
        <Icone
          nome="busca"
          className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-suave"
        />
        <input
          type="search"
          className="campo pl-9"
          placeholder="Buscar procedimento (qualquer parte do nome)"
          aria-label="Buscar procedimento"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>
      <ul className="min-h-32 flex-1 overflow-y-auto rounded-xl border border-borda max-lg:max-h-64">
        {pode(eu.perfis, 'configuracao.editar') &&
          !tabela.data?.some((p) => normalizar(p.nome) === normalizar(busca.trim())) && (
            <li>
              <button
                type="button"
                onClick={() => setCadastrando(true)}
                className="flex w-full items-center gap-2 border-b border-borda bg-superficie-2 px-3 py-2.5 text-left hover:bg-primaria-clara focus-visible:bg-primaria-clara"
              >
                <Icone nome="mais" className="h-5 w-5 shrink-0 text-suave" />
                <span className="min-w-0 truncate">
                  Novo procedimento{busca.trim() && ': '}
                  {busca.trim() && <span className="font-bold">{busca.trim()}</span>}
                </span>
              </button>
            </li>
          )}
        {tabela.data?.length === 0 && (
          <li className="px-3 py-3 text-suave">Nenhum procedimento encontrado.</li>
        )}
        {tabela.data?.map((p) => {
          const sel = marcados.some((m) => m.id === p.id)
          return (
            <li key={p.id}>
              <label
                className={`flex w-full cursor-pointer items-center gap-2.5 border-b border-borda px-3 py-2 last:border-b-0 ${sel ? 'bg-primaria-clara' : 'hover:bg-superficie-2'}`}
              >
                <input type="checkbox" checked={sel} onChange={() => alternar(p)} />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate ${sel ? 'font-bold text-primaria' : ''}`}>
                    {p.nome}
                  </span>
                  {p.especialidade && (
                    <span className="block truncate text-xs text-suave">{p.especialidade}</span>
                  )}
                </span>
                <span className="font-bold whitespace-nowrap text-suave tabular-nums">
                  {reais(p.valorCentavos)}
                </span>
              </label>
            </li>
          )
        })}
      </ul>
      {marcados.length > 0 && (
        <div className="shrink-0 space-y-2 rounded-xl border border-primaria/25 bg-primaria-clara p-2.5">
          <ul className="flex max-h-20 flex-wrap gap-1.5 overflow-y-auto">
            {marcados.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-1 rounded-full bg-superficie py-0.5 pr-0.5 pl-2.5 text-xs font-bold"
              >
                <span className="max-w-48 truncate">{m.nome}</span>
                <button
                  type="button"
                  className="grid size-5 place-items-center rounded-full text-suave hover:bg-perigo/10 hover:text-perigo"
                  aria-label={`Tirar ${m.nome}`}
                  title="Tirar"
                  onClick={() => alternar(m)}
                >
                  <Icone nome="fechar" className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-auto text-sm">
              {marcados.length} {marcados.length === 1 ? 'selecionado' : 'selecionados'} · Total:{' '}
              <strong>{reais(totalOrcamento(marcados))}</strong>
            </span>
            <button
              type="button"
              className="botao-fantasma botao-pequeno"
              onClick={() => setMarcados([])}
            >
              Limpar
            </button>
            {props.botao && (
              <button type="button" className="botao botao-pequeno" onClick={confirmar}>
                <Icone nome="mais" className="h-3.5 w-3.5" />
                {props.botao}
              </button>
            )}
          </div>
        </div>
      )}
      <Dialogo
        aberto={cadastrando}
        aoFechar={() => setCadastrando(false)}
        titulo="Novo procedimento"
      >
        {cadastrando && (
          <FormProcedimento
            nomeInicial={busca.trim()}
            aoTerminar={(salvo) => {
              setCadastrando(false)
              if (salvo) setMarcados([...marcados, salvo])
            }}
          />
        )}
      </Dialogo>
    </div>
  )
}

function EditorOrcamento(props: {
  paciente: Paciente
  orcamento?: Orcamento
  aoTerminar: () => void
}) {
  const o = props.orcamento
  const qc = useQueryClient()
  const { data: eu } = useSuspenseQuery(consultaEu)
  const { data: prof } = useQuery(consultaProfissionais)
  const [itens, setItens] = useState<Item[]>(o?.itens ?? [])
  const [profissionalId, setProfissionalId] = useState<number | ''>(
    o?.profissional.id ?? prof?.meuId ?? '',
  )
  // Desconto fixo (R$) ou em %; no %, o valor em reais acompanha o subtotal.
  const [modoDesconto, setModoDesconto] = useState<'REAIS' | 'PERCENTUAL'>('REAIS')
  const [descontoFixo, setDescontoFixo] = useState(o?.descontoCentavos ?? 0)
  const [percentual, setPercentual] = useState(0)
  const [observacoes, setObservacoes] = useState(o?.observacoes ?? '')
  const escolher = (ps: Procedimento[]) =>
    // R-012: valor da tabela, editável na linha.
    setItens([...itens, ...ps.map(paraItem)])
  const mudarItem = (n: number, d: Partial<Item>) =>
    setItens(itens.map((i, x) => (x === n ? { ...i, ...d } : i)))

  const subtotal = totalOrcamento(itens)
  const desconto =
    modoDesconto === 'PERCENTUAL' ? descontoDoPercentual(subtotal, percentual) : descontoFixo
  const total = totalOrcamento(itens, desconto)
  const custo = itens.reduce((s, i) => s + i.custoCentavos, 0)
  const trocarModo = (m: typeof modoDesconto) => {
    // Troca mantendo o mesmo desconto, só mudando como ele é digitado.
    if (m === 'PERCENTUAL') setPercentual(percentualDoDesconto(subtotal, descontoFixo))
    else setDescontoFixo(desconto)
    setModoDesconto(m)
  }

  const corpo = () => ({
    pacienteId: props.paciente.id,
    profissionalId,
    // As observações do plano de tratamento vão junto para não se perderem ao editar.
    itens: itens.map(
      ({
        procedimentoId,
        dente,
        faces,
        valorCentavos,
        custoCentavos,
        observacao,
        observacaoPaciente,
      }) => ({
        procedimentoId,
        dente,
        faces,
        valorCentavos,
        custoCentavos,
        observacao,
        observacaoPaciente,
      }),
    ),
    descontoCentavos: desconto,
    observacoes,
  })
  const atualizar = () => {
    qc.invalidateQueries({ queryKey: ['orcamentos', props.paciente.id] })
    qc.invalidateQueries({ queryKey: ['lancamentos'] })
  }
  const salvar = useMutation({
    mutationFn: async (aprovar: boolean) => {
      const salvo = o
        ? (await api.put<Orcamento>(`/orcamentos/${o.id}`, corpo())).data
        : (await api.post<Orcamento>('/orcamentos', corpo())).data
      if (aprovar) return (await api.post<Orcamento>(`/orcamentos/${salvo.id}/aprovar`)).data
      return salvo
    },
    onSuccess: (r) => {
      avisar(r.status === 'APROVADO' ? 'Orçamento aprovado' : 'Orçamento salvo')
      atualizar()
      props.aoTerminar()
    },
    onError: (e) => {
      avisar(mensagemDeErro(e), true)
      atualizar()
    },
  })
  const erros = errosDosCampos(salvar.error)
  const profissional = prof?.profissionais.find((p) => p.id === profissionalId)
  return (
    // Mesmo formato do "Adicionar" da agenda: altura fixa, colunas que rolam por dentro e
    // rodapé sempre à vista, para os botões nunca ficarem escondidos.
    <div className="flex flex-col gap-4 lg:h-[min(760px,calc(100dvh-11rem))]">
      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        {/* ---------- O que entra ---------- */}
        <div className="flex min-h-0 flex-col gap-5">
          <Passo n={1} id="passo-profissional" titulo="Profissional" feito={!!profissionalId}>
            <CampoSelect
              aria-label="Profissional"
              value={profissionalId}
              onChange={(e) => setProfissionalId(Number(e.target.value) || '')}
              opcoes={prof?.profissionais.map((p) => [p.id, p.nome] as const)}
            />
            {erros.profissionalId && <p className="erro-campo">{erros.profissionalId}</p>}
          </Passo>

          <Passo
            n={2}
            id="passo-procedimentos"
            titulo="Procedimentos"
            feito={itens.length > 0}
            className="flex min-h-0 flex-1 flex-col"
          >
            <ListaProcedimentos botao="Adicionar ao orçamento" aoConfirmar={escolher} />
          </Passo>
        </div>

        {/* ---------- Como fica ---------- */}
        <Passo
          n={3}
          id="passo-itens"
          titulo="Itens do orçamento"
          feito={itens.length > 0}
          extra={
            itens.length > 0 && (
              <span className="etiqueta etiqueta-primaria">
                {itens.length} {itens.length === 1 ? 'item' : 'itens'}
              </span>
            )
          }
          className="flex min-h-0 flex-col"
        >
          <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-2xl border border-borda bg-superficie-2 p-3 sm:p-4">
            {(erros.itens || erros.descontoCentavos) && (
              <p className="alerta-perigo shrink-0">{erros.itens ?? erros.descontoCentavos}</p>
            )}
            {!itens.length ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-borda px-4 py-10 text-center text-suave">
                <Icone nome="dente" className="h-8 w-8" />
                <p className="max-w-64 text-sm">
                  Marque os procedimentos ao lado e use “Adicionar ao orçamento”.
                </p>
              </div>
            ) : (
              <ul className="-mx-1 min-h-0 flex-1 space-y-2 overflow-y-auto px-1 max-lg:max-h-[50vh]">
                {itens.map((i, n) => (
                  <li
                    key={n}
                    // Grade fixa: a lixeira fica sempre na última coluna; nome longo quebra a linha.
                    className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2 rounded-xl border border-borda bg-superficie p-2.5 sm:grid-cols-[minmax(0,1fr)_6rem_7.5rem_7.5rem_auto]"
                  >
                    <div className="col-span-4 min-w-0 self-center sm:col-span-1">
                      <p className="font-bold break-words">{i.nome}</p>
                      {i.faces && <p className="text-xs text-suave">Faces: {i.faces}</p>}
                    </div>
                    <div>
                      <CampoSugestoes
                        sugestoes={TODOS_DENTES}
                        value={i.dente ?? ''}
                        onChange={(v) => mudarItem(n, { dente: v || null })}
                        placeholder="Dente"
                        aria-label={`Dente ou região: ${i.nome}`}
                      />
                    </div>
                    <div>
                      <span className="mb-0.5 block text-xs font-bold text-suave" aria-hidden>
                        Custo
                      </span>
                      <CampoReais
                        id={`custo-item-${n}`}
                        rotulo={`Custo: ${i.nome}`}
                        rotuloOculto
                        valor={i.custoCentavos}
                        aoMudar={(v) => mudarItem(n, { custoCentavos: v })}
                      />
                    </div>
                    <div>
                      <span className="mb-0.5 block text-xs font-bold text-suave" aria-hidden>
                        Valor final
                      </span>
                      <CampoReais
                        id={`valor-item-${n}`}
                        rotulo={`Valor: ${i.nome}`}
                        rotuloOculto
                        valor={i.valorCentavos}
                        aoMudar={(v) => mudarItem(n, { valorCentavos: v })}
                      />
                    </div>
                    <button
                      type="button"
                      className="botao-fantasma botao-icone text-suave hover:bg-perigo/10 hover:text-perigo"
                      aria-label={`Remover ${i.nome}`}
                      title="Remover"
                      onClick={() => setItens(itens.filter((_, x) => x !== n))}
                    >
                      <Icone nome="lixeira" className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="shrink-0 space-y-3 border-t border-borda pt-3">
              <div className="flex flex-wrap items-end gap-3">
                <fieldset>
                  <legend className="rotulo text-sm">Desconto</legend>
                  <div className="flex rounded-xl bg-superficie p-1">
                    {(
                      [
                        ['REAIS', 'Valor fixo (R$)'],
                        ['PERCENTUAL', 'Porcentagem (%)'],
                      ] as const
                    ).map(([m, rotulo]) => (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={modoDesconto === m}
                        onClick={() => trocarModo(m)}
                        className={`rounded-lg px-3 py-1.5 text-sm font-bold ${modoDesconto === m ? 'bg-primaria text-sobre-primaria' : 'text-suave hover:text-texto'}`}
                      >
                        {rotulo}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <div className="w-36">
                  {modoDesconto === 'REAIS' ? (
                    <CampoReais
                      id="desconto"
                      rotulo="Desconto"
                      rotuloOculto
                      valor={descontoFixo}
                      aoMudar={setDescontoFixo}
                    />
                  ) : (
                    <label>
                      <span className="sr-only">Desconto (%)</span>
                      <input
                        type="number"
                        className="campo"
                        min={0}
                        max={100}
                        step={0.01}
                        placeholder="0"
                        value={percentual || ''}
                        onChange={(e) =>
                          setPercentual(Math.min(100, Math.max(0, Number(e.target.value))))
                        }
                      />
                    </label>
                  )}
                </div>
                {/* Conta automática: mostra o desconto no outro formato. */}
                {subtotal > 0 && desconto > 0 && (
                  <p className="pb-2 text-sm text-suave">
                    {modoDesconto === 'REAIS'
                      ? `= ${percentualDoDesconto(subtotal, desconto).toLocaleString('pt-BR')}% do subtotal`
                      : `= ${reais(desconto)} de desconto`}
                  </p>
                )}
              </div>
              <dl className="space-y-0.5 text-sm">
                <div className="flex justify-between text-suave">
                  <dt>Subtotal</dt>
                  <dd className="tabular-nums">{reais(subtotal)}</dd>
                </div>
                {desconto > 0 && (
                  <div className="flex justify-between text-suave">
                    <dt>Desconto</dt>
                    <dd className="tabular-nums">− {reais(desconto)}</dd>
                  </div>
                )}
                <div className="flex justify-between text-suave">
                  <dt>Custo</dt>
                  <dd className="tabular-nums">− {reais(custo)}</dd>
                </div>
                <div
                  className={`flex justify-between font-bold ${total - custo < 0 ? 'text-perigo' : 'text-sucesso'}`}
                >
                  <dt>Lucro estimado</dt>
                  <dd className="tabular-nums">{reais(total - custo)}</dd>
                </div>
              </dl>
            </div>
          </div>
        </Passo>
      </div>

      <details className="group shrink-0 rounded-xl border border-borda" open={!!o?.observacoes}>
        <summary className="flex items-center justify-between gap-2 px-3 py-2 font-bold [&::-webkit-details-marker]:hidden">
          <span>Observações</span>
          <span className="text-suave group-open:rotate-180">▾</span>
        </summary>
        <div className="border-t border-borda p-3">
          <textarea
            aria-label="Observações"
            className="campo"
            rows={2}
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
          />
        </div>
      </details>

      {/* ---------- Resumo ---------- */}
      <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t border-borda pt-4">
        <dl className="flex w-full min-w-0 flex-wrap items-baseline gap-x-5 gap-y-1 text-sm sm:w-auto sm:flex-1">
          <Resumo rotulo="Paciente">{props.paciente.nome}</Resumo>
          <Resumo rotulo="Com">{profissional?.nome}</Resumo>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-xs text-suave">Total</dt>
            <dd className="text-xl font-extrabold text-titulo tabular-nums">{reais(total)}</dd>
          </div>
        </dl>
        <div className="ml-auto flex gap-2">
          <button type="button" className="botao-leve" onClick={props.aoTerminar}>
            Cancelar
          </button>
          {/* R-010: Salvar e Aprovar só aparecem depois do primeiro procedimento. */}
          {itens.length > 0 && (
            <>
              <button
                type="button"
                className="botao-leve"
                disabled={salvar.isPending}
                onClick={() => salvar.mutate(false)}
              >
                Salvar
              </button>
              {pode(eu.perfis, 'orcamento.aprovar') && (
                <button
                  type="button"
                  className="botao"
                  disabled={salvar.isPending}
                  onClick={async () =>
                    (await confirmar(
                      'Aprovar este orçamento? Ele vira tratamento e o total entra como conta a receber. A forma de pagamento se escolhe ao receber, no Financeiro.',
                      { titulo: 'Aprovar orçamento', botao: 'Aprovar', perigo: false },
                    )) && salvar.mutate(true)
                  }
                >
                  Aprovar
                </button>
              )}
            </>
          )}
        </div>
      </footer>
    </div>
  )
}

/** Orçamento aprovado ou cancelado: só leitura (R-038). */
function VerOrcamento(props: { orcamento: Orcamento; pacienteId: number; aoTerminar: () => void }) {
  const o = props.orcamento
  const qc = useQueryClient()
  const { data: eu } = useSuspenseQuery(consultaEu)
  const [itens, setItens] = useState(o.itens)
  const [acao, setAcao] = useState<'desaprovar' | 'cancelar' | null>(null)
  const atualizar = () => {
    qc.invalidateQueries({ queryKey: ['orcamentos', props.pacienteId] })
    qc.invalidateQueries({ queryKey: ['lancamentos'] })
  }
  const executar = useMutation({
    mutationFn: async (id: number) =>
      (await api.post<Item>(`/orcamentos/itens/${id}/executar`)).data,
    onSuccess: (novo) => {
      setItens(itens.map((i) => (i.id === novo.id ? { ...i, executadoEm: novo.executadoEm } : i)))
      atualizar()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const mudar = useMutation({
    mutationFn: async (d: { acao: 'desaprovar' | 'cancelar'; senha?: string; ciente?: boolean }) =>
      (await api.post(`/orcamentos/${o.id}/${d.acao}`, d)).data,
    onSuccess: (_r, d) => {
      avisar(
        d.acao === 'cancelar'
          ? 'Orçamento cancelado'
          : 'Orçamento desaprovado: voltou a ficar em aberto',
      )
      atualizar()
      props.aoTerminar()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const aprovado = o.status === 'APROVADO'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SeloOrcamento status={o.status} />
        <span className="text-suave">
          Criado em {dataBR(o.criadoEm)} por {o.criadoPor.nome} · {o.profissional.nome}
          {o.aprovadoEm && ` · aprovado em ${dataBR(o.aprovadoEm)}`}
        </span>
      </div>

      <table className="w-full text-left">
        <thead className="border-b border-borda text-suave">
          <tr>
            <th className="py-1 font-medium">Procedimento</th>
            <th className="py-1 font-medium">Dente</th>
            <th className="py-1 font-medium">Situação</th>
            <th className="py-1 text-right font-medium">Valor</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((i) => (
            <tr key={i.id} className="border-b border-borda">
              <td className="py-1.5">{i.nome}</td>
              <td className="py-1.5">{i.dente}</td>
              <td className="py-1.5">
                {aprovado && pode(eu.perfis, 'procedimento.executar') ? (
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!i.executadoEm}
                      disabled={executar.isPending}
                      onChange={() => executar.mutate(i.id!)}
                    />
                    {i.executadoEm ? `Executado em ${dataBR(i.executadoEm)}` : 'A realizar'}
                  </label>
                ) : i.executadoEm ? (
                  `Executado em ${dataBR(i.executadoEm)}`
                ) : (
                  'A realizar'
                )}
              </td>
              <td className="py-1.5 text-right">{reais(i.valorCentavos)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-right">
        {o.descontoCentavos > 0 && (
          <span className="mr-4 text-suave">Desconto: {reais(o.descontoCentavos)}</span>
        )}
        Total: <strong>{reais(o.totalCentavos)}</strong>
      </p>

      {o.contas.length > 0 && (
        <div>
          <p className="mb-1 font-medium">A receber</p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {o.contas.map((c) => (
              <li
                key={c.id}
                className="flex justify-between rounded border border-borda px-3 py-1.5"
              >
                <span>
                  {c.parcela}ª · {dataBR(c.vencimento)} · {c.forma ?? ''}
                </span>
                <span>
                  {reais(c.valorCentavos)}{' '}
                  <span
                    className={
                      c.status === 'PAGA'
                        ? 'text-sucesso'
                        : c.status === 'CANCELADA'
                          ? 'text-suave'
                          : ''
                    }
                  >
                    (
                    {c.status === 'PAGA'
                      ? 'paga'
                      : c.status === 'CANCELADA'
                        ? 'cancelada'
                        : 'em aberto'}
                    )
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {o.observacoes && <p className="whitespace-pre-wrap text-suave">{o.observacoes}</p>}

      {aprovado && acao === 'desaprovar' && (
        <form
          className="space-y-2 rounded-lg border border-borda p-3"
          onSubmit={(e) => {
            e.preventDefault()
            mudar.mutate({
              acao: 'desaprovar',
              senha: String(new FormData(e.currentTarget).get('senha')),
            })
          }}
        >
          <p>
            Para desaprovar, confirme com a sua senha. A venda e as parcelas em aberto serão
            desfeitas.
          </p>
          <input
            name="senha"
            type="password"
            className="campo"
            aria-label="Sua senha"
            autoComplete="current-password"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button type="button" className="botao-leve" onClick={() => setAcao(null)}>
              Voltar
            </button>
            <button className="botao" disabled={mudar.isPending}>
              Desaprovar
            </button>
          </div>
        </form>
      )}
      {aprovado && acao === 'cancelar' && (
        <form
          className="space-y-2 rounded-lg border border-perigo/40 p-3"
          onSubmit={(e) => {
            e.preventDefault()
            mudar.mutate({
              acao: 'cancelar',
              ciente: new FormData(e.currentTarget).get('ciente') === 'on',
            })
          }}
        >
          <p>
            O orçamento fica cancelado no sistema, as parcelas em aberto são canceladas e entra um
            lançamento de cancelamento na conta corrente. A venda continua registrada.
          </p>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="ciente" required /> Estou ciente de que não dá para
            desfazer
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className="botao-leve" onClick={() => setAcao(null)}>
              Voltar
            </button>
            <button className="botao-perigo" disabled={mudar.isPending}>
              Cancelar orçamento
            </button>
          </div>
        </form>
      )}
      {aprovado && !acao && (
        <div className="flex justify-end gap-2">
          {pode(eu.perfis, 'orcamento.aprovar') && (
            <button className="botao-leve" onClick={() => setAcao('desaprovar')}>
              Desaprovar
            </button>
          )}
          {pode(eu.perfis, 'orcamento.cancelar') && (
            <button className="botao-leve text-perigo" onClick={() => setAcao('cancelar')}>
              Cancelar orçamento
            </button>
          )}
        </div>
      )}
    </div>
  )
}
