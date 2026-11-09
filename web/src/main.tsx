import {
  StrictMode,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { createRoot } from 'react-dom/client'
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
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
  useNavigate,
} from '@tanstack/react-router'
import '@fontsource/nunito/latin-400.css'
import '@fontsource/nunito/latin-500.css'
import '@fontsource/nunito/latin-600.css'
import '@fontsource/nunito/latin-700.css'
import '@fontsource/nunito/latin-800.css'
import './index.css'
import { api, consultaConfig, consultaEu } from './api'
import logoRiso from './assets/logo_riso.png'
import { Confirmacao } from './componentes/Confirmar'
import { avisar, useAvisos, useTema } from './estado'
import { PERFIS, pode } from '../../shared/permissoes'
import { Entrar, LOGO } from './paginas/Entrar'
import { Pacientes } from './paginas/Pacientes'
import { Ficha } from './paginas/Ficha'
import { Lixeira } from './paginas/Lixeira'
import { Agenda } from './paginas/Agenda'
import { Inicio } from './paginas/Inicio'
import { Profissionais } from './paginas/Profissionais'
import { ProfissionalPagina } from './paginas/Profissional'
import { ABAS as ABAS_FINANCEIRO, Financeiro } from './paginas/Financeiro'
import { Relatorios } from './paginas/Relatorios'
import { DocumentoImpresso } from './paginas/DocumentoImpresso'
import { Usuarios } from './paginas/Usuarios'
import { ABAS as ABAS_CONFIGURACOES, Configuracoes } from './paginas/Configuracoes'
import { Protetico } from './paginas/Protetico'
import { Confirmacoes } from './paginas/Confirmacoes'
import { ENVIOS, Mensagens, type EnvioMensagem } from './paginas/Mensagens'
import { ConfirmarPresenca } from './paginas/ConfirmarPresenca'
import { AutorizarPlano } from './paginas/AutorizarPlano'
import { Painel } from './paginas/Painel'
import { Estilos } from './paginas/Estilos'
import { Dialogo } from './componentes/Dialogo'
import { ABAS } from './abas'
import { GRUPOS } from '../../shared/relatorios'
import { Icone, type NomeIcone } from './componentes/Icones'

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
      <Confirmacao />
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

/** O que recarregar quando o servidor avisa que um assunto mudou (server/src/tempoReal.ts). */
const RECARREGAR: Record<string, string[][]> = {
  agenda: [['agenda'], ['confirmacoes'], ['agendamentos-paciente']],
  retornos: [['retornos']],
  autorizacoes: [['autorizacoes'], ['procedimentos'], ['fichas']],
  assinatura: [['autorizacoes'], ['procedimentos'], ['fichas']],
  // Pode sobrar chave: só o que está aberto na tela busca de novo, o resto só fica "velho".
  pacientes: [
    ['pacientes'],
    ['paciente'],
    ['alertas'],
    ['resumo'],
    ['anamneses'],
    ['odontograma'],
    ['procedimentos'],
    ['fichas'],
    ['documentos'],
    ['arquivos'],
    ['indicacoes'],
    ['autorizacoes'],
    ['orcamentos'],
    ['lixeira'],
  ],
  procedimentos: [
    ['procedimentos'],
    ['fichas'],
    ['orcamentos'],
    ['resumo'],
    ['procedimentos-tabela'],
    ['procedimentos-tabela-completa'],
  ],
  financeiro: [
    ['abertos'],
    ['analise'],
    ['lancamentos'],
    ['orcamentos'],
    ['procedimentos'],
    ['fichas'],
    ['resumo'],
    ['painel'],
    ['grafico-codigo'],
  ],
  protetico: [['protetico']],
  config: [['config'], ['email-estado']],
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
    fonte.onmessage = (e) => {
      const { assunto } = JSON.parse(e.data)
      recarregar(assunto)
      if (assunto === 'assinatura') avisar('Um paciente acabou de assinar o plano de tratamento')
    }
    return () => fonte.close()
  }, [qc])
}

