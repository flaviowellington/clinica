import { StrictMode, useEffect, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Link,
  Outlet,
  redirect,
  RouterProvider,
} from '@tanstack/react-router'
import '@fontsource/m-plus-rounded-1c/latin-400.css'
import '@fontsource/m-plus-rounded-1c/latin-500.css'
import '@fontsource/m-plus-rounded-1c/latin-700.css'
import '@fontsource/m-plus-rounded-1c/latin-800.css'
import './index.css'
import { api, consultaEu } from './api'
import { PALETAS, useAvisos, useTema, type Paleta } from './estado'
import { pode } from '../../shared/permissoes'
import { Entrar } from './paginas/Entrar'
import { Pacientes } from './paginas/Pacientes'
import { Ficha } from './paginas/Ficha'
import { Lixeira } from './paginas/Lixeira'
import { Agenda } from './paginas/Agenda'
import { Inicio } from './paginas/Inicio'
import { Profissionais } from './paginas/Profissionais'
import { Financeiro } from './paginas/Financeiro'
import { Relatorios } from './paginas/Relatorios'
import { Contas } from './paginas/Contas'
import { Recibo } from './paginas/Recibo'
import { DocumentoImpresso } from './paginas/DocumentoImpresso'
import { TrocarMinhaSenha, Usuarios } from './paginas/Usuarios'
import { Configuracoes } from './paginas/Configuracoes'
import { CaixaTela } from './paginas/Caixa'
import { Protetico } from './paginas/Protetico'
import { Confirmacoes } from './paginas/Confirmacoes'
import { ConfirmarPresenca } from './paginas/ConfirmarPresenca'
import { Painel } from './paginas/Painel'
import { Importacao } from './paginas/Importacao'
import { Estilos } from './paginas/Estilos'
import { Dialogo } from './componentes/Dialogo'
import { ABAS } from './abas'
import { Icone } from './componentes/Icones'

const queryClient = new QueryClient({
  // Sem recarregar ao voltar para a janela: cada leitura da ficha grava um acesso.
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
})

function Raiz() {
  const { tema, paleta } = useTema()
  const avisos = useAvisos((s) => s.avisos)
  useEffect(() => {
    document.documentElement.dataset.tema = tema
    document.documentElement.dataset.paleta = paleta
  }, [tema, paleta])
  return (
    <>
      <Outlet />
      <SeletorPaleta />
      <div aria-live="polite" className="fixed right-4 bottom-4 space-y-2">
        {avisos.map((a) => (
          <div
            key={a.id}
            className={`cartao shadow-lg ${a.erro ? 'border-perigo text-perigo' : ''}`}
          >
            {a.texto}
          </div>
        ))}
      </div>
    </>
  )
}

// TEMPORÁRIO: para escolher a paleta da marca. Apagar quando a clínica decidir
// (deixar só a paleta escolhida no index.css).
function SeletorPaleta() {
  const { tema, paleta, alternar, escolherPaleta } = useTema()
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center overflow-x-auto gap-1 rounded-full border border-borda bg-superficie p-1 shadow-lg print:hidden">
      {(Object.keys(PALETAS) as Paleta[]).map((p) => (
        <button
          key={p}
          onClick={() => escolherPaleta(p)}
          aria-pressed={p === paleta}
          className={`rounded-full px-3 py-1 text-xs font-bold whitespace-nowrap ${p === paleta ? 'bg-primaria text-sobre-primaria' : 'text-suave hover:bg-primaria-clara'}`}
        >
          {PALETAS[p]}
        </button>
      ))}
      <button
        onClick={alternar}
        className="rounded-full px-3 py-1 text-xs font-bold whitespace-nowrap text-suave hover:bg-primaria-clara"
        title="Alternar claro/escuro"
      >
        {tema === 'claro' ? '☾ Escuro' : '☀ Claro'}
      </button>
    </div>
  )
}

/** O que recarregar quando o servidor avisa que um assunto mudou (server/src/tempoReal.ts). */
const RECARREGAR: Record<string, string[][]> = {
  agenda: [['agenda'], ['confirmacoes'], ['agendamentos-paciente']],
  retornos: [['retornos']],
}

/** Tempo real: ouve os avisos do servidor e recarrega o que outra máquina mudou. */
function useTempoReal() {
  const qc = useQueryClient()
  useEffect(() => {
    const recarregar = (assunto: string) =>
      RECARREGAR[assunto]?.forEach((queryKey) => qc.invalidateQueries({ queryKey }))
    const fonte = new EventSource('/api/eventos') // reconecta sozinho se a rede cair
    let caiu = false
    fonte.onerror = () => (caiu = true)
    fonte.onopen = () => {
      // Voltou depois de cair: pode ter perdido avisos, então recarrega tudo.
      if (caiu) Object.keys(RECARREGAR).forEach(recarregar)
      caiu = false
    }
    fonte.onmessage = (e) => recarregar(JSON.parse(e.data).assunto)
    return () => fonte.close()
  }, [qc])
}

