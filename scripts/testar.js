// Roda as suítes uma depois da outra, nesta ordem, com um cabeçalho para cada e um resumo no fim.
//
//   npm run test:tudo                          todas as etapas abaixo (menos permissões)
//   npm run test:tudo -- unidade web           só as escolhidas (sempre na ordem abaixo)
//   npm run test:tudo -- permissoes            a de permissões só roda quando pedida
//
// Sai com código 1 se alguma falhar (todas rodam mesmo assim).
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { styleText } from 'node:util'

// Cada rodada do Playwright apaga a própria pasta: smoke e jornadas guardam em pastas separadas.
const playwright = (filtro, pasta) => `npx playwright test ${filtro} --output test-results/${pasta}`
const ETAPAS = [
  { id: 'tipos', titulo: 'Typecheck: TypeScript do server e do web', cmd: 'npm run typecheck' },
  { id: 'web', titulo: 'Unitários: componentes do front (jsdom)', cmd: 'npm test -w web' },
  {
    id: 'unidade',
    titulo: 'Unitários: regras de shared/ no server',
    cmd: 'npm run test:unidade -w server',
  },
  { id: 'api', titulo: 'Integração: rotas da API com o banco de teste', cmd: 'npm test -w server' },
  {
    id: 'permissoes',
    titulo: 'Permissões por perfil (manual)',
    cmd: 'npm run test:permissoes -w server',
    soPedido: true,
  },
  {
    id: 'smoke',
    titulo: 'E2E smoke: todo perfil abre todo módulo',
    cmd: playwright('--grep @smoke', 'e2e-smoke'),
    relatorio: 'playwright-report/smoke',
  },
  {
    id: 'jornadas',
    titulo: 'E2E jornadas completas (Playwright)',
    cmd: playwright('--grep-invert @smoke', 'e2e'),
    relatorio: 'playwright-report/jornadas',
  },
  { id: 'carga', titulo: 'Carga da API (autocannon)', cmd: 'node scripts/carga.js' },
]

const pedidas = process.argv.slice(2)
const desconhecidas = pedidas.filter((p) => !ETAPAS.some((e) => e.id === p))
if (desconhecidas.length) {
  console.error(
    `Etapa desconhecida: ${desconhecidas.join(', ')}. Use: ${ETAPAS.map((e) => e.id).join(', ')}`,
  )
  process.exit(2)
}
const escolhidas = ETAPAS.filter((e) => (pedidas.length ? pedidas.includes(e.id) : !e.soPedido))

const largura = Math.min(process.stdout.columns || 80, 100)
const barra = (c) => styleText(c, '═'.repeat(largura))
const tempo = (ms) =>
  ms < 60_000
    ? `${(ms / 1000).toFixed(1)} s`
    : `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`

const resultados = []
for (const [i, e] of escolhidas.entries()) {
  console.log(`\n${barra('cyan')}`)
  console.log(styleText(['bold', 'cyan'], ` ▶ ${i + 1}/${escolhidas.length}  ${e.titulo}`))
  console.log(styleText('dim', `   ${e.cmd}`))
  console.log(barra('cyan'))
  const inicio = Date.now()
  const r = spawnSync(e.cmd, {
    shell: true,
    stdio: 'inherit',
    env: {
      ...process.env,
      FORCE_COLOR: '1',
      ...(e.relatorio && { PLAYWRIGHT_HTML_OUTPUT_DIR: e.relatorio }),
    },
  })
  resultados.push({ ...e, ok: r.status === 0, ms: Date.now() - inicio })
}

console.log(`\n${barra('white')}`)
console.log(styleText('bold', ' RESUMO'))
console.log(barra('white'))
for (const r of resultados)
  console.log(
    ` ${r.ok ? styleText('green', '✔ passou') : styleText('red', '✘ falhou')}  ${r.titulo.padEnd(48)} ${styleText('dim', tempo(r.ms).padStart(10))}`,
  )
const falhas = resultados.filter((r) => !r.ok)
console.log(barra('white'))
console.log(
  falhas.length
    ? styleText(
        ['bold', 'red'],
        ` ${falhas.length} de ${resultados.length} etapa(s) falharam. Role para cima até o cabeçalho delas.`,
      )
    : styleText(
        ['bold', 'green'],
        ` Tudo certo: ${resultados.length} etapa(s) em ${tempo(resultados.reduce((s, r) => s + r.ms, 0))}.`,
      ),
)
for (const r of resultados.filter((r) => r.relatorio && !r.ok))
  console.log(
    styleText('dim', ` Capturas das falhas (${r.id}): npx playwright show-report ${r.relatorio}`),
  )

// O mesmo resumo em texto puro, com onde achar o detalhe de cada falha.
const ONDE = {
  tipos: 'saída do tsc acima (arquivo:linha)',
  web: 'test-results/vitest-web.json',
  unidade: 'test-results/vitest-unidade.json',
  api: 'test-results/vitest-api.json',
  permissoes: 'test-results/vitest-permissoes.json',
  smoke: 'npx playwright show-report playwright-report/smoke e test-results/e2e-smoke/',
  jornadas: 'npx playwright show-report playwright-report/jornadas e test-results/e2e/',
  carga: 'test-results/carga.json e test-results/carga-api.log',
}
mkdirSync('test-results', { recursive: true })
writeFileSync(
  'test-results/resumo.txt',
  [
    `Rodada de ${new Date().toLocaleString('pt-BR')}`,
    '',
    ...resultados.map(
      (r) =>
        `${r.ok ? 'PASSOU' : 'FALHOU'}  ${r.titulo.padEnd(48)} ${tempo(r.ms).padStart(10)}  → ${ONDE[r.id]}`,
    ),
    '',
    falhas.length ? `${falhas.length} de ${resultados.length} etapa(s) falharam.` : 'Tudo certo.',
    '',
  ].join('\n'),
)
console.log(styleText('dim', ' Resumo salvo em test-results/resumo.txt'))
process.exit(falhas.length ? 1 : 0)
