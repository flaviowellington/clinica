// Dashboard Analítico (R-088): indicadores do período em números e barras simples.
import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, isoLocal } from '../api'
import { reais } from '../../../shared/financeiro'
import { CampoData } from '../componentes/CampoData'

interface Item {
  rotulo: string
  valor: number
}
interface Dados {
  consultas: {
    total: number
    atendidas: number
    faltas: number
    desmarcadas: number
    ocupacao: number
    porCategoria: Item[]
    porProfissional: { nome: string; consultas: number; faltas: number }[]
  }
  financeiro: {
    vendido: number
    cancelado: number
    recebido: number
    despesas: number
    resultado: number
    recibos: number
    porForma: Item[]
  }
  inadimplencia: { valor: number; parcelas: number; pacientes: number }
  orcamentos: {
    criados: number
    aprovados: number
    conversao: number
    valorAprovado: number
    porEspecialidade: Item[]
  }
  pacientesNovos: number
  caixa: { fechados: number; diferenca: number }
}

const pct = (v: number) => `${Math.round(v * 100)}%`
const inicioDoMes = () => `${isoLocal(new Date()).slice(0, 8)}01`

export function Painel() {
  const [de, setDe] = useState(inicioDoMes())
  const [ate, setAte] = useState(isoLocal(new Date()))
  const r = useQuery({
    queryKey: ['painel', de, ate],
    queryFn: async () => (await api.get<Dados>('/painel', { params: { de, ate } })).data,
    enabled: !!de && !!ate,
  })
  const d = r.data
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-semibold">Painel</h1>
        <div className="flex flex-wrap items-end gap-2">
          <label>
            <span className="rotulo">De</span>
            <CampoData value={de} onChange={setDe} />
          </label>
          <label>
            <span className="rotulo">Até</span>
            <CampoData value={ate} onChange={setAte} />
          </label>
        </div>
      </div>
      {r.isPending && <p className="text-suave">Carregando…</p>}
      {d && (
        <>
          <Grupo titulo="Agenda">
            <Numero rotulo="Consultas" valor={d.consultas.total} />
            <Numero rotulo="Atendidas" valor={d.consultas.atendidas} />
            <Numero
              rotulo="Faltas"
              valor={d.consultas.faltas}
              nota={
                d.consultas.total
                  ? `${pct(d.consultas.faltas / d.consultas.total)} das consultas`
                  : undefined
              }
            />
            <Numero rotulo="Desmarcações" valor={d.consultas.desmarcadas} />
            <Numero
              rotulo="Ocupação da agenda"
              valor={pct(d.consultas.ocupacao)}
              nota="dos horários dos dias atendidos"
            />
            <Numero rotulo="Pacientes novos" valor={d.pacientesNovos} />
          </Grupo>

          <Grupo titulo="Financeiro">
            <Numero rotulo="Vendido (orçamentos aprovados)" valor={reais(d.financeiro.vendido)} />
            <Numero
              rotulo="Recebido"
              valor={reais(d.financeiro.recebido)}
              nota={`${d.financeiro.recibos} recebimento(s)`}
            />
            <Numero rotulo="Despesas pagas" valor={reais(d.financeiro.despesas)} />
            <Numero
              rotulo="Resultado (recebido − despesas)"
              valor={reais(d.financeiro.resultado)}
            />
            <Numero
              rotulo="Inadimplência hoje"
              valor={reais(d.inadimplencia.valor)}
              nota={`${d.inadimplencia.parcelas} parcela(s) de ${d.inadimplencia.pacientes} paciente(s)`}
            />
            <Numero
              rotulo="Diferença nos caixas"
              valor={d.caixa.diferenca ? reais(d.caixa.diferenca) : 'Nenhuma'}
              nota={`${d.caixa.fechados} caixa(s) fechado(s)`}
            />
          </Grupo>

          <Grupo titulo="Orçamentos">
            <Numero rotulo="Criados" valor={d.orcamentos.criados} />
            <Numero rotulo="Aprovados" valor={d.orcamentos.aprovados} />
            <Numero
              rotulo="Conversão"
              valor={pct(d.orcamentos.conversao)}
              nota="aprovados ÷ criados"
            />
            <Numero rotulo="Valor aprovado" valor={reais(d.orcamentos.valorAprovado)} />
          </Grupo>

          <div className="grid gap-4 lg:grid-cols-2">
            <Barras titulo="Consultas por categoria" itens={d.consultas.porCategoria} />
            <Barras
              titulo="Consultas por profissional"
              itens={d.consultas.porProfissional.map((p) => ({
                rotulo: p.nome,
                valor: p.consultas,
              }))}
              nota={(i) => {
                const p = d.consultas.porProfissional.find((x) => x.nome === i.rotulo)
                return p?.faltas ? `${p.faltas} falta(s)` : ''
              }}
            />
            <Barras
              titulo="Recebido por forma de pagamento"
              itens={d.financeiro.porForma}
              formatar={reais}
            />
            <Barras
              titulo="Vendas por especialidade"
              itens={d.orcamentos.porEspecialidade}
              formatar={reais}
            />
          </div>
        </>
      )}
    </div>
  )
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-semibold text-suave">{titulo}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{children}</div>
    </section>
  )
}

function Numero({ rotulo, valor, nota }: { rotulo: string; valor: ReactNode; nota?: string }) {
  return (
    <div className="cartao">
      <p className="text-suave">{rotulo}</p>
      <p className="text-2xl font-semibold tabular-nums">{valor}</p>
      {nota && <p className="text-xs text-suave">{nota}</p>}
    </div>
  )
}

/** Barras horizontais de uma série só: o rótulo e o valor ficam escritos, a barra só compara. */
function Barras(props: {
  titulo: string
  itens: Item[]
  formatar?: (v: number) => string
  nota?: (i: Item) => string
}) {
  const max = Math.max(1, ...props.itens.map((i) => i.valor))
  const fmt = props.formatar ?? String
  return (
    <section className="cartao space-y-3">
      <h2 className="font-semibold">{props.titulo}</h2>
      {!props.itens.length && <p className="text-suave">Nada no período.</p>}
      <ul className="space-y-2">
        {props.itens.slice(0, 10).map((i) => (
          <li key={i.rotulo} title={`${i.rotulo}: ${fmt(i.valor)}`} className="group">
            <div className="flex justify-between gap-2">
              <span className="truncate">{i.rotulo}</span>
              <span className="shrink-0 font-medium tabular-nums">
                {fmt(i.valor)}
                {props.nota?.(i) && (
                  <span className="ml-1 font-normal text-suave">· {props.nota(i)}</span>
                )}
              </span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-borda/60">
              <div
                className="h-full rounded-full bg-primaria group-hover:opacity-80"
                style={{ width: `${(i.valor / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      {props.itens.length > 10 && (
        <p className="text-xs text-suave">E mais {props.itens.length - 10}.</p>
      )}
    </section>
  )
}
