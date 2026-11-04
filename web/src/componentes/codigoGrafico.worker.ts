// Roda o código dos gráficos personalizados (SQL ou Python) longe da tela: um laço infinito
// não trava a página, e quem chama encerra o worker se passar do tempo.
// Só enxerga os dados que a tela já tinha carregado; não tem acesso ao banco.
import initSqlJs, { type SqlJsStatic } from 'sql.js'
import wasmSql from 'sql.js/dist/sql-wasm.wasm?url'
import type { PyodideInterface } from 'pyodide'

export interface Tabela {
  colunas: [nome: string, tipo: 'INTEGER' | 'REAL' | 'TEXT'][]
  linhas: Record<string, unknown>[]
}
export interface Pedido {
  id: number
  linguagem: 'sql' | 'python'
  fonte: string
  tabelas: Record<string, Tabela>
  de: string
  ate: string
}
export type Resposta = { id: number } & (
  | { ok: true; colunas: string[]; linhas: unknown[][]; saida: string[] }
  | { ok: false; erro: string; saida: string[] }
)

let sql: Promise<SqlJsStatic> | undefined
let py: Promise<PyodideInterface> | undefined

function rodarSql(SQL: SqlJsStatic, p: Pedido) {
  const db = new SQL.Database()
  try {
    const tabelas: Record<string, Tabela> = {
      ...p.tabelas,
      periodo: {
        colunas: [
          ['de', 'TEXT'],
          ['ate', 'TEXT'],
        ],
        linhas: [{ de: p.de, ate: p.ate }],
      },
    }
    for (const [nome, t] of Object.entries(tabelas)) {
      db.run(`CREATE TABLE ${nome} (${t.colunas.map(([c, tipo]) => `${c} ${tipo}`).join(', ')})`)
      const ins = db.prepare(`INSERT INTO ${nome} VALUES (${t.colunas.map(() => '?').join(', ')})`)
      for (const l of t.linhas) ins.run(t.colunas.map(([c]) => (l[c] ?? null) as string | number))
      ins.free()
    }
    // Vale o resultado do último SELECT. Sem linhas, o sql.js não devolve nada: gráfico vazio.
    const r = db.exec(p.fonte).at(-1)
    return { colunas: r?.columns ?? [], linhas: r?.values ?? [] }
  } finally {
    db.close()
  }
}

async function rodarPython(pyodide: PyodideInterface, p: Pedido) {
  const ns = pyodide.globals.get('dict')()
  try {
    // Em Python cada tabela é uma lista de dicionários.
    const linhas = Object.fromEntries(Object.entries(p.tabelas).map(([n, t]) => [n, t.linhas]))
    ns.set('_dados', JSON.stringify({ ...linhas, de: p.de, ate: p.ate }))
    await pyodide.runPythonAsync(p.fonte, { globals: ns })
    const json: string = await pyodide.runPythonAsync(
      `import json as _json
if not callable(globals().get("grafico")):
    raise NameError("Defina a função grafico(orcamentos, itens, entradas, de, ate).")
_d = _json.loads(_dados)
_json.dumps(grafico(_d["orcamentos"], _d["itens"], _d["entradas"], _d["de"], _d["ate"]), default=str)`,
      { globals: ns },
    )
    const lista: unknown = JSON.parse(json)
    if (!Array.isArray(lista) || lista.some((l) => !l || typeof l !== 'object' || Array.isArray(l)))
      throw new Error('grafico() precisa devolver uma lista de dicionários.')
    const colunas = lista.length ? Object.keys(lista[0]) : []
    return { colunas, linhas: lista.map((l: Record<string, unknown>) => colunas.map((c) => l[c])) }
  } finally {
    ns.destroy()
  }
}

/** Erro do Python: só o fim do traceback interessa (o começo é a casca do Pyodide). */
const limpar = (e: unknown) => {
  const txt = e instanceof Error ? e.message : String(e)
  const i = txt.indexOf('File "<exec>"')
  return (i >= 0 ? txt.slice(i) : txt).trim()
}

self.onmessage = async (ev: MessageEvent<Pedido>) => {
  const p = ev.data
  const saida: string[] = []
  try {
    let r
    if (p.linguagem === 'sql') {
      r = rodarSql(await (sql ??= initSqlJs({ locateFile: () => wasmSql })), p)
    } else {
      py ??= import(/* @vite-ignore */ `${self.location.origin}/pyodide/pyodide.mjs`).then(
        (m: typeof import('pyodide')) => m.loadPyodide({ indexURL: '/pyodide/' }),
      )
      const pyodide = await py
      pyodide.setStdout({ batched: (s) => saida.push(s) })
      r = await rodarPython(pyodide, p)
    }
    self.postMessage({ id: p.id, ok: true, ...r, saida } satisfies Resposta)
  } catch (e) {
    self.postMessage({ id: p.id, ok: false, erro: limpar(e), saida } satisfies Resposta)
  }
}
