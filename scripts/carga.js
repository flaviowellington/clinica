// Teste de carga da API com autocannon: npm run carga
//
// Sobe uma API própria na porta 3201 com o banco de TESTE (apaga e recria com o seed, como o
// e2e) e mede os cenários abaixo, um de cada vez. Nunca usa o banco de desenvolvimento.
// Não rode junto com o e2e: os dois recriam o mesmo banco de teste.
//
//   npm run carga                         10 s por cenário, 10 conexões
//   npm run carga -- --duracao 30 --conexoes 50
//   npm run carga -- --p99 300            falha (código 1) se algum p99 passar de 300 ms
//   npm run carga -- --so pacientes,agenda
// A rodada fica salva em test-results/carga.json.
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { parseArgs, styleText } from 'node:util'
import autocannon from 'autocannon'
import dotenv from 'dotenv'

const { values: opc } = parseArgs({
  options: {
    duracao: { type: 'string', default: '10' },
    conexoes: { type: 'string', default: '10' },
    p99: { type: 'string', default: '1000' },
    so: { type: 'string', default: '' },
  },
})
const env = dotenv.config({ path: 'server/.env', quiet: true }).parsed ?? {}
const PORTA = 3201
const BASE = `http://localhost:${PORTA}`
const cor = (c, t) => styleText(c, String(t))

// ── API de teste ────────────────────────────────────────────────────────────
function subirApi() {
  if (!env.DATABASE_URL_TESTE) throw new Error('Defina DATABASE_URL_TESTE em server/.env')
  const logs = []
  const p = spawn('npm run e2e:servidor -w server', {
    shell: true,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      DATABASE_URL: env.DATABASE_URL_TESTE,
      PORTA: String(PORTA),
      // Sem isso o limite de 600 pedidos/min por IP responde 429 e a medida não vale.
      LIMITE_API_POR_MINUTO: '1000000000',
    },
  })
  for (const s of [p.stdout, p.stderr]) s.on('data', (b) => logs.push(String(b)))
  const parar = () => {
    if (p.exitCode !== null) return
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F'])
    else process.kill(-p.pid)
  }
  return { parar, logs, saiu: () => p.exitCode !== null }
}

