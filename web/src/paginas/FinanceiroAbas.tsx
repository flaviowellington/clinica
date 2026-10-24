// Abas do Financeiro: contas a pagar e receber (e os controles por forma), fluxo, extrato e conciliação.
import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import {
  api,
  consultaEu,
  dataBR,
  errosDosCampos,
  isoLocal,
  mensagemDeErro,
  type Paciente,
} from '../api'
import { avisar } from '../estado'
import { pode } from '../../../shared/permissoes'
import { FORMAS, PLANO_DE_CONTAS, STATUS_CONTA_FINANCEIRA, reais } from '../../../shared/financeiro'
import { Dialogo } from '../componentes/Dialogo'
import { CampoReais } from '../componentes/CampoReais'
import { BuscaPaciente } from '../componentes/BuscaPaciente'
import { CampoData } from '../componentes/CampoData'

const hoje = () => isoLocal(new Date())
const inicioDoMes = () => `${hoje().slice(0, 8)}01`
const fimDoMes = () => {
  const d = new Date()
  return isoLocal(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}

/** Filtro de período com botão Listar (padrão: o mês atual). */
function usePeriodo(chave: string, de = inicioDoMes(), ate = fimDoMes()) {
  const qc = useQueryClient()
  const [rascunho, setRascunho] = useState({ de, ate })
  const [periodo, setPeriodo] = useState(rascunho)
  const campos = (extra?: ReactNode) => (
    <form
      className="cartao flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        setPeriodo(rascunho)
        // Listar sempre busca de novo, mesmo sem mudar o filtro.
        qc.invalidateQueries({ queryKey: [chave] })
      }}
    >
      <label>
        <span className="rotulo">De</span>
        <CampoData
          value={rascunho.de}
          onChange={(v) => setRascunho({ ...rascunho, de: v })}
          required
        />
      </label>
      <label>
        <span className="rotulo">Até</span>
        <CampoData
          value={rascunho.ate}
          onChange={(v) => setRascunho({ ...rascunho, ate: v })}
          required
        />
      </label>
      {extra}
      <button className="botao">Listar</button>
    </form>
  )
  return { periodo, campos }
}

function Cabecalho(props: { titulo: string; descricao: string; acao?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">{props.titulo}</h1>
        <p className="text-suave">{props.descricao}</p>
      </div>
      {props.acao}
    </header>
  )
}

function Total(props: { rotulo: string; valor: number; cor?: string; nota?: string }) {
  return (
    <div className="cartao space-y-1">
      <p className="text-xs font-medium tracking-wide text-suave uppercase">{props.rotulo}</p>
      <p className={`text-2xl font-semibold ${props.cor ?? ''}`}>{reais(props.valor)}</p>
      {props.nota && <p className="text-suave">{props.nota}</p>}
    </div>
  )
}