/** Seções do menu lateral; a Lixeira entra em "Sistema", que fica no pé da barra. */
const SECOES: { titulo: string; paginas: string[] }[] = [
  {
    titulo: 'Atendimento',
    paginas: ['/agenda', '/confirmacoes', '/protetico', '/mensagens', '/pacientes'],
  },
  { titulo: 'Gestão', paginas: ['/financeiro', '/painel', '/profissionais', '/relatorios'] },
  { titulo: 'Sistema', paginas: ['/usuarios', '/configuracoes'] },
]
/** Abas fixas da barra de baixo no celular; o resto fica em "Mais". */
const ABAS_CELULAR = ['/agenda', '/pacientes', '/financeiro']

/** Tela de computador (lg): só nela a barra pode ficar aberta. */
const telaLarga = matchMedia('(min-width: 1024px)')
function useTelaLarga() {
  return useSyncExternalStore(
    (avisar) => (
      telaLarga.addEventListener('change', avisar),
      () => telaLarga.removeEventListener('change', avisar)
    ),
    () => telaLarga.matches,
  )
}

/** Um resultado da busca de módulos: uma página ou algo dentro dela. */
type Achado = {
  para: string
  rotulo: string
  icone: NomeIcone
  /** Página onde fica (só para abas e relatórios). */
  onde?: string
  texto?: string
  search?: Record<string, string>
}
const semAcento = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