async function esperarApi(api, ms = 180_000) {
  const fim = Date.now() + ms
  while (Date.now() < fim) {
    if (api.saiu()) throw new Error(`A API parou ao subir:\n${api.logs.join('')}`)
    try {
      if ((await fetch(`${BASE}/api/saude`)).ok) return
    } catch {
      // ainda subindo
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`A API não respondeu em ${ms / 1000} s:\n${api.logs.join('')}`)
}

async function entrar() {
  const r = await fetch(`${BASE}/api/entrar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ login: 'admin', senha: env.SEED_SENHA_ADMIN }),
  })
  if (!r.ok) throw new Error(`Login falhou (${r.status}): confira SEED_SENHA_ADMIN em server/.env`)
  return r.headers.get('set-cookie').split(';')[0]
}

// ── Cenários ────────────────────────────────────────────────────────────────
const hoje = new Date().toISOString().slice(0, 10)
const emSete = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)

/** Cada cenário: nome, método e caminho (ou função que monta o pedido). */
function cenarios(pacienteId, profissionalId) {
  let n = 0
  return [
    { nome: 'saude', titulo: 'Saúde (sem login)', caminho: '/api/saude', semLogin: true },
    { nome: 'eu', titulo: 'Usuário logado', caminho: '/api/eu' },
    { nome: 'pacientes', titulo: 'Buscar pacientes', caminho: '/api/pacientes?busca=silva' },
    { nome: 'ficha', titulo: 'Abrir ficha do paciente', caminho: `/api/pacientes/${pacienteId}` },
    {
      nome: 'odontograma',
      titulo: 'Procedimentos do paciente',
      caminho: `/api/pacientes/${pacienteId}/procedimentos`,
    },
    {
      nome: 'planejamentos',
      titulo: 'Planejamentos do paciente',
      caminho: `/api/pacientes/${pacienteId}/fichas`,
    },
    { nome: 'agenda', titulo: 'Agenda da semana', caminho: `/api/agenda?de=${hoje}&ate=${emSete}` },
    {
      nome: 'tabela',
      titulo: 'Tabela de procedimentos',
      caminho: '/api/procedimentos?busca=resina',
    },
    {
      nome: 'orcamentos',
      titulo: 'Orçamentos abertos',
      caminho: '/api/financeiro/orcamentos-abertos',
    },
    {
      nome: 'painel',
      titulo: 'Painel de indicadores',
      caminho: `/api/painel?de=${hoje.slice(0, 8)}01&ate=${hoje}`,
    },
    {
      nome: 'cadastro',
      titulo: 'Cadastrar paciente (escrita)',
      metodo: 'POST',
      caminho: '/api/pacientes',
      // Nome diferente a cada pedido.
      corpo: () => ({
        nome: `Paciente Fictício Carga ${Date.now()}-${++n}`,
        nascimento: '1990-01-01',
      }),
    },
    {
      nome: 'lote',
      titulo: 'Lançar procedimento no planejamento (escrita)',
      metodo: 'POST',
      prepara: async (cookie) => {
        const r = await fetch(`${BASE}/api/pacientes/${pacienteId}/fichas`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie },
          body: JSON.stringify({ especialidade: 'Endodontia', profissionalId }),
        })
        return `/api/prontuario/fichas/${(await r.json()).id}/itens/lote`
      },
      corpo: () => ({ procedimentos: ['Selante'], dentes: [{ dente: '16' }, { dente: '26' }] }),
    },
  ]
}

async function medir(c, cookie) {
  const caminho = c.prepara ? await c.prepara(cookie) : c.caminho
  const headers = { 'content-type': 'application/json', ...(!c.semLogin && { cookie }) }
  // Um pedido antes: cenário que nem responde 2xx não vale medir.
  const teste = await fetch(BASE + caminho, {
    method: c.metodo ?? 'GET',
    headers,
    body: c.corpo && JSON.stringify(c.corpo()),
  })
  if (!teste.ok) return { ...c, pulado: `responde ${teste.status}` }

  const r = await autocannon({
    url: BASE + caminho,
    connections: Number(opc.conexoes),
    duration: Number(opc.duracao),
    headers,
    requests: [
      {
        method: c.metodo ?? 'GET',
        ...(c.corpo && { setupRequest: (req) => ({ ...req, body: JSON.stringify(c.corpo()) }) }),
      },
    ],
  })
  return { ...c, r }
}

// ── Saída ───────────────────────────────────────────────────────────────────
const COLUNAS = [
  ['Cenário', 34, (x) => x.titulo],
  ['req/s', 8, (x) => x.r.requests.average.toFixed(0)],
  ['p50 ms', 8, (x) => x.r.latency.p50],
  ['p97,5 ms', 9, (x) => x.r.latency.p97_5],
  ['p99 ms', 8, (x) => x.r.latency.p99],
  ['máx ms', 8, (x) => x.r.latency.max],
  ['pedidos', 9, (x) => x.r.requests.total],
  ['não-2xx', 8, (x) => x.r.non2xx],
  ['erros', 6, (x) => x.r.errors + x.r.timeouts],
]
const linha = (cels) =>
  cels
    .map((t, i) => (i ? String(t).padStart(COLUNAS[i][1]) : String(t).padEnd(COLUNAS[i][1])))
    .join(' │ ')

function imprimir(resultados) {
  const limite = Number(opc.p99)
  const cab = linha(COLUNAS.map(([t]) => t))
  console.log(`\n${cor('bold', cab)}\n${'─'.repeat(cab.length)}`)
  const falhas = []
  for (const x of resultados) {
    // Pulado também falha: um cenário quebrado não pode sumir da medida em silêncio.
    if (x.pulado) {
      falhas.push(x)
      console.log(cor('red', `${x.titulo.padEnd(COLUNAS[0][1])} │ pulado: ${x.pulado}`))
      continue
    }
    const ruim = x.r.non2xx || x.r.errors || x.r.timeouts || x.r.latency.p99 > limite
    x.falhou = !!ruim
    if (ruim) falhas.push(x)
    console.log(cor(ruim ? 'red' : 'green', linha(COLUNAS.map(([, , f]) => f(x)))))
  }
  console.log('─'.repeat(cab.length))
  console.log(
    `${Number(opc.conexoes)} conexões · ${Number(opc.duracao)} s por cenário · limite p99 ${limite} ms`,
  )
  if (falhas.length)
    console.log(
      cor(
        'red',
        `✘ ${falhas.length} cenário(s) com erro ou p99 acima do limite: ${falhas.map((f) => f.nome).join(', ')}`,
      ),
    )
  else console.log(cor('green', '✔ Todos os cenários dentro do limite'))
  return falhas.length
}

/** Guarda a rodada em test-results/carga.json (fora do git), para comparar com a próxima. */
function salvar(resultados) {
  const arquivo = 'test-results/carga.json'
  mkdirSync('test-results', { recursive: true })
  const cenario = (x) =>
    x.pulado
      ? { nome: x.nome, titulo: x.titulo, pulado: x.pulado }
      : {
          nome: x.nome,
          titulo: x.titulo,
          falhou: x.falhou,
          reqPorSegundo: Math.round(x.r.requests.average),
          latenciaMs: {
            p50: x.r.latency.p50,
            p97_5: x.r.latency.p97_5,
            p99: x.r.latency.p99,
            max: x.r.latency.max,
          },
          pedidos: x.r.requests.total,
          naoDois: x.r.non2xx,
          erros: x.r.errors,
          timeouts: x.r.timeouts,
        }
  const dados = {
    em: new Date().toISOString(),
    conexoes: Number(opc.conexoes),
    duracaoS: Number(opc.duracao),
    limiteP99Ms: Number(opc.p99),
    cenarios: resultados.map(cenario),
  }
  writeFileSync(arquivo, JSON.stringify(dados, null, 2))
  console.log(cor('dim', `Resultado salvo em ${arquivo}`))
}

// ── Principal ───────────────────────────────────────────────────────────────
// Uma API antiga na mesma porta responderia no lugar da nova enquanto esta apaga e recria o
// banco: o login some no meio da medida e tudo vira 401.
if (
  await fetch(`${BASE}/api/saude`).then(
    () => true,
    () => false,
  )
) {
  console.error(
    cor('red', `✘ A porta ${PORTA} já está em uso (API de outra rodada?). Feche-a e rode de novo.`),
  )
  process.exit(1)
}
const api = subirApi()
process.on('SIGINT', () => {
  api.parar()
  process.exit(130)
})
let codigo
try {
  console.log(cor('cyan', `▶ Subindo a API de teste em ${BASE} (migra e recria o banco de teste)…`))
  await esperarApi(api)
  const cookie = await entrar()
  const get = async (c) => (await fetch(BASE + c, { headers: { cookie } })).json()
  const {
    itens: [paciente],
  } = await get('/api/pacientes?busca=silva')
  const { profissionais } = await get('/api/agenda/profissionais')
  const escolhidos = opc.so ? new Set(opc.so.split(',')) : null
  const lista = cenarios(paciente.id, profissionais[0].id).filter(
    (c) => !escolhidos || escolhidos.has(c.nome),
  )

  const resultados = []
  for (const [i, c] of lista.entries()) {
    process.stdout.write(cor('dim', `  [${i + 1}/${lista.length}] ${c.titulo}…`))
    const x = await medir(c, cookie)
    process.stdout.write(x.pulado ? cor('yellow', ' pulado\n') : cor('dim', ' ok\n'))
    resultados.push(x)
  }
  codigo = imprimir(resultados) ? 1 : 0
  salvar(resultados)
} catch (e) {
  console.error(cor('red', `✘ ${e.message}`))
  codigo = 1
} finally {
  // Falhou: guarda a saída da API (erros do servidor) para achar a causa.
  if (codigo) {
    mkdirSync('test-results', { recursive: true })
    writeFileSync('test-results/carga-api.log', api.logs.join(''))
    console.log(cor('dim', 'Saída da API salva em test-results/carga-api.log'))
  }
  api.parar()
}
process.exit(codigo)
