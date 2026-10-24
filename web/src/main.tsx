import { StrictMode, useEffect } from 'react'
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
import './index.css'
import { api, consultaEu } from './api'
import { useAvisos, useTema } from './estado'
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
import { ABAS } from './abas'
import { Icone } from './componentes/Icones'

const queryClient = new QueryClient({
  // Sem recarregar ao voltar para a janela: cada leitura da ficha grava um acesso.
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
})

function Raiz() {
  const tema = useTema((s) => s.tema)
  const avisos = useAvisos((s) => s.avisos)
  useEffect(() => {
    document.documentElement.dataset.tema = tema
  }, [tema])
  return (
    <>
      <Outlet />
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

function Layout() {
  const { data: eu } = useSuspenseQuery(consultaEu)
  const { alternar, tema } = useTema()
  const qc = useQueryClient()
  async function sair() {
    await api.post('/sair')
    qc.clear()
    location.assign('/entrar')
  }
  const item =
    'flex items-center gap-3 rounded-md px-3 py-2 text-suave hover:bg-primaria-clara hover:text-texto [&.active]:bg-primaria-clara [&.active]:font-medium [&.active]:text-primaria'
  // No celular a barra mostra só os ícones; o nome continua lido por leitores de tela.
  const nome = 'sr-only lg:not-sr-only'
  return (
    <div className="flex min-h-screen">
      <div className="sticky top-0 flex h-screen w-16 shrink-0 flex-col border-r border-borda bg-superficie p-2 lg:w-56 lg:p-3 print:hidden">
        <Link to="/" className="mb-4 flex items-center gap-2 px-3 py-2 font-semibold text-primaria">
          <span
            className="grid size-7 shrink-0 place-items-center rounded-md bg-primaria text-white dark:text-black"
            aria-hidden
          >
            C
          </span>
          <span className={nome}>Clínica</span>
        </Link>
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
          <button className={`${item} w-full`} onClick={sair} title="Sair">
            <Icone nome="sair" />
            <span className={nome}>Sair</span>
          </button>
        </div>
      </div>
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

const ficha = createRoute({
  getParentRoute: () => logado,
  path: '/pacientes/$id',
  component: Ficha,
})
const lixeira = createRoute({ getParentRoute: () => logado, path: '/lixeira', component: Lixeira })

const agenda = createRoute({ getParentRoute: () => logado, path: '/agenda', component: Agenda })

/** ?aba=… guarda a aba aberta na URL (B-008: cada tela tem seu endereço). */
const comAba = (s: Record<string, unknown>): { aba?: string } => ({
  aba: typeof s.aba === 'string' && s.aba ? s.aba : undefined,
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
const contas = createRoute({
  getParentRoute: () => logado,
  path: '/contas',
  validateSearch: comAba,
  component: Contas,
})

const router = createRouter({
  routeTree: raiz.addChildren([
    entrar,
    logado.addChildren([
      inicio,
      agenda,
      pacientes,
      ficha,
      lixeira,
      financeiro,
      profissionais,
      relatorios,
      contas,
      recibo,
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