function Layout() {
  const { data: eu } = useSuspenseQuery(consultaEu)
  const { alternar, tema, menuRecolhido, alternarMenu } = useTema()
  const qc = useQueryClient()
  const navegar = useNavigate()
  useTempoReal()
  const [mais, setMais] = useState(false)
  const busca = useRef<HTMLInputElement>(null)
  // Entre md e lg a barra fica sempre recolhida; abaixo de md vira a barra de baixo.
  const aberta = useTelaLarga() && !menuRecolhido

  // Ctrl K (ou a lupa da barra recolhida): abre a barra, se preciso, e põe o foco na busca.
  const [focarBusca, setFocarBusca] = useState(false)
  function abrirBusca() {
    if (useTema.getState().menuRecolhido) useTema.getState().alternarMenu()
    setFocarBusca(true)
  }
  useEffect(() => {
    if (focarBusca && busca.current) {
      busca.current.focus()
      setFocarBusca(false)
    }
  }, [focarBusca, aberta])
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== 'k' || !(e.ctrlKey || e.metaKey) || !telaLarga.matches) return
      e.preventDefault()
      abrirBusca()
    }
    addEventListener('keydown', tecla)
    return () => removeEventListener('keydown', tecla)
  }, [])

  async function sair() {
    await api.post('/sair')
    qc.clear()
    location.assign('/entrar')
  }
  const visiveis = ABAS.filter((a) => a.visivel(eu.perfis))
  const lixeira = pode(eu.perfis, 'lixeira.restaurar')
  const secoes = SECOES.map((s) => ({
    ...s,
    abas: s.paginas.flatMap((p) => visiveis.filter((a) => a.para === p)),
  })).filter((s) => s.abas.length || (s.titulo === 'Sistema' && lixeira))
  const iniciais = eu.nome
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  const perfil = eu.perfis.map((p) => PERFIS[p]).join(', ')

  // Busca de módulos: as páginas e o que fica dentro delas (abas e relatórios).
  const [termo, setTermo] = useState('')
  const paginaDe = (para: string) => visiveis.find((a) => a.para === para)
  const abasDe = (para: string, abas: readonly { id: string; rotulo: string }[]): Achado[] => {
    const pg = paginaDe(para)
    return pg
      ? abas.map((x) => ({
          para,
          rotulo: x.rotulo,
          icone: pg.icone,
          onde: pg.rotulo,
          search: { aba: x.id },
        }))
      : []
  }
  const relatorios = paginaDe('/relatorios')
  const indice: Achado[] = [
    { para: '/', rotulo: 'Início', icone: 'inicio' },
    ...visiveis.map((a) => ({
      para: a.para,
      rotulo: a.rotulo,
      icone: a.icone,
      texto: a.descricao,
    })),
    ...(lixeira ? [{ para: '/lixeira', rotulo: 'Lixeira', icone: 'lixeira' as NomeIcone }] : []),
    ...abasDe('/configuracoes', ABAS_CONFIGURACOES),
    ...abasDe(
      '/financeiro',
      ABAS_FINANCEIRO.filter((a) => pode(eu.perfis, a.acao)),
    ),
    ...(relatorios
      ? GRUPOS.filter((g) => pode(eu.perfis, g.permissao)).flatMap((g) =>
          g.itens.map((i) => ({
            para: '/relatorios',
            rotulo: `${g.titulo}: ${i.titulo}`,
            icone: relatorios.icone,
            onde: relatorios.rotulo,
            search: { id: i.id },
          })),
        )
      : []),
  ]
  const procura = semAcento(termo.trim())
  // O que bate pelo nome vem antes do que bate só pela descrição da página.
  const peloNome = (a: Achado) => semAcento(a.rotulo).includes(procura)
  const achados = procura
    ? indice
        .filter((a) => peloNome(a) || semAcento(a.texto ?? '').includes(procura))
        .sort((a, b) => Number(peloNome(b)) - Number(peloNome(a)))
    : []
  // Páginas a destacar no menu: a própria página ou a que guarda a aba achada.
  const destaque = new Set(achados.map((a) => a.para))
  function ir(a: Achado) {
    navegar({ to: a.para, search: () => a.search ?? {} })
    setTermo('')
    busca.current?.blur()
  }
  // Leva o primeiro item destacado para a vista, se o menu estiver rolado.
  useEffect(() => {
    document.querySelector('[data-achou]')?.scrollIntoView({ block: 'nearest' })
  }, [procura])

  // Aberta: linha com ícone e nome. Recolhida: só o ícone, com o nome num balão ao passar o mouse.
  const item = aberta
    ? 'flex h-9 shrink-0 items-center gap-3 rounded-lg px-2.5 font-semibold text-suave hover:bg-superficie-2 hover:text-texto [&.active]:bg-superficie-2 [&.active]:font-extrabold [&.active]:text-texto [&.active_svg]:text-primaria'
    : 'group relative grid size-9 shrink-0 place-items-center rounded-lg text-suave hover:bg-superficie-2 hover:text-texto [&.active]:bg-primaria-clara [&.active]:text-primaria'
  const balao =
    'pointer-events-none absolute top-1/2 left-full z-20 ml-3 -translate-y-1/2 rounded-md bg-texto px-2.5 py-1.5 text-[13px] font-bold whitespace-nowrap text-superficie opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100'
  const linha = <hr className={`border-borda ${aberta ? 'my-1' : 'mx-auto my-2 w-6'}`} />
  const icone = 'size-[18px] shrink-0'
  function pagina(p: { para: string; rotulo: string; icone: NomeIcone; exato?: boolean }) {
    return (
      <Link
        key={p.para}
        to={p.para}
        className={`${item} ${procura ? (destaque.has(p.para) ? 'bg-primaria-clara! text-primaria! ring-2 ring-primaria/40' : 'opacity-40') : ''}`}
        data-achou={procura && destaque.has(p.para) ? '' : undefined}
        activeOptions={{ exact: p.exato }}
        aria-label={aberta ? undefined : p.rotulo}
      >
        <Icone nome={p.icone} className={icone} />
        {aberta ? (
          <span className="truncate">{p.rotulo}</span>
        ) : (
          <span className={balao}>{p.rotulo}</span>
        )}
      </Link>
    )
  }
  function secao(s: (typeof secoes)[number]) {
    return (
      <div key={s.titulo} className={`flex flex-col gap-0.5 ${aberta ? '' : 'items-center'}`}>
        {aberta ? (
          <p className="px-2.5 pt-3.5 pb-1 text-[11px] font-extrabold tracking-wider text-suave uppercase">
            {s.titulo}
          </p>
        ) : (
          linha
        )}
        {s.abas.map(pagina)}
        {s.titulo === 'Sistema' &&
          lixeira &&
          pagina({ para: '/lixeira', rotulo: 'Lixeira', icone: 'lixeira' })}
      </div>
    )
  }
  const nomeClinica = useQuery(consultaConfig('clinica')).data?.nome
  const sistema = secoes.find((s) => s.titulo === 'Sistema')
  const acaoConta = `group relative grid size-8 place-items-center rounded-lg text-suave hover:text-texto ${aberta ? 'hover:bg-borda/60' : 'hover:bg-superficie-2'}`
  // Barra aberta: o balão sobe, porque ao lado ele sairia por baixo do conteúdo da página.
  const balaoAcima = balao.replace(
    'top-1/2 left-full z-20 ml-3 -translate-y-1/2',
    'bottom-full left-1/2 z-20 mb-2 -translate-x-1/2',
  )
  const rotuloTema = tema === 'claro' ? 'Tema escuro' : 'Tema claro'
  const abasCelular = visiveis.filter((a) => ABAS_CELULAR.includes(a.para))
  const abaCelular =
    'flex flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl py-1.5 text-[11px] font-extrabold text-suave [&.active]:text-primaria [&.active>span]:bg-primaria-clara'

  return (
    <div className="flex min-h-screen">
      {/* Computador e tablet: barra num cartão solto da borda. */}
      <aside className="sticky top-0 hidden h-screen shrink-0 py-3 pl-3 md:block print:hidden">
        <div
          className={`relative flex h-full flex-col rounded-2xl bg-superficie shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_-12px_rgb(0_0_0/0.14)] ${aberta ? 'w-64' : 'w-15.5 items-center'}`}
        >
          <div className={`flex flex-col gap-4 pt-4.5 ${aberta ? 'px-4' : 'items-center'}`}>
            <div className="flex items-center justify-between">
              <Link
                to="/"
                className="flex min-w-0 items-center gap-2.5"
                aria-label={`${nomeClinica || 'Clínica'} — início`}
              >
                <img src={logoRiso} alt="" className={`size-8.5 shrink-0 object-contain ${LOGO}`} />
                {aberta && nomeClinica && (
                  <span className="truncate font-extrabold text-texto">{nomeClinica}</span>
                )}
              </Link>
              {/* O mesmo botão abre e fecha; recolhida, ele sai para fora da barra, na altura do logo. */}
              <button
                className={`hidden size-6 place-items-center rounded-md lg:grid ${aberta ? 'bg-superficie-2 text-suave hover:text-texto' : 'absolute top-6 left-full ml-2.5 bg-primaria text-sobre-primaria shadow-md hover:brightness-110'}`}
                onClick={alternarMenu}
                title={aberta ? 'Recolher menu' : 'Expandir menu'}
                aria-label={aberta ? 'Recolher menu' : 'Expandir menu'}
                aria-expanded={aberta}
              >
                <Icone nome={aberta ? 'esquerda' : 'direita'} className="size-3.5" />
              </button>
            </div>
            {aberta ? (
              <div>
                <form
                  role="search"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (achados[0]) ir(achados[0])
                  }}
                  className="flex h-9.5 items-center gap-2 rounded-lg bg-superficie-2 px-3 text-suave focus-within:ring-2 focus-within:ring-primaria/40"
                >
                  <Icone nome="busca" className="size-4 shrink-0" />
                  <input
                    ref={busca}
                    value={termo}
                    onChange={(e) => setTermo(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Escape') return
                      setTermo('')
                      e.currentTarget.blur()
                    }}
                    placeholder="Buscar módulo"
                    aria-label="Buscar módulo"
                    className="min-w-0 flex-1 border-0 bg-transparent p-0 font-semibold text-texto outline-none placeholder:text-suave"
                  />
                  {termo && (
                    <button
                      type="button"
                      className="grid size-5 place-items-center rounded text-suave hover:text-texto"
                      onClick={() => setTermo('')}
                      aria-label="Limpar busca"
                    >
                      <Icone nome="fechar" className="size-3.5" />
                    </button>
                  )}
                </form>
                {/* Abas e relatórios achados; as páginas já aparecem destacadas no menu. */}
                {procura && (
                  <ul
                    className="mt-2 flex max-h-56 flex-col gap-0.5 overflow-y-auto"
                    aria-label="Resultados da busca"
                  >
                    {achados
                      .filter((a) => a.onde)
                      .slice(0, 8)
                      .map((a) => (
                        <li key={a.para + a.rotulo}>
                          <button
                            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left hover:bg-superficie-2"
                            onClick={() => ir(a)}
                          >
                            <Icone nome={a.icone} className="size-4 shrink-0 text-primaria" />
                            <span className="min-w-0 leading-tight">
                              <span className="block truncate font-bold text-texto">
                                {a.rotulo}
                              </span>
                              <span className="block text-xs text-suave">em {a.onde}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    {!achados.length && (
                      <li className="px-2.5 py-1.5 text-suave">Nenhum módulo encontrado.</li>
                    )}
                  </ul>
                )}
              </div>
            ) : (
              <button
                className="group relative grid size-9.5 place-items-center rounded-lg bg-superficie-2 text-suave hover:text-texto"
                onClick={abrirBusca}
                aria-label="Buscar módulo"
              >
                <Icone nome="busca" className="size-4" />
                <span className={balao}>Buscar módulo</span>
              </button>
            )}
            {linha}
          </div>
          <nav
            aria-label="Menu principal"
            className={`flex min-h-0 flex-1 flex-col ${aberta ? 'overflow-y-auto px-4 pb-3' : 'items-center pb-3'}`}
          >
            <div className={`flex flex-col gap-0.5 ${aberta ? '' : 'items-center'}`}>
              {pagina({ para: '/', rotulo: 'Início', icone: 'inicio', exato: true })}
            </div>
            {secoes.filter((s) => s !== sistema).map(secao)}
            {sistema && (
              <div className="mt-auto pt-3">
                {aberta && linha}
                {secao(sistema)}
              </div>
            )}
          </nav>
          {/* Rodapé: quem está conectado, com tema e sair sempre à vista. */}
          <div
            className={`flex items-center ${aberta ? 'w-full gap-3 rounded-b-2xl bg-superficie-2 py-3.5 pr-2.5 pl-4' : 'mb-3.5 flex-col-reverse gap-1.5'}`}
          >
            <span
              className="relative grid size-9 shrink-0 place-items-center rounded-full bg-secundaria-clara text-xs font-extrabold text-texto"
              title={aberta ? undefined : eu.nome}
            >
              {iniciais}
              <span className="absolute -right-px -bottom-px size-2.5 rounded-full border-2 border-superficie bg-sucesso" />
            </span>
            {aberta && (
              <span className="min-w-0 flex-1 leading-tight" title={eu.nome}>
                <span className="block truncate font-extrabold text-titulo">{eu.nome}</span>
                <span className="block truncate text-xs font-semibold text-suave">{perfil}</span>
              </span>
            )}
            <div className={`flex gap-0.5 ${aberta ? '' : 'flex-col'}`}>
              <button className={acaoConta} onClick={alternar} aria-label={rotuloTema}>
                <Icone nome={tema === 'claro' ? 'escuro' : 'claro'} className={icone} />
                <span className={aberta ? balaoAcima : balao}>{rotuloTema}</span>
              </button>
              <button
                className={`${acaoConta} hover:bg-perigo/10! hover:text-perigo!`}
                onClick={sair}
                aria-label="Sair"
              >
                <Icone nome="sair" className={icone} />
                <span className={aberta ? balaoAcima : balao}>Sair</span>
              </button>
            </div>
          </div>
        </div>
      </aside>
      {/* Celular: barra de abas embaixo; "Mais" abre as outras páginas. */}
      <nav
        aria-label="Menu principal"
        className="fixed inset-x-2 bottom-3 z-30 flex h-18 items-center rounded-3xl bg-superficie px-1.5 shadow-[0_10px_30px_-10px_rgb(0_0_0/0.3)] md:hidden print:hidden"
      >
        {[{ para: '/', rotulo: 'Início', icone: 'inicio' as NomeIcone }, ...abasCelular].map(
          (a) => (
            <Link
              key={a.para}
              to={a.para}
              className={abaCelular}
              activeOptions={{ exact: a.para === '/' }}
            >
              <span className="grid h-7.5 w-13 place-items-center rounded-full">
                <Icone nome={a.icone} className="size-5" />
              </span>
              {a.rotulo}
            </Link>
          ),
        )}
        <button
          className={`${abaCelular} ${mais ? 'text-primaria' : ''}`}
          onClick={() => setMais(true)}
        >
          <span
            className={`grid h-7.5 w-13 place-items-center rounded-full ${mais ? 'bg-primaria-clara' : ''}`}
          >
            <Icone nome="painel" className="size-5" />
          </span>
          Mais
        </button>
      </nav>
      <Dialogo aberto={mais} aoFechar={() => setMais(false)} titulo="Todas as páginas">
        <div className="grid grid-cols-3 gap-2">
          {[
            ...visiveis.filter((a) => !ABAS_CELULAR.includes(a.para)),
            ...(lixeira
              ? [{ para: '/lixeira', rotulo: 'Lixeira', icone: 'lixeira' as NomeIcone }]
              : []),
          ].map((a) => (
            <Link
              key={a.para}
              to={a.para}
              onClick={() => setMais(false)}
              className="flex min-h-21 flex-col justify-between gap-2.5 rounded-2xl bg-superficie-2 p-3 text-[13px] font-extrabold text-texto [&.active]:bg-primaria-clara [&.active]:text-primaria"
            >
              <span className="grid size-8.5 place-items-center rounded-[11px] bg-superficie text-primaria">
                <Icone nome={a.icone} className="size-4.5" />
              </span>
              {a.rotulo}
            </Link>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <button className="botao-secundario flex-1" onClick={alternar}>
            {tema === 'claro' ? 'Tema escuro' : 'Tema claro'}
          </button>
          <button className="botao-secundario flex-1 text-perigo" onClick={sair}>
            Sair
          </button>
        </div>
      </Dialogo>
      <main className="min-w-0 flex-1 p-4 pb-28 md:pb-4">
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
  ): { busca?: string; pagina?: number; linhas?: number; ordem?: 'az' | 'za' } => ({
    busca: typeof s.busca === 'string' && s.busca ? s.busca : undefined,
    ordem: s.ordem === 'az' || s.ordem === 'za' ? s.ordem : undefined,
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

const agenda = createRoute({
  getParentRoute: () => logado,
  path: '/agenda',
  component: () => <Agenda filtrosNoTopo />,
})
// A agenda antiga (filtros na lateral): fora do menu, só pelo endereço.
const agenda2 = createRoute({ getParentRoute: () => logado, path: '/agenda-2', component: Agenda })

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
const profissional = createRoute({
  getParentRoute: () => logado,
  path: '/profissionais/$id',
  component: ProfissionalPagina,
})
const relatorios = createRoute({
  getParentRoute: () => logado,
  path: '/relatorios',
  validateSearch: (s: Record<string, unknown>): { id?: string } => ({
    id: typeof s.id === 'string' && s.id ? s.id : undefined,
  }),
  component: Relatorios,
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
const protetico = pagina('/protetico', Protetico)
const confirmacoes = pagina('/confirmacoes', Confirmacoes)
const mensagens = createRoute({
  getParentRoute: () => logado,
  path: '/mensagens',
  // envio + pedido: vem da ficha com o pedido de assinatura (ou o PDF assinado) já escolhido.
  validateSearch: (
    s: Record<string, unknown>,
  ): { paciente?: number; envio?: EnvioMensagem; pedido?: number } => ({
    paciente: Number(s.paciente) > 0 ? Number(s.paciente) : undefined,
    envio: ENVIOS.find((e) => e === s.envio),
    pedido: Number(s.pedido) > 0 ? Number(s.pedido) : undefined,
  }),
  component: Mensagens,
})
const painel = pagina('/painel', Painel)
// Pública (sem dados de paciente): guia de estilo dos componentes.
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
// Pública: o paciente lê e assina o plano de tratamento pelo celular.
const autorizar = createRoute({
  getParentRoute: () => raiz,
  path: '/autorizar/$token',
  component: AutorizarPlano,
})

const router = createRouter({
  routeTree: raiz.addChildren([
    entrar,
    confirmar,
    autorizar,
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
      profissional,
      relatorios,
      documento,
      usuarios,
      configuracoes,
      protetico,
      confirmacoes,
      mensagens,
      painel,
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

// Sem sugestões do navegador nos campos; quem define autoComplete (login, senha) mantém o seu.
document.addEventListener('focusin', (e) => {
  const el = e.target
  if (
    (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) &&
    !el.hasAttribute('autocomplete')
  )
    el.setAttribute('autocomplete', 'off')
})

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
