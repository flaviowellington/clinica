// Caixa do dia (F-031): abrir com o troco, ver os recebimentos, fechar conferindo cada forma.
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, mensagemDeErro } from '../api'
import { avisar } from '../estado'
import { reais } from '../../../shared/financeiro'
import { CampoReais } from '../componentes/CampoReais'

type Conferencia = Record<string, { esperado: number; contado: number }>
interface Caixa {
  id: number
  abertoEm: string
  saldoInicialCentavos: number
  fechadoEm: string | null
  conferencia: Conferencia | null
  observacoes: string | null
  abertoPor: { nome: string }
  fechadoPor?: { nome: string } | null
}
interface CaixaAberto extends Caixa {
  esperado: Record<string, number>
  lancamentos: {
    id: number
    tipo: string
    valorCentavos: number
    descricao: string
    forma: string | null
    paciente: { id: number; nome: string } | null
    criadoPor: { nome: string }
  }[]
}

const quando = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const diferenca = (c: Conferencia) =>
  Object.values(c).reduce((s, f) => s + f.contado - f.esperado, 0)

export function CaixaTela() {
  const r = useQuery({
    queryKey: ['caixa'],
    queryFn: async () =>
      (await api.get<{ aberto: CaixaAberto | null; ultimos: Caixa[] }>('/caixa')).data,
  })
  if (!r.data) return <p className="text-suave">Carregando…</p>
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Caixa</h1>
        <p className="text-suave">
          Com o caixa aberto, os recebimentos no balcão entram nele. Para receber uma parcela, abra
          a ficha do paciente, aba Financeiro.
        </p>
      </div>
      {r.data.aberto ? <Aberto caixa={r.data.aberto} /> : <Abrir />}
      <section className="cartao space-y-3">
        <h2 className="font-semibold">Caixas fechados</h2>
        {!r.data.ultimos.length && <p className="text-suave">Nenhum caixa fechado ainda.</p>}
        {!!r.data.ultimos.length && (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-borda text-suave">
                <tr>
                  {['Aberto', 'Fechado', 'Por', 'Diferença', 'Observações'].map((t) => (
                    <th key={t} className="px-3 py-2 font-medium">
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.data.ultimos.map((c) => {
                  const d = c.conferencia ? diferenca(c.conferencia) : 0
                  return (
                    <tr key={c.id} className="border-b border-borda last:border-0">
                      <td className="px-3 py-2">{quando(c.abertoEm)}</td>
                      <td className="px-3 py-2">{c.fechadoEm && quando(c.fechadoEm)}</td>
                      <td className="px-3 py-2">
                        {c.abertoPor.nome}
                        {c.fechadoPor &&
                          c.fechadoPor.nome !== c.abertoPor.nome &&
                          ` / ${c.fechadoPor.nome}`}
                      </td>
                      <td className={`px-3 py-2 font-medium ${d ? 'text-perigo' : 'text-sucesso'}`}>
                        {d ? reais(d) : 'Bateu'}
                      </td>
                      <td className="px-3 py-2">{c.observacoes}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function Abrir() {
  const qc = useQueryClient()
  const [troco, setTroco] = useState(0)
  const abrir = useMutation({
    mutationFn: async () => (await api.post('/caixa/abrir', { saldoInicialCentavos: troco })).data,
    onSuccess: () => {
      avisar('Caixa aberto')
      qc.invalidateQueries({ queryKey: ['caixa'] })
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  return (
    <form
      className="cartao flex max-w-xl flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        abrir.mutate()
      }}
    >
      <p className="w-full font-medium">O caixa está fechado.</p>
      <div className="w-48">
        <CampoReais id="troco" rotulo="Troco inicial (dinheiro)" valor={troco} aoMudar={setTroco} />
      </div>
      <button className="botao" disabled={abrir.isPending}>
        Abrir caixa
      </button>
    </form>
  )
}

function Aberto({ caixa }: { caixa: CaixaAberto }) {
  const qc = useQueryClient()
  const formas = Object.keys(caixa.esperado)
  const [contado, setContado] = useState<Record<string, number>>({})
  const [senha, setSenha] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const fechar = useMutation({
    mutationFn: async () =>
      (
        await api.post('/caixa/fechar', {
          senha,
          observacoes,
          contado: Object.fromEntries(formas.map((f) => [f, contado[f] ?? 0])),
        })
      ).data,
    onSuccess: () => {
      avisar('Caixa fechado')
      qc.invalidateQueries({ queryKey: ['caixa'] })
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const totalEsperado = Object.values(caixa.esperado).reduce((s, v) => s + v, 0)
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="cartao space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Caixa aberto</h2>
          <span className="text-suave">
            por {caixa.abertoPor.nome} em {quando(caixa.abertoEm)}
          </span>
        </div>
        <p className="text-2xl font-semibold">{reais(totalEsperado)}</p>
        <p className="text-suave">Troco inicial: {reais(caixa.saldoInicialCentavos)}</p>
        <h3 className="font-medium">Recebimentos</h3>
        {!caixa.lancamentos.length && <p className="text-suave">Nenhum recebimento ainda.</p>}
        <ul className="divide-y divide-borda">
          {caixa.lancamentos.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="flex-1">
                {l.paciente ? (
                  <Link
                    to="/pacientes/$id"
                    params={{ id: String(l.paciente.id) }}
                    className="hover:text-primaria"
                  >
                    {l.paciente.nome}
                  </Link>
                ) : (
                  l.descricao
                )}
                <span className="block text-xs text-suave">
                  {l.forma ?? 'Forma não informada'} · {l.criadoPor.nome}
                </span>
              </span>
              <strong>{reais(l.valorCentavos)}</strong>
              <Link
                to="/recibo/$id"
                params={{ id: String(l.id) }}
                className="text-primaria hover:underline"
              >
                Recibo
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <form
        className="cartao space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          fechar.mutate()
        }}
      >
        <h2 className="font-semibold">Fechar o caixa</h2>
        <p className="text-suave">
          Conte o que há em cada forma e informe abaixo. A diferença fica registrada.
        </p>
        <table className="w-full text-left">
          <thead className="text-suave">
            <tr>
              <th className="py-1 font-medium">Forma</th>
              <th className="py-1 font-medium">Esperado</th>
              <th className="py-1 font-medium">Contado</th>
              <th className="py-1 font-medium">Diferença</th>
            </tr>
          </thead>
          <tbody>
            {formas.map((f) => {
              const d = (contado[f] ?? 0) - caixa.esperado[f]
              return (
                <tr key={f}>
                  <td className="py-1">{f}</td>
                  <td className="py-1">{reais(caixa.esperado[f])}</td>
                  <td className="w-40 py-1">
                    <CampoReais
                      id={`contado-${f}`}
                      rotulo={`Contado em ${f}`}
                      rotuloOculto
                      valor={contado[f] ?? 0}
                      aoMudar={(v) => setContado({ ...contado, [f]: v })}
                    />
                  </td>
                  <td className={`py-1 ${d ? 'text-perigo' : 'text-sucesso'}`}>
                    {d ? reais(d) : 'ok'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <label className="block">
          <span className="rotulo">Observações</span>
          <input
            className="campo"
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            maxLength={1000}
          />
        </label>
        <label className="block">
          <span className="rotulo">Sua senha (confirma o fechamento)</span>
          <input
            type="password"
            className="campo"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <div className="flex justify-end">
          <button className="botao" disabled={!senha || fechar.isPending}>
            Fechar caixa
          </button>
        </div>
      </form>
    </div>
  )
}