/** Tabela simples com cabeçalho; "vazio" quando não há linhas. */
function Tabela(props: {
  colunas: string[]
  vazio: string
  linhas: number
  children: ReactNode
  direita?: number[]
}) {
  if (!props.linhas) return <p className="cartao text-suave">{props.vazio}</p>
  return (
    <div className="cartao overflow-x-auto p-0">
      <table className="w-full text-left">
        <thead className="border-b border-borda text-suave">
          <tr>
            {props.colunas.map((c, i) => (
              <th
                key={c + i}
                className={`px-4 py-2 font-medium ${props.direita?.includes(i) ? 'text-right' : ''}`}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{props.children}</tbody>
      </table>
    </div>
  )
}

// ── Contas a pagar / a receber / controles por forma ────────────────────────
interface Conta {
  id: number
  tipo: 'PAGAR' | 'RECEBER'
  descricao: string
  valorCentavos: number
  vencimento: string
  forma: string | null
  categoria: string | null
  detalhes: string | null
  status: keyof typeof STATUS_CONTA_FINANCEIRA
  pagoEm: string | null
  paciente: { id: number; nome: string } | null
}

export function ContasLista(props: {
  tipo: 'PAGAR' | 'RECEBER'
  titulo: string
  descricao: string
  formas?: readonly string[]
}) {
  const { data: eu } = useSuspenseQuery(consultaEu)
  const podeEditar = pode(eu.perfis, 'financeiro.editar')
  const qc = useQueryClient()
  const [status, setStatus] = useState('ABERTA')
  const [nova, setNova] = useState(false)
  const [baixando, setBaixando] = useState<Conta | null>(null)
  const filtro = usePeriodo('contas-financeiras')
  const pagar = props.tipo === 'PAGAR'

  const lista = useQuery({
    queryKey: ['contas-financeiras', props.tipo, props.formas, filtro.periodo, status],
    queryFn: async () =>
      (
        await api.get<Conta[]>('/financeiro/contas', {
          params: {
            tipo: props.tipo,
            ...filtro.periodo,
            status: status || undefined,
            formas: props.formas?.join(','),
          },
        })
      ).data,
  })
  const cancelar = useMutation({
    mutationFn: async (id: number) => (await api.post(`/financeiro/contas/${id}/cancelar`)).data,
    onSuccess: () => {
      avisar('Conta cancelada')
      qc.invalidateQueries({ queryKey: ['contas-financeiras'] })
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })

  const contas = lista.data ?? []
  const soma = (f: (c: Conta) => boolean) =>
    contas.filter(f).reduce((s, c) => s + c.valorCentavos, 0)
  const atrasada = (c: Conta) => c.status === 'ABERTA' && c.vencimento < hoje()

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Cabecalho
        titulo={props.titulo}
        descricao={props.descricao}
        acao={
          podeEditar && (
            <button className="botao" onClick={() => setNova(true)}>
              {pagar ? 'Nova conta a pagar' : 'Nova conta a receber'}
            </button>
          )
        }
      />
      {filtro.campos(
        <label>
          <span className="rotulo">Situação</span>
          <select className="campo" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(STATUS_CONTA_FINANCEIRA).map(([v, r]) => (
              <option key={v} value={v}>
                {r}
              </option>
            ))}
          </select>
        </label>,
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Total rotulo="Em aberto" valor={soma((c) => c.status === 'ABERTA')} />
        <Total
          rotulo="Atrasadas"
          valor={soma(atrasada)}
          cor="text-perigo"
          nota="Vencidas e ainda em aberto"
        />
        <Total
          rotulo={pagar ? 'Pagas' : 'Recebidas'}
          valor={soma((c) => c.status === 'PAGA')}
          cor="text-sucesso"
        />
      </div>
      <Tabela
        colunas={[
          'Vencimento',
          'Descrição',
          pagar ? 'Fornecedor' : 'Paciente',
          'Conta',
          'Forma',
          'Valor',
          'Situação',
          '',
        ]}
        direita={[5]}
        vazio={lista.isPending ? 'Carregando…' : 'Nenhuma conta no período.'}
        linhas={contas.length}
      >
        {contas.map((c) => (
          <tr key={c.id} className="border-b border-borda last:border-0">
            <td className={`px-4 py-2 ${atrasada(c) ? 'font-medium text-perigo' : ''}`}>
              {dataBR(c.vencimento)}
            </td>
            <td className="px-4 py-2">{c.descricao}</td>
            <td className="px-4 py-2">{c.paciente?.nome ?? c.detalhes ?? ''}</td>
            <td className="px-4 py-2 text-suave">{c.categoria}</td>
            <td className="px-4 py-2">
              {c.forma}
              {c.paciente && c.detalhes && (
                <span className="block text-xs text-suave">{c.detalhes}</span>
              )}
            </td>
            <td className="px-4 py-2 text-right font-medium">{reais(c.valorCentavos)}</td>
            <td className="px-4 py-2">
              {atrasada(c) ? 'Atrasada' : STATUS_CONTA_FINANCEIRA[c.status]}
              {c.pagoEm && <span className="block text-xs text-suave">em {dataBR(c.pagoEm)}</span>}
            </td>
            <td className="px-4 py-2 text-right whitespace-nowrap">
              {podeEditar && c.status === 'ABERTA' && (
                <>
                  <button className="text-primaria hover:underline" onClick={() => setBaixando(c)}>
                    {pagar ? 'Pagar' : 'Receber'}
                  </button>{' '}
                  <button
                    className="ml-2 text-perigo hover:underline"
                    disabled={cancelar.isPending}
                    onClick={() => confirm(`Cancelar "${c.descricao}"?`) && cancelar.mutate(c.id)}
                  >
                    Cancelar
                  </button>
                </>
              )}
            </td>
          </tr>
        ))}
      </Tabela>

      <Dialogo
        aberto={nova}
        aoFechar={() => setNova(false)}
        titulo={pagar ? 'Nova conta a pagar' : 'Nova conta a receber'}
      >
        <NovaConta
          tipo={props.tipo}
          formaInicial={props.formas?.[0]}
          aoTerminar={() => setNova(false)}
        />
      </Dialogo>
      <Dialogo
        aberto={!!baixando}
        aoFechar={() => setBaixando(null)}
        titulo={pagar ? 'Registrar pagamento' : 'Registrar recebimento'}
      >
        {baixando && <Baixar conta={baixando} aoTerminar={() => setBaixando(null)} />}
      </Dialogo>
    </div>
  )
}

function SeletorConta(props: { nome: string; padrao?: string; obrigatorio: boolean }) {
  return (
    <label className="block">
      <span className="rotulo">Conta do plano de contas{props.obrigatorio && ' *'}</span>
      <select name={props.nome} className="campo" defaultValue={props.padrao ?? ''}>
        <option value="">{props.obrigatorio ? 'Escolha…' : 'Receita de tratamentos'}</option>
        {Object.entries(PLANO_DE_CONTAS).map(([grupo, contas]) => (
          <optgroup key={grupo} label={grupo}>
            {contas.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}

function NovaConta(props: {
  tipo: 'PAGAR' | 'RECEBER'
  formaInicial?: string
  aoTerminar: () => void
}) {
  const qc = useQueryClient()
  const pagar = props.tipo === 'PAGAR'
  const [valor, setValor] = useState(0)
  const [paciente, setPaciente] = useState<Paciente | null>(null)
  const criar = useMutation({
    mutationFn: async (d: Record<string, unknown>) =>
      (await api.post('/financeiro/contas', d)).data,
    onSuccess: () => {
      avisar('Conta registrada')
      qc.invalidateQueries({ queryKey: ['contas-financeiras'] })
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
        criar.mutate({
          ...f,
          tipo: props.tipo,
          valorCentavos: valor,
          pacienteId: paciente?.id,
          categoria: f.categoria || undefined,
        })
      }}
    >
      <label className="block">
        <span className="rotulo">Descrição *</span>
        <input
          name="descricao"
          className="campo"
          placeholder={pagar ? 'Ex.: Aluguel de novembro' : 'Ex.: Tratamento ortodôntico'}
          autoFocus
        />
        {erro('descricao')}
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <CampoReais
          id="conta-valor"
          rotulo="Valor total *"
          valor={valor}
          aoMudar={setValor}
          erro={erros.valorCentavos}
        />
        <label>
          <span className="rotulo">1º vencimento *</span>
          <CampoData name="vencimento" defaultValue={hoje()} required />
          {erro('vencimento')}
        </label>
        <label>
          <span className="rotulo">Parcelas</span>
          <select name="parcelas" className="campo" defaultValue="1">
            {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n === 1 ? 'Única' : `${n}x mensais`}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SeletorConta nome="categoria" obrigatorio={pagar} />
        <label>
          <span className="rotulo">Forma</span>
          <select name="forma" className="campo" defaultValue={props.formaInicial ?? ''}>
            <option value="">A definir</option>
            {FORMAS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
      </div>
      {erro('categoria')}
      {!pagar && (
        <div>
          <span className="rotulo">Paciente</span>
          <BuscaPaciente valor={paciente} aoEscolher={setPaciente} />
        </div>
      )}
      <label className="block">
        <span className="rotulo">
          {pagar ? 'Fornecedor' : 'Detalhes (ex.: banco e número do cheque)'}
        </span>
        <input name="detalhes" className="campo" />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" className="botao-leve" onClick={props.aoTerminar}>
          Cancelar
        </button>
        <button className="botao" disabled={criar.isPending}>
          Registrar
        </button>
      </div>
    </form>
  )
}

function Baixar(props: { conta: Conta; aoTerminar: () => void }) {
  const qc = useQueryClient()
  const baixar = useMutation({
    mutationFn: async (d: Record<string, unknown>) =>
      (await api.post(`/financeiro/contas/${props.conta.id}/baixar`, d)).data,
    onSuccess: () => {
      avisar(props.conta.tipo === 'PAGAR' ? 'Pagamento registrado' : 'Recebimento registrado')
      qc.invalidateQueries({ queryKey: ['contas-financeiras'] })
      qc.invalidateQueries({ queryKey: ['lancamentos'] })
      props.aoTerminar()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        baixar.mutate(Object.fromEntries(new FormData(e.currentTarget)))
      }}
    >
      <p>
        {props.conta.descricao}: <strong>{reais(props.conta.valorCentavos)}</strong>
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="rotulo">Data</span>
          <CampoData name="data" defaultValue={hoje()} required />
        </label>
        <label>
          <span className="rotulo">Forma</span>
          <select name="forma" className="campo" defaultValue={props.conta.forma ?? ''}>
            <option value="">Não informar</option>
            {FORMAS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-suave">
        O valor entra na conta corrente como {props.conta.tipo === 'PAGAR' ? 'saída' : 'entrada'}.
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" className="botao-leve" onClick={props.aoTerminar}>
          Voltar
        </button>
        <button className="botao" disabled={baixar.isPending}>
          Confirmar
        </button>
      </div>
    </form>
  )
}

// ── Fluxo de caixa (R-052) ──────────────────────────────────────────────────
interface DiaFluxo {
  data: string
  entradas: number
  saidas: number
  entradasPrevistas: number
  saidasPrevistas: number
  saldo: number
  acumulado: number
}

export function FluxoCaixa() {
  const filtro = usePeriodo('fluxo')
  const [todos, setTodos] = useState(false)
  const fluxo = useQuery({
    queryKey: ['fluxo', filtro.periodo],
    queryFn: async () =>
      (
        await api.get<{ saldoAnterior: number; dias: DiaFluxo[] }>('/financeiro/fluxo', {
          params: filtro.periodo,
        })
      ).data,
  })
  const dias = (fluxo.data?.dias ?? []).filter(
    (d) => todos || d.entradas || d.saidas || d.entradasPrevistas || d.saidasPrevistas,
  )
  const soma = (k: keyof DiaFluxo) =>
    (fluxo.data?.dias ?? []).reduce((s, d) => s + (d[k] as number), 0)
  const ultimo = fluxo.data?.dias.at(-1)?.acumulado ?? fluxo.data?.saldoAnterior ?? 0
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Cabecalho
        titulo="Fluxo de Caixa"
        descricao="O que entrou e saiu, o que está previsto e o saldo de cada dia."
      />
      {filtro.campos(
        <label className="flex items-center gap-2 pb-2">
          <input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} />{' '}
          Mostrar dias sem movimento
        </label>,
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Total rotulo="Saldo anterior" valor={fluxo.data?.saldoAnterior ?? 0} />
        <Total
          rotulo="Entradas (realizadas + previstas)"
          valor={soma('entradas') + soma('entradasPrevistas')}
          cor="text-sucesso"
        />
        <Total
          rotulo="Saídas (realizadas + previstas)"
          valor={soma('saidas') + soma('saidasPrevistas')}
          cor="text-perigo"
        />
        <Total
          rotulo="Saldo no fim do período"
          valor={ultimo}
          cor={ultimo < 0 ? 'text-perigo' : ''}
        />
      </div>
      <Tabela
        colunas={[
          'Dia',
          'Entradas',
          'Saídas',
          'A receber',
          'A pagar',
          'Saldo do dia',
          'Saldo acumulado',
        ]}
        direita={[1, 2, 3, 4, 5, 6]}
        vazio={fluxo.isPending ? 'Carregando…' : 'Sem movimento no período.'}
        linhas={dias.length}
      >
        {dias.map((d) => (
          <tr key={d.data} className="border-b border-borda last:border-0">
            <td className="px-4 py-2">{dataBR(d.data)}</td>
            <td className="px-4 py-2 text-right text-sucesso">
              {d.entradas ? reais(d.entradas) : ''}
            </td>
            <td className="px-4 py-2 text-right text-perigo">{d.saidas ? reais(d.saidas) : ''}</td>
            <td className="px-4 py-2 text-right text-suave">
              {d.entradasPrevistas ? reais(d.entradasPrevistas) : ''}
            </td>
            <td className="px-4 py-2 text-right text-suave">
              {d.saidasPrevistas ? reais(d.saidasPrevistas) : ''}
            </td>
            <td className={`px-4 py-2 text-right ${d.saldo < 0 ? 'text-perigo' : ''}`}>
              {reais(d.saldo)}
            </td>
            <td
              className={`px-4 py-2 text-right font-medium ${d.acumulado < 0 ? 'text-perigo' : ''}`}
            >
              {reais(d.acumulado)}
            </td>
          </tr>
        ))}
      </Tabela>
    </div>
  )
}

// ── Extrato ─────────────────────────────────────────────────────────────────
interface Banco {
  id: number
  nome: string
  banco: string | null
  agencia: string | null
  numero: string | null
  saldoInicialCentavos: number
}
const consultaBancos = {
  queryKey: ['bancos'],
  queryFn: async () => (await api.get<Banco[]>('/financeiro/bancos')).data,
}

interface ItemExtrato {
  id: number
  data: string
  tipo: 'ENTRADA' | 'SAIDA'
  descricao: string
  forma: string | null
  valorCentavos: number
  saldo: number
  paciente: { nome: string } | null
}

export function Extrato() {
  const bancos = useQuery(consultaBancos)
  const [conta, setConta] = useState('')
  const filtro = usePeriodo('extrato')
  const extrato = useQuery({
    queryKey: ['extrato', filtro.periodo, conta],
    queryFn: async () =>
      (
        await api.get<{ saldoAnterior: number; saldoFinal: number; itens: ItemExtrato[] }>(
          '/financeiro/extrato',
          {
            params: { ...filtro.periodo, contaBancariaId: conta || undefined },
          },
        )
      ).data,
  })
  const itens = extrato.data?.itens ?? []
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Cabecalho
        titulo="Extrato"
        descricao="Entradas e saídas realizadas, uma a uma, com o saldo depois de cada movimento."
      />
      {filtro.campos(
        <label>
          <span className="rotulo">Conta bancária</span>
          <select className="campo" value={conta} onChange={(e) => setConta(e.target.value)}>
            <option value="">Todas as movimentações</option>
            {bancos.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nome}
              </option>
            ))}
          </select>
        </label>,
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Total rotulo="Saldo anterior" valor={extrato.data?.saldoAnterior ?? 0} />
        <Total rotulo="Saldo final" valor={extrato.data?.saldoFinal ?? 0} />
      </div>
      <Tabela
        colunas={['Data', 'Descrição', 'Paciente', 'Forma', 'Entrada', 'Saída', 'Saldo']}
        direita={[4, 5, 6]}
        vazio={extrato.isPending ? 'Carregando…' : 'Sem movimentações no período.'}
        linhas={itens.length}
      >
        {itens.map((i) => (
          <tr key={i.id} className="border-b border-borda last:border-0">
            <td className="px-4 py-2">{dataBR(i.data)}</td>
            <td className="px-4 py-2">{i.descricao}</td>
            <td className="px-4 py-2">{i.paciente?.nome ?? ''}</td>
            <td className="px-4 py-2">{i.forma ?? ''}</td>
            <td className="px-4 py-2 text-right text-sucesso">
              {i.tipo === 'ENTRADA' ? reais(i.valorCentavos) : ''}
            </td>
            <td className="px-4 py-2 text-right text-perigo">
              {i.tipo === 'SAIDA' ? reais(i.valorCentavos) : ''}
            </td>
            <td className={`px-4 py-2 text-right font-medium ${i.saldo < 0 ? 'text-perigo' : ''}`}>
              {reais(i.saldo)}
            </td>
          </tr>
        ))}
      </Tabela>
    </div>
  )
}

// ── Conciliação bancária ────────────────────────────────────────────────────
interface Conciliacao {
  saldoConciliado: number
  lancamentos: (ItemExtrato & { conciliado: boolean })[]
}

export function ConciliacaoBancaria() {
  const { data: eu } = useSuspenseQuery(consultaEu)
  const podeEditar = pode(eu.perfis, 'financeiro.editar')
  const qc = useQueryClient()
  const bancos = useQuery(consultaBancos)
  const [conta, setConta] = useState<number | null>(null)
  const [novoBanco, setNovoBanco] = useState(false)
  const [saldoBanco, setSaldoBanco] = useState(0)
  const filtro = usePeriodo('conciliacao')
  const atual = conta ?? bancos.data?.[0]?.id ?? null

  const conc = useQuery({
    queryKey: ['conciliacao', atual, filtro.periodo],
    queryFn: async () =>
      (
        await api.get<Conciliacao>('/financeiro/conciliacao', {
          params: { contaBancariaId: atual, ...filtro.periodo },
        })
      ).data,
    enabled: !!atual,
  })
  const marcar = useMutation({
    mutationFn: async (d: { id: number; conciliado: boolean }) =>
      (
        await api.patch(`/financeiro/lancamentos/${d.id}/conciliar`, {
          contaBancariaId: d.conciliado ? atual : null,
        })
      ).data,
    // Marca na hora; o servidor confirma e os saldos se acertam no recarregar.
    onMutate: (d) =>
      qc.setQueryData<Conciliacao>(
        ['conciliacao', atual, filtro.periodo],
        (c) =>
          c && {
            ...c,
            lancamentos: c.lancamentos.map((l) =>
              l.id === d.id ? { ...l, conciliado: d.conciliado } : l,
            ),
          },
      ),
    onSettled: () => qc.invalidateQueries({ queryKey: ['conciliacao'] }),
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const lanc = conc.data?.lancamentos ?? []
  const diferenca = saldoBanco - (conc.data?.saldoConciliado ?? 0)

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Cabecalho
        titulo="Conciliações Bancárias"
        descricao="Marque os lançamentos que aparecem no extrato do banco e compare os saldos."
        acao={
          podeEditar && (
            <button className="botao" onClick={() => setNovoBanco(true)}>
              Nova conta bancária
            </button>
          )
        }
      />
      {bancos.data?.length === 0 ? (
        <p className="cartao text-suave">Cadastre a conta bancária da clínica para começar.</p>
      ) : (
        <>
          {filtro.campos(
            <label>
              <span className="rotulo">Conta bancária</span>
              <select
                className="campo"
                value={atual ?? ''}
                onChange={(e) => setConta(Number(e.target.value))}
              >
                {bancos.data?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nome}
                    {b.banco && ` · ${b.banco}`}
                  </option>
                ))}
              </select>
            </label>,
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <Total
              rotulo="Saldo conferido no sistema"
              valor={conc.data?.saldoConciliado ?? 0}
              nota="Saldo inicial + lançamentos marcados até o fim do período"
            />
            <div className="cartao">
              <CampoReais
                id="saldo-banco"
                rotulo="Saldo no extrato do banco"
                valor={saldoBanco}
                aoMudar={setSaldoBanco}
              />
            </div>
            <Total
              rotulo="Diferença"
              valor={diferenca}
              cor={diferenca === 0 ? 'text-sucesso' : 'text-perigo'}
              nota={diferenca === 0 ? 'Tudo conferido' : 'Falta conferir algum lançamento'}
            />
          </div>
          <Tabela
            colunas={['Conferido', 'Data', 'Descrição', 'Paciente', 'Forma', 'Valor']}
            direita={[5]}
            vazio={conc.isPending ? 'Carregando…' : 'Sem lançamentos no período.'}
            linhas={lanc.length}
          >
            {lanc.map((l) => (
              <tr
                key={l.id}
                className={`border-b border-borda last:border-0 ${l.conciliado ? 'bg-sucesso/5' : ''}`}
              >
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    checked={l.conciliado}
                    disabled={!podeEditar}
                    onChange={(e) => marcar.mutate({ id: l.id, conciliado: e.target.checked })}
                    aria-label={`Conferido: ${l.descricao}`}
                  />
                </td>
                <td className="px-4 py-2">{dataBR(l.data)}</td>
                <td className="px-4 py-2">{l.descricao}</td>
                <td className="px-4 py-2">{l.paciente?.nome ?? ''}</td>
                <td className="px-4 py-2">{l.forma ?? ''}</td>
                <td
                  className={`px-4 py-2 text-right font-medium ${l.tipo === 'ENTRADA' ? 'text-sucesso' : 'text-perigo'}`}
                >
                  {l.tipo === 'SAIDA' && '-'}
                  {reais(l.valorCentavos)}
                </td>
              </tr>
            ))}
          </Tabela>
        </>
      )}
      <Dialogo aberto={novoBanco} aoFechar={() => setNovoBanco(false)} titulo="Nova conta bancária">
        <NovoBanco
          aoTerminar={(id) => {
            setNovoBanco(false)
            if (id) setConta(id)
          }}
        />
      </Dialogo>
    </div>
  )
}

function NovoBanco({ aoTerminar }: { aoTerminar: (id?: number) => void }) {
  const qc = useQueryClient()
  const [saldo, setSaldo] = useState(0)
  const criar = useMutation({
    mutationFn: async (d: Record<string, unknown>) =>
      (await api.post<Banco>('/financeiro/bancos', d)).data,
    onSuccess: (b) => {
      avisar('Conta bancária cadastrada')
      qc.invalidateQueries({ queryKey: ['bancos'] })
      aoTerminar(b.id)
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const erros = errosDosCampos(criar.error)
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        criar.mutate({
          ...Object.fromEntries(new FormData(e.currentTarget)),
          saldoInicialCentavos: saldo,
        })
      }}
    >
      <label className="block">
        <span className="rotulo">Nome *</span>
        <input name="nome" className="campo" placeholder="Ex.: Conta da clínica" autoFocus />
        {erros.nome && <p className="mt-1 text-perigo">{erros.nome}</p>}
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label>
          <span className="rotulo">Banco</span>
          <input name="banco" className="campo" />
        </label>
        <label>
          <span className="rotulo">Agência</span>
          <input name="agencia" className="campo" />
        </label>
        <label>
          <span className="rotulo">Conta</span>
          <input name="numero" className="campo" />
        </label>
      </div>
      <CampoReais id="saldo-inicial" rotulo="Saldo inicial" valor={saldo} aoMudar={setSaldo} />
      <div className="flex justify-end gap-2">
        <button type="button" className="botao-leve" onClick={() => aoTerminar()}>
          Cancelar
        </button>
        <button className="botao" disabled={criar.isPending}>
          Cadastrar
        </button>
      </div>
    </form>
  )
}
