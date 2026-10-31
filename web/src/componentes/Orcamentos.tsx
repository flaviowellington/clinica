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

interface Item {
  id?: number
  procedimentoId: number
  nome: string
  dente: string | null
  /** Faces do dente quando o item veio do odontograma (ex.: "MO"). */
  faces?: string | null
  valorCentavos: number
  executadoEm?: string | null
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
  const lista = useQuery({
    queryKey: ['orcamentos', paciente.id],
    queryFn: async () =>
      (await api.get<Orcamento[]>('/orcamentos', { params: { pacienteId: paciente.id } })).data,
  })
  const titulo = aberto === 'novo' ? 'Novo orçamento' : aberto ? `Orçamento nº ${aberto.id}` : ''
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
  // Busca na tabela: cada clique entra direto nos itens (rascunho local até salvar, R-011).
  const [busca, setBusca] = useState('')
  const [cadastrando, setCadastrando] = useState(false)
  const escolher = (p: Procedimento) => {
    // R-012: valor da tabela, editável na linha.
    setItens([
      ...itens,
      { procedimentoId: p.id, nome: p.nome, dente: null, valorCentavos: p.valorCentavos },
    ])
    setBusca('')
  }
  const mudarItem = (n: number, d: Partial<Item>) =>
    setItens(itens.map((i, x) => (x === n ? { ...i, ...d } : i)))

  const tabela = useQuery({
    queryKey: ['procedimentos', busca],
    queryFn: async () =>
      (await api.get<Procedimento[]>('/procedimentos', { params: { busca } })).data,
  })

  const subtotal = totalOrcamento(itens)
  const desconto =
    modoDesconto === 'PERCENTUAL' ? descontoDoPercentual(subtotal, percentual) : descontoFixo
  const total = totalOrcamento(itens, desconto)
  const trocarModo = (m: typeof modoDesconto) => {
    // Troca mantendo o mesmo desconto, só mudando como ele é digitado.
    if (m === 'PERCENTUAL') setPercentual(percentualDoDesconto(subtotal, descontoFixo))
    else setDescontoFixo(desconto)
    setModoDesconto(m)
  }

  const corpo = () => ({
    pacienteId: props.paciente.id,
    profissionalId,
    itens: itens.map(({ procedimentoId, dente, faces, valorCentavos }) => ({
      procedimentoId,
      dente,
      faces,
      valorCentavos,
    })),
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
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <p>
          <span className="text-suave">Paciente: </span>
          <strong>{props.paciente.nome}</strong>
        </p>
        <label>
          <span className="rotulo">Profissional</span>
          <CampoSelect
            value={profissionalId}
            onChange={(e) => setProfissionalId(Number(e.target.value) || '')}
            opcoes={prof?.profissionais.map((p) => [p.id, p.nome] as const)}
          />
          {erros.profissionalId && <p className="mt-1 text-perigo">{erros.profissionalId}</p>}
        </label>
      </div>
      {(erros.itens || erros.descontoCentavos) && (
        <p className="text-perigo">{erros.itens ?? erros.descontoCentavos}</p>
      )}

      <fieldset className="space-y-2 rounded-lg border border-borda p-3">
        <legend className="px-1 font-medium">Adicionar procedimento</legend>
        <input
          type="search"
          className="campo"
          placeholder="Buscar procedimento (qualquer parte do nome)"
          aria-label="Buscar procedimento"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <ul className="max-h-48 overflow-y-auto rounded-md border border-borda">
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
            <li className="px-3 py-2 text-suave">Nenhum procedimento encontrado.</li>
          )}
          {tabela.data?.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => escolher(p)}
                className="flex w-full justify-between px-3 py-1.5 text-left hover:bg-primaria-clara"
              >
                <span>
                  {p.nome}
                  {p.especialidade && <span className="text-suave"> · {p.especialidade}</span>}
                </span>
                <span className="text-suave">{reais(p.valorCentavos)}</span>
              </button>
            </li>
          ))}
        </ul>
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
                if (salvo) escolher(salvo)
              }}
            />
          )}
        </Dialogo>
      </fieldset>

      {itens.length > 0 && (
        <table className="w-full text-left">
          <thead className="border-b border-borda text-suave">
            <tr>
              <th className="py-1 font-medium">Procedimento</th>
              <th className="py-1 font-medium">Dente ou região</th>
              <th className="py-1 font-medium">Valor</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {itens.map((i, n) => (
              <tr key={n} className="border-b border-borda">
                <td className="py-1.5 pr-3">{i.nome}</td>
                <td className="w-40 py-1.5 pr-3">
                  <CampoSugestoes
                    sugestoes={TODOS_DENTES}
                    value={i.dente ?? ''}
                    onChange={(v) => mudarItem(n, { dente: v || null })}
                    placeholder="Ex.: 16"
                    aria-label={`Dente ou região: ${i.nome}`}
                  />
                  {i.faces && <span className="text-xs text-suave">Faces: {i.faces}</span>}
                </td>
                <td className="w-40 py-1.5 pr-3">
                  <CampoReais
                    id={`valor-item-${n}`}
                    rotulo={`Valor: ${i.nome}`}
                    rotuloOculto
                    valor={i.valorCentavos}
                    aoMudar={(v) => mudarItem(n, { valorCentavos: v })}
                  />
                </td>
                <td className="w-10 py-1.5 text-right">
                  <button
                    type="button"
                    className="botao-fantasma botao-icone text-perigo"
                    aria-label={`Remover ${i.nome}`}
                    title="Remover"
                    onClick={() => setItens(itens.filter((_, x) => x !== n))}
                  >
                    <Icone nome="fechar" className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <fieldset>
          <legend className="rotulo">Tipo de desconto</legend>
          <div className="flex overflow-hidden rounded-lg border border-borda">
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
                className={`px-3 py-2 ${modoDesconto === m ? 'bg-primaria text-sobre-primaria' : 'bg-superficie hover:bg-superficie-2'}`}
              >
                {rotulo}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="w-44">
          {modoDesconto === 'REAIS' ? (
            <CampoReais
              id="desconto"
              rotulo="Desconto"
              valor={descontoFixo}
              aoMudar={setDescontoFixo}
            />
          ) : (
            <label>
              <span className="rotulo">Desconto (%)</span>
              <input
                type="number"
                className="campo"
                min={0}
                max={100}
                step={0.01}
                value={percentual || ''}
                onChange={(e) => setPercentual(Math.min(100, Math.max(0, Number(e.target.value))))}
              />
            </label>
          )}
        </div>
        {/* Conta automática: mostra o desconto no outro formato. */}
        {subtotal > 0 && desconto > 0 && (
          <p className="pb-2 text-suave">
            {modoDesconto === 'REAIS'
              ? `= ${percentualDoDesconto(subtotal, desconto).toLocaleString('pt-BR')}% do subtotal`
              : `= ${reais(desconto)} de desconto`}
          </p>
        )}
      </div>

      <div className="space-y-1 rounded-lg bg-primaria-clara p-3 text-right">
        <p className="text-suave">Subtotal: {reais(subtotal)}</p>
        {desconto > 0 && <p className="text-suave">Desconto: − {reais(desconto)}</p>}
        <p className="text-lg">
          Total: <strong>{reais(total)}</strong>
        </p>
      </div>

      <label className="block">
        <span className="rotulo">Observações</span>
        <textarea
          className="campo"
          rows={2}
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
        />
      </label>

      <div className="flex flex-wrap justify-end gap-2">
        <div className="flex gap-2">
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
      </div>
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
