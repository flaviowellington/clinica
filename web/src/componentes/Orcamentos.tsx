import { useState } from 'react'
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
import { FORMAS, reais } from '../../../shared/financeiro'
import {
  DENTES_DECIDUOS,
  DENTES_PERMANENTES,
  STATUS_ORCAMENTO,
  dividirParcelas,
  totalOrcamento,
  umMesDepois,
  vencimentos,
  type StatusOrcamento,
} from '../../../shared/orcamentos'
import { Dialogo } from './Dialogo'
import { CampoReais } from './CampoReais'
import { CampoData } from './CampoData'

interface Item {
  id?: number
  procedimentoId: number
  nome: string
  dente: string | null
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
  forma: string | null
  parcelas: number
  primeiroVencimento: string | null
  motivoReprovacao: string | null
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
  REPROVADO: 'bg-suave/15 text-suave',
  CANCELADO: 'bg-perigo/15 text-perigo',
}
const TODOS_DENTES = [...DENTES_PERMANENTES.flat(), ...DENTES_DECIDUOS.flat()]

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
              </tr>
            </thead>
            <tbody>
              {lista.data.map((o) => (
                <tr
                  key={o.id}
                  className="cursor-pointer border-b border-borda last:border-0 hover:bg-primaria-clara"
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
  const hoje = isoLocal(new Date())
  const [itens, setItens] = useState<Item[]>(o?.itens ?? [])
  const [profissionalId, setProfissionalId] = useState<number | ''>(
    o?.profissional.id ?? prof?.meuId ?? '',
  )
  const [desconto, setDesconto] = useState(o?.descontoCentavos ?? 0)
  const [forma, setForma] = useState(o?.forma ?? '')
  const [parcelas, setParcelas] = useState(o?.parcelas ?? 1)
  const [primeiro, setPrimeiro] = useState(o?.primeiroVencimento ?? '')
  const [observacoes, setObservacoes] = useState(o?.observacoes ?? '')
  // Procedimento sendo adicionado (rascunho local até salvar, R-011).
  const [busca, setBusca] = useState('')
  const [escolhido, setEscolhido] = useState<Procedimento | null>(null)
  const [dente, setDente] = useState('')
  const [valor, setValor] = useState(0)

  const tabela = useQuery({
    queryKey: ['procedimentos', busca],
    queryFn: async () =>
      (await api.get<Procedimento[]>('/procedimentos', { params: { busca } })).data,
    enabled: !escolhido,
  })

  const total = totalOrcamento(itens, desconto)
  const primeiroVenc = primeiro || (parcelas > 1 ? umMesDepois(hoje) : hoje)
  const plano = vencimentos(primeiroVenc, parcelas).map((v, i) => ({
    v,
    valor: dividirParcelas(total, parcelas)[i],
  }))

  const corpo = () => ({
    pacienteId: props.paciente.id,
    profissionalId,
    itens: itens.map(({ procedimentoId, dente, valorCentavos }) => ({
      procedimentoId,
      dente,
      valorCentavos,
    })),
    descontoCentavos: desconto,
    forma: forma || null,
    parcelas,
    primeiroVencimento: primeiro || null,
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
  const reprovar = useMutation({
    mutationFn: async (motivo: string) =>
      (await api.post(`/orcamentos/${o!.id}/reprovar`, { motivo })).data,
    onSuccess: () => {
      avisar('Orçamento reprovado')
      atualizar()
      props.aoTerminar()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })

  function adicionar() {
    if (!escolhido) return
    setItens([
      ...itens,
      {
        procedimentoId: escolhido.id,
        nome: escolhido.nome,
        dente: dente.trim() || null,
        valorCentavos: valor,
      },
    ])
    setEscolhido(null)
    setBusca('')
    setDente('')
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <p>
          <span className="text-suave">Paciente: </span>
          <strong>{props.paciente.nome}</strong>
        </p>
        <label>
          <span className="rotulo">Profissional</span>
          <select
            className="campo"
            value={profissionalId}
            onChange={(e) => setProfissionalId(Number(e.target.value) || '')}
          >
            <option value="">Escolha…</option>
            {prof?.profissionais.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
          {erros.profissionalId && <p className="mt-1 text-perigo">{erros.profissionalId}</p>}
        </label>
      </div>
      {(erros.itens || erros.descontoCentavos) && (
        <p className="text-perigo">{erros.itens ?? erros.descontoCentavos}</p>
      )}

      <fieldset className="space-y-2 rounded-lg border border-borda p-3">
        <legend className="px-1 font-medium">Adicionar procedimento</legend>
        {escolhido ? (
          <div className="grid items-end gap-3 sm:grid-cols-[1fr_10rem_10rem_auto]">
            <p className="py-2">
              <strong>{escolhido.nome}</strong>{' '}
              <button type="button" className="text-primaria" onClick={() => setEscolhido(null)}>
                Trocar
              </button>
            </p>
            <label>
              <span className="rotulo">Dente ou região</span>
              <input
                className="campo"
                list="dentes-fdi"
                value={dente}
                onChange={(e) => setDente(e.target.value)}
                placeholder="Ex.: 16"
              />
              <datalist id="dentes-fdi">
                {TODOS_DENTES.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </label>
            <CampoReais id="valor-item" rotulo="Valor" valor={valor} aoMudar={setValor} />
            <button type="button" className="botao" onClick={adicionar}>
              Adicionar
            </button>
          </div>
        ) : (
          <>
            <input
              type="search"
              className="campo"
              placeholder="Buscar procedimento (qualquer parte do nome)"
              aria-label="Buscar procedimento"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <ul className="max-h-40 overflow-y-auto rounded-md border border-borda">
              {tabela.data?.length === 0 && (
                <li className="px-3 py-2 text-suave">Nenhum procedimento encontrado.</li>
              )}
              {tabela.data?.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setEscolhido(p)
                      setValor(p.valorCentavos) // R-012: valor da tabela, editável
                    }}
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
          </>
        )}
      </fieldset>

      {itens.length > 0 && (
        <table className="w-full text-left">
          <thead className="border-b border-borda text-suave">
            <tr>
              <th className="py-1 font-medium">Procedimento</th>
              <th className="py-1 font-medium">Dente</th>
              <th className="py-1 text-right font-medium">Valor</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {itens.map((i, n) => (
              <tr key={n} className="border-b border-borda">
                <td className="py-1.5">{i.nome}</td>
                <td className="py-1.5">{i.dente}</td>
                <td className="py-1.5 text-right">{reais(i.valorCentavos)}</td>
                <td className="py-1.5 text-right">
                  <button
                    type="button"
                    className="text-perigo"
                    onClick={() => setItens(itens.filter((_, x) => x !== n))}
                  >
                    Remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <CampoReais id="desconto" rotulo="Desconto" valor={desconto} aoMudar={setDesconto} />
        <label>
          <span className="rotulo">Forma de pagamento</span>
          <select className="campo" value={forma} onChange={(e) => setForma(e.target.value)}>
            <option value="">A definir</option>
            {FORMAS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="rotulo">Parcelas</span>
          <select
            className="campo"
            value={parcelas}
            onChange={(e) => setParcelas(Number(e.target.value))}
          >
            {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n === 1 ? 'À vista' : `${n}x`}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="rotulo">1º vencimento</span>
          <CampoData value={primeiroVenc} onChange={(v) => v && setPrimeiro(v)} />
        </label>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg bg-primaria-clara p-3">
        <div className="text-lg">
          Total: <strong>{reais(total)}</strong>
        </div>
        {itens.length > 0 && parcelas > 1 && (
          <ol className="grid grid-cols-2 gap-x-6 text-suave sm:grid-cols-3">
            {plano.map((p, i) => (
              <li key={i}>
                {i + 1}ª {dataBR(p.v)}: {reais(p.valor)}
              </li>
            ))}
          </ol>
        )}
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

      <div className="flex flex-wrap justify-between gap-2">
        <div>
          {o && (
            <button
              type="button"
              className="botao-leve"
              onClick={() => {
                const motivo = prompt('Motivo da reprovação (opcional):')
                if (motivo !== null) reprovar.mutate(motivo)
              }}
            >
              Reprovar
            </button>
          )}
        </div>
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
                  disabled={salvar.isPending || !forma}
                  title={forma ? undefined : 'Escolha a forma de pagamento para aprovar'}
                  onClick={() =>
                    confirm(
                      'Aprovar este orçamento? Ele vira tratamento e gera as parcelas a receber.',
                    ) && salvar.mutate(true)
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

/** Orçamento aprovado, reprovado ou cancelado: só leitura (R-038). */
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
      {o.motivoReprovacao && <p>Motivo da reprovação: {o.motivoReprovacao}</p>}

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
        Total: <strong>{reais(o.totalCentavos)}</strong> · {o.forma ?? 'A definir'},{' '}
        {o.parcelas === 1 ? 'à vista' : `${o.parcelas} parcelas`}
      </p>

      {o.contas.length > 0 && (
        <div>
          <p className="mb-1 font-medium">Parcelas</p>
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
