import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { keepPreviousData, useMutation, useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { api, consultaEu, dataBR, errosDosCampos, mensagemDeErro, type Paciente } from '../api'
import { avisar } from '../estado'
import { pode } from '../../../shared/permissoes'
import { Dialogo } from '../componentes/Dialogo'
import { FormPaciente } from '../componentes/FormPaciente'
import { Icone } from '../componentes/Icones'
import { CampoSelect } from '../componentes/CampoSelect'

interface Resultado {
  total: number
  porPagina: number
  itens: Paciente[]
}

export function Pacientes() {
  const { busca = '', pagina = 1, linhas = 10 } = useSearch({ from: '/logado/pacientes' })
  const navegar = useNavigate({ from: '/pacientes' })
  const { data: eu } = useSuspenseQuery(consultaEu)
  const [novo, setNovo] = useState(false)

  const lista = useQuery({
    queryKey: ['pacientes', busca, pagina, linhas],
    queryFn: async () =>
      (await api.get<Resultado>('/pacientes', { params: { busca, pagina, porPagina: linhas } }))
        .data,
    placeholderData: keepPreviousData,
  })

  const criar = useMutation({
    mutationFn: async (dados: Record<string, string>) =>
      (await api.post<Paciente>('/pacientes', dados)).data,
    onSuccess: (p) => {
      avisar('Paciente cadastrado com sucesso')
      navegar({ to: '/pacientes/$id', params: { id: String(p.id) } })
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })

  const total = lista.data?.total ?? 0
  const paginas = Math.ceil(total / (lista.data?.porPagina ?? 10))
  const ir = (s: { busca?: string; pagina?: number; linhas?: number }, replace = false) =>
    navegar({
      replace,
      search: {
        busca: (s.busca ?? busca) || undefined,
        pagina: s.pagina && s.pagina > 1 ? s.pagina : undefined,
        linhas: (s.linhas ?? linhas) === 10 ? undefined : (s.linhas ?? linhas),
      },
    })

  // Busca em tempo real: espera a pessoa parar de digitar um instante e atualiza a lista.
  const [termo, setTermo] = useState(busca)
  const [buscaAnterior, setBuscaAnterior] = useState(busca)
  if (busca !== buscaAnterior) {
    setBuscaAnterior(busca)
    if (busca !== termo.trim()) setTermo(busca)
  }
  useEffect(() => {
    if (termo.trim() === busca) return
    const t = setTimeout(() => ir({ busca: termo.trim() }, true), 300)
    return () => clearTimeout(t)
  })

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titulo">Pacientes</h1>
          <p className="subtitulo">Busque, cadastre e abra a ficha dos pacientes.</p>
        </div>
        {pode(eu.perfis, 'paciente.editar') && (
          <button className="botao" onClick={() => setNovo(true)}>
            <span aria-hidden className="text-lg leading-none">
              +
            </span>{' '}
            Novo paciente
          </button>
        )}
      </header>

      <label className="relative block max-w-xl">
        <span className="sr-only">Buscar paciente</span>
        <Icone
          nome="busca"
          className="pointer-events-none absolute top-5 left-3 h-5 w-5 -translate-y-1/2 text-suave"
        />
        <input
          type="search"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Nome do paciente"
          aria-describedby="ajuda-busca"
          className="campo pl-10"
          autoFocus
        />
        <span id="ajuda-busca" className="ajuda">
          A lista atualiza enquanto você digita o nome ou sobrenome.
        </span>
      </label>

      <div className="cartao overflow-x-auto p-0">
        <table className="w-full min-w-[46rem] text-left">
          <thead>
            <tr>
              {[
                'Nome',
                'Celular / WhatsApp',
                'Nascimento',
                'E-mail',
                'Como conheceu',
                'Status',
              ].map((t) => (
                <th
                  key={t}
                  className="border-b border-borda px-4 py-2.5 text-xs font-bold tracking-wide text-suave uppercase"
                >
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={lista.isFetching ? 'opacity-60' : ''}>
            {lista.data?.itens.map((p) => (
              <tr
                key={p.id}
                className="border-b border-borda last:border-0 hover:bg-primaria-clara"
              >
                <td className="px-4 py-2.5">
                  <Link
                    to="/pacientes/$id"
                    params={{ id: String(p.id) }}
                    className="flex items-center gap-3 font-bold text-primaria hover:underline"
                  >
                    <span
                      aria-hidden
                      className="grid size-8 shrink-0 place-items-center rounded-full bg-primaria/15 text-xs"
                    >
                      {iniciais(p.nome)}
                    </span>
                    {p.nome}
                  </Link>
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  {p.celular && (
                    <a
                      href={whatsapp(p.celular)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-primaria hover:underline"
                      title="Abrir conversa no WhatsApp"
                    >
                      {p.celular}
                    </a>
                  )}
                </td>
                <td className="px-4 py-2.5 tabular-nums">{dataBR(p.nascimento)}</td>
                <td className="px-4 py-2.5">{p.email}</td>
                <td className="px-4 py-2.5">{p.comoConheceu}</td>
                <td className="px-4 py-2.5">
                  <Situacao ativo={p.ativo} />
                </td>
              </tr>
            ))}
            {lista.data?.itens.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-suave">
                  Nenhum paciente encontrado{busca && <> para “{busca}”</>}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-borda px-4 py-2.5 text-sm text-suave">
          <span className="flex items-center gap-4">
            <span className="font-bold">
              {lista.isFetching
                ? 'Buscando…'
                : `${total} ${total === 1 ? 'registro' : 'registros'}`}
            </span>
            <label className="flex items-center gap-2">
              Linhas por página
              <CampoSelect
                className="w-auto py-1"
                value={linhas}
                onChange={(e) => ir({ linhas: Number(e.target.value) })}
                vazio={false}
                opcoes={[10, 25, 50]}
              />
            </label>
          </span>
          {paginas > 1 && (
            <span className="flex items-center gap-1">
              <span className="mr-2">
                Página {pagina} de {paginas}
              </span>
              {(
                [
                  ['«', 1, 'Primeira página'],
                  ['‹', pagina - 1, 'Página anterior'],
                  ['›', pagina + 1, 'Próxima página'],
                  ['»', paginas, 'Última página'],
                ] as const
              ).map(([simbolo, destino, rotulo]) => (
                <button
                  key={rotulo}
                  className="botao-leve botao-pequeno"
                  aria-label={rotulo}
                  disabled={destino < 1 || destino > paginas || destino === pagina}
                  onClick={() => ir({ pagina: destino })}
                >
                  {simbolo}
                </button>
              ))}
            </span>
          )}
        </div>
      </div>

      <Dialogo aberto={novo} aoFechar={() => setNovo(false)} titulo="Novo paciente">
        <FormPaciente
          textoBotao="Cadastrar paciente"
          enviando={criar.isPending}
          erros={errosDosCampos(criar.error)}
          aoEnviar={(d) => criar.mutate(d)}
        />
      </Dialogo>
    </div>
  )
}

export function Situacao({ ativo }: { ativo: boolean }) {
  return (
    <span className={`etiqueta ${ativo ? 'etiqueta-sucesso' : ''}`}>
      {ativo ? 'Ativo' : 'Inativo'}
    </span>
  )
}

/** Link para abrir conversa no WhatsApp; número sem DDI ganha +55. */
export function whatsapp(celular: string) {
  const n = celular.replace(/\D/g, '')
  return `https://wa.me/${n.length <= 11 ? `55${n}` : n}`
}

function iniciais(nome: string) {
  const p = nome.trim().split(/\s+/)
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase()
}
