// Gráficos personalizados: o que o código (SQL ou Python) enxerga, o prompt para pedir o código
// a uma IA e a execução no worker (no navegador, só com os dados que a tela já carregou).
import type { Analise } from '../paginas/FinanceiroAbas'
import type { Pedido, Resposta, Tabela } from './codigoGrafico.worker'

export type Linguagem = 'sql' | 'python'
type Tipo = Tabela['colunas'][number][1]
const TIPO_LEGIVEL: Record<Tipo, string> = { INTEGER: 'inteiro', REAL: 'decimal', TEXT: 'texto' }

/** O que o código pode usar. Em SQL são tabelas; em Python, listas de dicionários. */
export const VARIAVEIS: {
  nome: string
  descricao: string
  colunas: [string, Tipo, string][]
}[] = [
  {
    nome: 'orcamentos',
    descricao: 'Orçamentos aprovados no período, um por linha',
    colunas: [
      ['id', 'INTEGER', 'nº do orçamento'],
      ['aprovado_em', 'TEXT', 'data da aprovação (AAAA-MM-DD)'],
      ['paciente', 'TEXT', 'nome do paciente'],
      ['profissional_id', 'INTEGER', ''],
      ['profissional', 'TEXT', 'nome do profissional'],
      ['total', 'REAL', 'valor final em R$, já com desconto'],
      ['desconto', 'REAL', 'desconto em R$'],
      ['custo', 'REAL', 'custo em R$'],
      ['recebido', 'REAL', 'quanto já foi pago, em R$'],
    ],
  },
  {
    nome: 'itens',
    descricao: 'Procedimentos de cada orçamento aprovado',
    colunas: [
      ['orcamento_id', 'INTEGER', 'liga com orcamentos.id'],
      ['nome', 'TEXT', 'nome do procedimento'],
      ['especialidade', 'TEXT', 'pode ser vazio'],
      ['valor', 'REAL', 'preço em R$, antes do desconto do orçamento'],
      ['custo', 'REAL', 'custo em R$'],
    ],
  },
  {
    nome: 'entradas',
    descricao: 'Dinheiro que entrou no caixa no período',
    colunas: [
      ['id', 'INTEGER', ''],
      ['data', 'TEXT', 'data do recebimento (AAAA-MM-DD)'],
      ['valor', 'REAL', 'valor em R$'],
      ['forma', 'TEXT', 'forma de pagamento; pode ser vazio'],
      ['profissional_id', 'INTEGER', ''],
      ['profissional', 'TEXT', 'nome do profissional'],
    ],
  },
]
export const tipoLegivel = (t: Tipo) => TIPO_LEGIVEL[t]

/** Os dados da tela no formato das variáveis (valores em reais, não em centavos). */
export function tabelasDe(a: Analise): Record<string, Tabela> {
  const r = (c: number) => c / 100
  const linhas: Record<string, Record<string, unknown>[]> = {
    orcamentos: a.orcamentos.map((o) => ({
      id: o.id,
      aprovado_em: o.aprovadoEm,
      paciente: o.paciente.nome,
      profissional_id: o.profissional.id,
      profissional: o.profissional.nome,
      total: r(o.totalCentavos),
      desconto: r(o.descontoCentavos),
      custo: r(o.custoCentavos),
      recebido: r(o.recebidoCentavos),
    })),
    itens: a.orcamentos.flatMap((o) =>
      o.itens.map((i) => ({
        orcamento_id: o.id,
        nome: i.nome,
        especialidade: i.especialidade,
        valor: r(i.valorCentavos),
        custo: r(i.custoCentavos),
      })),
    ),
    entradas: a.entradas.map((e) => ({
      id: e.id,
      data: e.data,
      valor: r(e.valorCentavos),
      forma: e.forma,
      profissional_id: e.profissional.id,
      profissional: e.profissional.nome,
    })),
  }
  return Object.fromEntries(
    VARIAVEIS.map((v) => [
      v.nome,
      { colunas: v.colunas.map(([c, t]) => [c, t] as const), linhas: linhas[v.nome] },
    ]),
  ) as Record<string, Tabela>
}

