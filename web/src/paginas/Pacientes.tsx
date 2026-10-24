import { useState } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { keepPreviousData, useMutation, useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { api, consultaEu, dataBR, errosDosCampos, mensagemDeErro, type Paciente } from '../api'
import { avisar } from '../estado'
import { pode } from '../../../shared/permissoes'
import { Dialogo } from '../componentes/Dialogo'
import { FormPaciente } from '../componentes/FormPaciente'

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

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Pacientes</h1>
          <p className="text-suave">Busque, cadastre e abra a ficha dos pacientes.</p>
        </div>
        {pode(eu.perfis, 'paciente.editar') && (
          <button className="botao" onClick={() => setNovo(true)}>
            Novo paciente
          </button>
        )}
      </header>

      {/* R-004: a busca só roda com ENTER (envio do formulário). */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const termo = String(new FormData(e.currentTarget).get('busca') ?? '')
          navegar({
            search: { busca: termo || undefined, linhas: linhas === 10 ? undefined : linhas },
          })
        }}
      >
        <input
          name="busca"
          type="search"
          defaultValue={busca}
          placeholder="Nome do paciente"
          aria-describedby="ajuda-busca"
          className="campo"
          autoFocus
        />
        <p id="ajuda-busca" className="mt-1 text-suave">
          Tecle ENTER para buscar por nome ou sobrenome.
        </p>
      </form>

      <div className="cartao overflow-x-auto p-0">
        <table className="w-full text-left">
          <thead className="border-b border-borda text-suave">
            <tr>
              {[
                'Nome',
                'Celular / WhatsApp',
                'Nascimento',
                'E-mail',
                'Como conheceu',
                'Status',
              ].map((t) => (
                <th key={t} className="px-4 py-2 font-medium">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lista.data?.itens.map((p) => (
              <tr
                key={p.id}
                className="border-b border-borda last:border-0 hover:bg-primaria-clara"
              >
                <td className="px-4 py-2">
                  <Link
                    to="/pacientes/$id"
                    params={{ id: String(p.id) }}
                    className="font-medium text-primaria"
                  >
                    {p.nome}
                  </Link>
                </td>
                <td className="px-4 py-2">
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
                <td className="px-4 py-2">{dataBR(p.nascimento)}</td>
                <td className="px-4 py-2">{p.email}</td>
                <td className="px-4 py-2">{p.comoConheceu}</td>
                <td className="px-4 py-2">
                  <Situacao ativo={p.ativo} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-suave">
          <span className="flex items-center gap-3">
            {lista.isFetching ? 'Buscando…' : `${total} ${total === 1 ? 'registro' : 'registros'}`}
            <label className="flex items-center gap-2">
              Linhas por página
              <select
                className="campo w-auto py-1"
                value={linhas}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  navegar({
                    search: { busca: busca || undefined, linhas: n === 10 ? undefined : n },
                  })
                }}
              >
                {[10, 25, 50].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
          </span>
          {paginas > 1 && (
            <span className="flex items-center gap-1">
              Página {pagina} de {paginas}
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
                  className="botao-leve px-2.5 py-1"
                  aria-label={rotulo}
                  disabled={destino < 1 || destino > paginas || destino === pagina}
                  onClick={() =>
                    navegar({
                      search: {
                        busca: busca || undefined,
                        pagina: destino > 1 ? destino : undefined,
                        linhas: linhas === 10 ? undefined : linhas,
                      },
                    })
                  }
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
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${ativo ? 'bg-sucesso/15 text-sucesso' : 'bg-suave/15 text-suave'}`}
    >
      {ativo ? 'Ativo' : 'Inativo'}
    </span>
  )
}

/** Link para abrir conversa no WhatsApp; número sem DDI ganha +55. */
export function whatsapp(celular: string) {
  const n = celular.replace(/\D/g, '')
  return `https://wa.me/${n.length <= 11 ? `55${n}` : n}`
}