function Layout() {
  const { data: eu } = useSuspenseQuery(consultaEu)
  const { alternar, tema, menuRecolhido, alternarMenu } = useTema()
  const qc = useQueryClient()
  useTempoReal()
  const [trocarSenha, setTrocarSenha] = useState(false)
  async function sair() {
    await api.post('/sair')
    qc.clear()
    location.assign('/entrar')
  }
  const item =
    'flex items-center gap-3 rounded-md px-3 py-2 text-suave hover:bg-primaria-clara hover:text-texto [&.active]:bg-primaria-clara [&.active]:font-medium [&.active]:text-primaria'
  // No celular a barra mostra só os ícones; o nome continua lido por leitores de tela.
  // Recolhida: só ícones em qualquer tela.
  const nome = menuRecolhido ? 'sr-only' : 'sr-only lg:not-sr-only'
  return (
    <div className="flex min-h-screen">
      <div
        className={`sticky top-0 flex h-screen w-16 shrink-0 flex-col border-r border-borda bg-superficie p-2 print:hidden ${menuRecolhido ? '' : 'lg:w-56 lg:p-3'}`}
      >
        {/* Recolhida, a barra só tem 4rem: logo e botão ficam um embaixo do outro. */}
        <div
          className={`mb-4 flex items-center ${menuRecolhido ? 'flex-col gap-1' : 'justify-between'}`}
        >
          <Link to="/" className="flex items-center gap-2 px-3 py-2 font-semibold text-primaria">
            <span
              className="grid size-7 shrink-0 place-items-center rounded-md bg-primaria text-sobre-primaria"
              aria-hidden
            >
              C
            </span>
            <span className={nome}>Clínica</span>
          </Link>
          <button
            className="hidden size-8 shrink-0 place-items-center rounded-lg text-suave hover:bg-primaria-clara hover:text-texto lg:grid"
            onClick={alternarMenu}
            title={menuRecolhido ? 'Expandir menu' : 'Recolher menu'}
            aria-label={menuRecolhido ? 'Expandir menu' : 'Recolher menu'}
            aria-expanded={!menuRecolhido}
          >
            <Icone nome={menuRecolhido ? 'expandir' : 'recolher'} />
          </button>
        </div>
        <nav aria-label="Menu principal" className="flex flex-1 flex-col gap-1 overflow-y-auto">
          <Link to="/" className={item} activeOptions={{ exact: true }} title="Início">
            <Icone nome="inicio" />
            <span className={nome}>Início</span>
          </Link>
          {ABAS.filter((a) => a.visivel(eu.perfis)).map((a) => (
            <Link key={a.para} to={a.para} className={item} title={a.rotulo}>
              <Icone nome={a.icone} />
              <span className={nome}>{a.rotulo}</span>
            </Link>
          ))}
          {pode(eu.perfis, 'lixeira.restaurar') && (
            <Link to="/lixeira" className={item} title="Lixeira">
              <Icone nome="lixeira" />
              <span className={nome}>Lixeira</span>
            </Link>
          )}
        </nav>
        <div className="space-y-1 border-t border-borda pt-3">
          <p className={`${nome} truncate px-3 pb-1 text-suave`} title={eu.nome}>
            {eu.nome}
          </p>
          <button className={`${item} w-full`} onClick={alternar} title="Alternar tema">
            <Icone nome={tema === 'claro' ? 'escuro' : 'claro'} />
            <span className={nome}>{tema === 'claro' ? 'Tema escuro' : 'Tema claro'}</span>
          </button>
          <button
            className={`${item} w-full`}
            onClick={() => setTrocarSenha(true)}
            title="Trocar minha senha"
          >
            <Icone nome="usuarios" />
            <span className={nome}>Trocar senha</span>
          </button>
          <button className={`${item} w-full`} onClick={sair} title="Sair">
            <Icone nome="sair" />
            <span className={nome}>Sair</span>
          </button>
        </div>
      </div>
      <Dialogo
        aberto={trocarSenha}
        aoFechar={() => setTrocarSenha(false)}
        titulo="Trocar minha senha"
      >
        <TrocarMinhaSenha aoTerminar={() => setTrocarSenha(false)} />
      </Dialogo>
      <main className="min-w-0 flex-1 p-4">
        <div className="mx-auto max-w-screen-2xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

const raiz = createRootRouteWithContext<{ queryClient: QueryClient }>()({ component: Raiz })

const entrar = createRoute({ getParentRoute: () => raiz, path: '/entrar', component: Entrar })

// Tudo abaixo de "logado" exige login.
const logado = createRoute({
  getParentRoute: () => raiz,
  id: 'logado',
  beforeLoad: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData(consultaEu)
    } catch {
      throw redirect({ to: '/entrar' })
    }
  },
  component: Layout,
})

