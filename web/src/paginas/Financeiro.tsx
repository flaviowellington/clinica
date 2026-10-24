import { useState } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import {
  api,
  consultaEu,
  dataBR,
  errosDosCampos,
  isoLocal,
  mensagemDeErro,
  somarDias,
  type Paciente,
} from '../api'
import { avisar } from '../estado'
import { pode } from '../../../shared/permissoes'
import {
  FORMAS,
  PLANO_DE_CONTAS,
  TIPOS_LANCAMENTO,
  reais,
  type TipoLancamento,
} from '../../../shared/financeiro'
import { Abas } from '../componentes/Abas'
import { Dialogo } from '../componentes/Dialogo'
import { CampoReais } from '../componentes/CampoReais'
import { BuscaPaciente } from '../componentes/BuscaPaciente'
import { ConciliacaoBancaria, ContasLista, Extrato, FluxoCaixa } from './FinanceiroAbas'
import { CampoData } from '../componentes/CampoData'

const ABAS = [
  { id: 'geral', rotulo: 'Geral', pronta: true },
  { id: 'conta-corrente', rotulo: 'Conta Corrente', pronta: true },
  { id: 'fluxo', rotulo: 'Fluxo de Caixa', pronta: true },
  { id: 'pagar', rotulo: 'Contas a Pagar', pronta: true },
  { id: 'receber', rotulo: 'Contas a Receber', pronta: true },
  { id: 'boletos', rotulo: 'Controle de Boletos', pronta: true },
  { id: 'cheques', rotulo: 'Controle de Cheques', pronta: true },
  { id: 'cartoes', rotulo: 'Controle de Cartões', pronta: true },
  { id: 'extrato', rotulo: 'Extrato', pronta: true },
  { id: 'conciliacao', rotulo: 'Conciliações Bancárias', pronta: true },
] as const
type Aba = (typeof ABAS)[number]['id']

/** Financeiro da clínica (S-009). */
export function Financeiro() {
  const { aba: daUrl } = useSearch({ from: '/logado/financeiro' })
  const navegar = useNavigate({ from: '/financeiro' })
  const aba = (ABAS.find((a) => a.id === daUrl)?.id ?? 'geral') as Aba
  const ir = (a: Aba) => navegar({ search: { aba: a === 'geral' ? undefined : a } })

  return (
    <div className="space-y-4">
      <Abas abas={[...ABAS]} atual={aba} aoTrocar={ir} />
      {aba === 'geral' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ABAS.slice(1).map((a, i) => (
            <button
              key={a.id}
              onClick={() => ir(a.id)}
              className="cartao space-y-3 text-left transition hover:border-primaria hover:shadow-md"
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primaria font-semibold text-white dark:text-black">
                {i + 1}
              </span>
              <p className="text-base font-medium">{a.rotulo}</p>
            </button>
          ))}
        </div>
      )}
      {aba === 'conta-corrente' && <ContaCorrente />}
      {aba === 'fluxo' && <FluxoCaixa />}
      {aba === 'pagar' && (
        <ContasLista
          tipo="PAGAR"
          titulo="Contas a Pagar"
          descricao="Despesas da clínica com vencimento."
        />
      )}
      {aba === 'receber' && (
        <ContasLista
          tipo="RECEBER"
          titulo="Contas a Receber"
          descricao="Parcelas de tratamentos e outros valores a receber."
        />
      )}
      {aba === 'boletos' && (
        <ContasLista
          key="boletos"
          tipo="RECEBER"
          formas={['Boleto']}
          titulo="Controle de Boletos"
          descricao="Parcelas a receber por boleto."
        />
      )}
      {aba === 'cheques' && (
        <ContasLista
          key="cheques"
          tipo="RECEBER"
          formas={['Cheque']}
          titulo="Controle de Cheques"
          descricao="Cheques a compensar e já compensados."
        />
      )}
      {aba === 'cartoes' && (
        <ContasLista
          key="cartoes"
          tipo="RECEBER"
          formas={['Cartão de crédito', 'Cartão de débito']}
          titulo="Controle de Cartões"
          descricao="Recebimentos por cartão de crédito e débito."
        />
      )}
      {aba === 'extrato' && <Extrato />}
      {aba === 'conciliacao' && <ConciliacaoBancaria />}
    </div>
  )
}

interface Lancamento {
  id: number
  data: string
  tipo: TipoLancamento
  valorCentavos: number
  descricao: string
  forma: string | null
  paciente: { id: number; nome: string } | null
  criadoPor: { nome: string }
}
interface Resposta {
  totais: Record<TipoLancamento, number>
  quantidade: number
  dias: { data: string; totais: Record<TipoLancamento, number>; lancamentos: Lancamento[] }[]
}