export const MODELOS: Record<Linguagem, string> = {
  sql: `-- 1ª coluna = rótulo (eixo ou fatia); as outras = números, uma série cada.
SELECT profissional,
       SUM(total)        AS faturamento,
       SUM(total - custo) AS lucro
FROM orcamentos
GROUP BY profissional
ORDER BY faturamento DESC
`,
  python: `def grafico(orcamentos, itens, entradas, de, ate):
    # Devolva uma lista de dicionários: a 1ª chave é o rótulo, as outras são números.
    soma = {}
    for e in entradas:
        forma = e["forma"] or "Não informada"
        soma[forma] = soma.get(forma, 0) + e["valor"]
    return [
        {"forma": forma, "recebido": valor}
        for forma, valor in sorted(soma.items(), key=lambda x: -x[1])
    ]
`,
}

export const FINALIDADE_VAZIA = '<descreva aqui o que você quer ver no gráfico>'

/** Prompt pronto para pedir o código a uma IA: só a finalidade, no fim, muda. Não leva dados. */
export function promptModelo(linguagem: Linguagem, finalidade: string) {
  const sql = linguagem === 'sql'
  const tabelas = VARIAVEIS.map(
    (v) =>
      `- ${v.nome}: ${v.descricao}\n${v.colunas
        .map(([c, t, d]) => `    - ${c} (${TIPO_LEGIVEL[t]})${d ? `: ${d}` : ''}`)
        .join('\n')}`,
  ).join('\n')
  return `Escreva ${sql ? 'uma consulta SQL (dialeto SQLite)' : 'uma função Python 3 (só a biblioteca padrão; sem pandas, sem acesso à internet)'} que gera os dados de um gráfico no sistema financeiro de uma clínica odontológica.

Dados disponíveis, já filtrados pelo período e pelos profissionais escolhidos na tela (${sql ? 'tabelas' : 'listas de dicionários, uma chave por coluna'}):
${tabelas}
${sql ? '- periodo: uma linha só, com as colunas de e ate (texto AAAA-MM-DD): o período escolhido.' : '- de, ate: texto AAAA-MM-DD, o período escolhido.'}

Como o resultado vira gráfico:
${
  sql
    ? '- Um único SELECT no fim. A 1ª coluna é o rótulo (eixo X ou fatia da pizza); cada uma das outras colunas é uma série e precisa ser numérica.\n- Use ORDER BY para a ordem das barras.'
    : '- Defina def grafico(orcamentos, itens, entradas, de, ate) que devolve uma lista de dicionários.\n- A 1ª chave de cada dicionário é o rótulo (eixo X ou fatia da pizza); cada uma das outras chaves é uma série e precisa ser numérica.\n- A ordem da lista é a ordem das barras.'
}
- Valores em dinheiro estão em reais (número decimal). Datas são texto AAAA-MM-DD.
- Responda só com o código, sem explicações.

Finalidade do gráfico: ${finalidade.trim() || FINALIDADE_VAZIA}`
}

// ── Execução ────────────────────────────────────────────────────────────────
export interface Resultado {
  colunas: string[]
  linhas: unknown[][]
  saida: string[]
}

let worker: Worker | null = null
let seq = 0
const esperando = new Map<number, (r: Resposta) => void>()

function obterWorker() {
  if (!worker) {
    worker = new Worker(new URL('./codigoGrafico.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<Resposta>) => {
      esperando.get(e.data.id)?.(e.data)
      esperando.delete(e.data.id)
    }
  }
  return worker
}

/** Roda o código. Passou do tempo (laço infinito?): encerra o worker e todos os pedidos falham. */
export function executar(
  p: { linguagem: Linguagem; fonte: string; analise: Analise; de: string; ate: string },
  limiteMs = 60_000, // ponytail: folga para a 1ª carga do Python (~12 MB); um limite só para os dois
): Promise<Resultado> {
  const id = ++seq
  return new Promise((ok, falha) => {
    const relogio = setTimeout(() => {
      worker?.terminate()
      worker = null
      for (const f of esperando.values())
        f({ id: 0, ok: false, erro: 'O código demorou demais e foi interrompido.', saida: [] })
      esperando.clear()
    }, limiteMs)
    esperando.set(id, (r) => {
      clearTimeout(relogio)
      if (r.ok) ok(r)
      else falha(Object.assign(new Error(r.erro), { saida: r.saida }))
    })
    const pedido: Pedido = {
      id,
      linguagem: p.linguagem,
      fonte: p.fonte,
      tabelas: tabelasDe(p.analise),
      de: p.de,
      ate: p.ate,
    }
    obterWorker().postMessage(pedido)
  })
}