const inicio = createRoute({
  getParentRoute: () => logado,
  path: '/',
  component: Inicio,
})

const pacientes = createRoute({
  getParentRoute: () => logado,
  path: '/pacientes',
  validateSearch: (
    s: Record<string, unknown>,
  ): { busca?: string; pagina?: number; linhas?: number } => ({
    busca: typeof s.busca === 'string' && s.busca ? s.busca : undefined,
    pagina: Number(s.pagina) > 1 ? Number(s.pagina) : undefined,
    linhas: [25, 50].includes(Number(s.linhas)) ? Number(s.linhas) : undefined,
  }),
  component: Pacientes,
})

/** ?aba=… guarda a aba aberta na URL (B-008: cada tela tem seu endereço). */
const comAba = (s: Record<string, unknown>): { aba?: string } => ({
  aba: typeof s.aba === 'string' && s.aba ? s.aba : undefined,
})

const ficha = createRoute({
  getParentRoute: () => logado,
  path: '/pacientes/$id',
  validateSearch: comAba,
  component: Ficha,
})
const documento = createRoute({
  getParentRoute: () => logado,
  path: '/documento/$id',
  component: DocumentoImpresso,
})
const lixeira = createRoute({ getParentRoute: () => logado, path: '/lixeira', component: Lixeira })

const agenda = createRoute({ getParentRoute: () => logado, path: '/agenda', component: Agenda })
const agenda2 = createRoute({
  getParentRoute: () => logado,
  path: '/agenda-2',
  component: () => <Agenda filtrosNoTopo />,
})

const financeiro = createRoute({
  getParentRoute: () => logado,
  path: '/financeiro',
  validateSearch: comAba,
  component: Financeiro,
})
const profissionais = createRoute({
  getParentRoute: () => logado,
  path: '/profissionais',
  component: Profissionais,
})
const relatorios = createRoute({
  getParentRoute: () => logado,
  path: '/relatorios',
  validateSearch: (s: Record<string, unknown>): { id?: string } => ({
    id: typeof s.id === 'string' && s.id ? s.id : undefined,
  }),
  component: Relatorios,
})
const recibo = createRoute({
  getParentRoute: () => logado,
  path: '/recibo/$id',
  component: Recibo,
})
const pagina = <P extends string>(path: P, component: () => ReactNode) =>
  createRoute({ getParentRoute: () => logado, path, component })
const usuarios = pagina('/usuarios', Usuarios)
const configuracoes = createRoute({
  getParentRoute: () => logado,
  path: '/configuracoes',
  validateSearch: comAba,
  component: Configuracoes,
})
const caixa = pagina('/caixa', CaixaTela)
const protetico = pagina('/protetico', Protetico)
const confirmacoes = pagina('/confirmacoes', Confirmacoes)
const painel = pagina('/painel', Painel)
const importacao = pagina('/importacao', Importacao)
// TEMPORÁRIO e público (sem dados de paciente): vitrine para escolher a paleta.
const estilos = createRoute({
  getParentRoute: () => raiz,
  path: '/estilos',
  component: () => (
    <main className="mx-auto max-w-5xl p-4">
      <Estilos />
    </main>
  ),
})
// Pública: o paciente abre pelo link do e-mail, sem login.
const confirmar = createRoute({
  getParentRoute: () => raiz,
  path: '/confirmar/$token',
  component: ConfirmarPresenca,
})

const contas = createRoute({
  getParentRoute: () => logado,
  path: '/contas',
  validateSearch: comAba,
  component: Contas,
})

const router = createRouter({
  routeTree: raiz.addChildren([
    entrar,
    confirmar,
    estilos,
    logado.addChildren([
      inicio,
      agenda,
      agenda2,
      pacientes,
      ficha,
      lixeira,
      financeiro,
      profissionais,
      relatorios,
      contas,
      recibo,
      documento,
      usuarios,
      configuracoes,
      caixa,
      protetico,
      confirmacoes,
      painel,
      importacao,
    ]),
  ]),
  context: { queryClient },
  defaultNotFoundComponent: () => <p className="p-4">Página não encontrada.</p>,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