const COR: Record<TipoLancamento, string> = {
  VENDA: 'text-sky-600 dark:text-sky-400',
  CANCELAMENTO: 'text-suave',
  ENTRADA: 'text-sucesso',
  SAIDA: 'text-perigo',
}
const DESCRICAO: Record<TipoLancamento, string> = {
  VENDA: 'Valor total de vendas',
  CANCELAMENTO: 'Valor total de cancelamentos',
  ENTRADA: 'Valor total recebido',
  SAIDA: 'Valor total pago',
}
const diaDaSemana = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long' })

function ContaCorrente() {
  const { data: eu } = useSuspenseQuery(consultaEu)
  const podeEditar = pode(eu.perfis, 'financeiro.editar')
  const qc = useQueryClient()
  const hoje = isoLocal(new Date())
  const [filtro, setFiltro] = useState({ de: somarDias(hoje, -6), ate: hoje, tipo: '', busca: '' })
  const [rascunho, setRascunho] = useState(filtro)
  const [novo, setNovo] = useState(false)

  const lista = useQuery({
    queryKey: ['lancamentos', filtro],
    queryFn: async () =>
      (
        await api.get<Resposta>('/financeiro/lancamentos', {
          params: { ...filtro, tipo: filtro.tipo || undefined, busca: filtro.busca || undefined },
        })
      ).data,
  })

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Conta Corrente</h1>
          <p className="text-suave">Vendas, entradas e saídas da clínica.</p>
        </div>
        {podeEditar && (
          <button className="botao" onClick={() => setNovo(true)}>
            Novo lançamento
          </button>
        )}
      </header>

      <form
        className="cartao flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          setFiltro(rascunho)
          qc.invalidateQueries({ queryKey: ['lancamentos'] })
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
        <label>
          <span className="rotulo">Tipo</span>
          <select
            className="campo"
            value={rascunho.tipo}
            onChange={(e) => setRascunho({ ...rascunho, tipo: e.target.value })}
          >
            <option value="">Todos</option>
            {Object.entries(TIPOS_LANCAMENTO).map(([v, r]) => (
              <option key={v} value={v}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-48 flex-1">
          <span className="rotulo">Buscar</span>
          <input
            type="search"
            className="campo"
            placeholder="Descrição, forma ou paciente"
            value={rascunho.busca}
            onChange={(e) => setRascunho({ ...rascunho, busca: e.target.value })}
          />
        </label>
        <button className="botao">Listar</button>
      </form>

      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Totais</h2>
        <span className="text-suave">
          {lista.data ? `${lista.data.quantidade} lançamentos no período` : 'Carregando…'}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(TIPOS_LANCAMENTO) as TipoLancamento[]).map((t) => (
          <div key={t} className="cartao space-y-1">
            <p className="text-xs font-medium tracking-wide text-suave uppercase">
              {TIPOS_LANCAMENTO[t]}
            </p>
            <p className={`text-2xl font-semibold ${COR[t]}`}>
              {reais(lista.data?.totais[t] ?? 0)}
            </p>
            <p className="text-suave">{DESCRICAO[t]}</p>
          </div>
        ))}
      </div>

      {lista.isError && <p className="text-perigo">{mensagemDeErro(lista.error)}</p>}
      {lista.data?.dias.length === 0 && (
        <p className="cartao text-suave">Nenhum lançamento no período.</p>
      )}
      <div className="space-y-2">
        {lista.data?.dias.map((d) => (
          <details key={d.data} className="cartao p-0">
            <summary className="flex cursor-pointer flex-wrap items-center gap-4 px-4 py-3">
              <span className="w-12 text-center">
                <span className="block text-xl font-semibold">{d.data.slice(8)}</span>
                <span className="text-xs text-suave uppercase">
                  {new Date(`${d.data}T12:00:00`)
                    .toLocaleDateString('pt-BR', { month: 'short' })
                    .replace('.', '')}
                </span>
              </span>
              <span className="w-32">
                <span className="block font-medium first-letter:uppercase">
                  {diaDaSemana(d.data)}
                </span>
                <span className="text-suave">
                  {d.lancamentos.length} {d.lancamentos.length === 1 ? 'lançamento' : 'lançamentos'}
                </span>
              </span>
              {(Object.keys(TIPOS_LANCAMENTO) as TipoLancamento[]).map((t) => (
                <span key={t} className="min-w-28 flex-1">
                  <span className="block text-xs text-suave uppercase">{TIPOS_LANCAMENTO[t]}</span>
                  <span className={`font-medium ${d.totais[t] ? COR[t] : ''}`}>
                    {reais(d.totais[t])}
                  </span>
                </span>
              ))}
            </summary>
            <table className="w-full border-t border-borda text-left">
              <thead className="text-suave">
                <tr>
                  {['Tipo', 'Descrição', 'Paciente', 'Forma', 'Valor', 'Lançado por', ''].map(
                    (t) => (
                      <th key={t} className="px-4 py-2 font-medium">
                        {t}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {d.lancamentos.map((l) => (
                  <LinhaLancamento key={l.id} l={l} podeEditar={podeEditar} />
                ))}
              </tbody>
            </table>
          </details>
        ))}
      </div>

      <Dialogo aberto={novo} aoFechar={() => setNovo(false)} titulo="Novo lançamento">
        <NovoLancamento hoje={hoje} aoTerminar={() => setNovo(false)} />
      </Dialogo>
    </div>
  )
}

function LinhaLancamento({ l, podeEditar }: { l: Lancamento; podeEditar: boolean }) {
  const qc = useQueryClient()
  const excluir = useMutation({
    mutationFn: async () => (await api.delete(`/financeiro/lancamentos/${l.id}`)).data,
    onSuccess: () => {
      avisar('Lançamento excluído')
      qc.invalidateQueries({ queryKey: ['lancamentos'] })
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  return (
    <tr className="border-t border-borda">
      <td className={`px-4 py-2 ${COR[l.tipo]}`}>{TIPOS_LANCAMENTO[l.tipo]}</td>
      <td className="px-4 py-2">{l.descricao}</td>
      <td className="px-4 py-2">{l.paciente?.nome ?? ''}</td>
      <td className="px-4 py-2">{l.forma ?? ''}</td>
      <td className="px-4 py-2 font-medium">{reais(l.valorCentavos)}</td>
      <td className="px-4 py-2 text-suave">{l.criadoPor.nome}</td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        {l.tipo === 'ENTRADA' && l.paciente && (
          <Link
            to="/recibo/$id"
            params={{ id: String(l.id) }}
            className="mr-3 text-primaria hover:underline"
          >
            Recibo
          </Link>
        )}
        {podeEditar && (
          <button
            className="text-perigo hover:underline"
            disabled={excluir.isPending}
            onClick={() =>
              confirm(`Excluir o lançamento "${l.descricao}" de ${dataBR(l.data)}?`) &&
              excluir.mutate()
            }
          >
            Excluir
          </button>
        )}
      </td>
    </tr>
  )
}

function NovoLancamento({ hoje, aoTerminar }: { hoje: string; aoTerminar: () => void }) {
  const qc = useQueryClient()
  const [centavos, setCentavos] = useState(0)
  const [tipo, setTipo] = useState<TipoLancamento>('ENTRADA')
  const [paciente, setPaciente] = useState<Paciente | null>(null)
  const criar = useMutation({
    mutationFn: async (d: Record<string, unknown>) =>
      (await api.post('/financeiro/lancamentos', d)).data,
    onSuccess: () => {
      avisar('Lançamento registrado')
      qc.invalidateQueries({ queryKey: ['lancamentos'] })
      aoTerminar()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const erros = errosDosCampos(criar.error)
  const erro = (c: string) => erros[c] && <p className="mt-1 text-perigo">{erros[c]}</p>
  const comConta = tipo === 'ENTRADA' || tipo === 'SAIDA'

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        const f = Object.fromEntries(new FormData(e.currentTarget))
        criar.mutate({
          ...f,
          tipo,
          valorCentavos: centavos,
          pacienteId: paciente?.id,
          categoria: f.categoria || undefined,
        })
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label>
          <span className="rotulo">Tipo *</span>
          <select
            className="campo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoLancamento)}
          >
            {Object.entries(TIPOS_LANCAMENTO).map(([v, r]) => (
              <option key={v} value={v}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="rotulo">Data *</span>
          <CampoData name="data" defaultValue={hoje} required />
          {erro('data')}
        </label>
        <CampoReais
          id="lanc-valor"
          rotulo="Valor *"
          valor={centavos}
          aoMudar={setCentavos}
          erro={erros.valorCentavos}
        />
      </div>
      <label className="block">
        <span className="rotulo">Descrição *</span>
        <input name="descricao" className="campo" placeholder="Ex.: Parcela 1 do tratamento" />
        {erro('descricao')}
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="rotulo">Forma de pagamento</span>
          <select name="forma" className="campo" defaultValue="">
            <option value="">Não informar</option>
            {FORMAS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
        {comConta && (
          <label className="block">
            <span className="rotulo">Conta do plano de contas</span>
            <select name="categoria" className="campo" defaultValue="">
              <option value="">
                {tipo === 'ENTRADA'
                  ? 'Receita de tratamentos'
                  : 'Despesas operacionais (sem conta)'}
              </option>
              {Object.entries(PLANO_DE_CONTAS).map(([grupo, contas]) => (
                <optgroup key={grupo} label={grupo}>
                  {contas.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            {erro('categoria')}
          </label>
        )}
      </div>
      <div>
        <span className="rotulo">Paciente (opcional)</span>
        <BuscaPaciente valor={paciente} aoEscolher={setPaciente} />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="botao-leve" onClick={aoTerminar}>
          Cancelar
        </button>
        <button className="botao" disabled={criar.isPending}>
          Registrar
        </button>
      </div>
    </form>
  )
}
