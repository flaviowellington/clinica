import { useState } from 'react'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { api, consultaEu, errosDosCampos, mensagemDeErro } from '../api'
import { avisar } from '../estado'
import { pode } from '../../../shared/permissoes'
import { Dialogo } from '../componentes/Dialogo'

export interface Profissional {
  id: number
  nome: string
  cro: string | null
  especialidade: string | null
  email: string | null
  celular: string | null
  corAgenda: string | null
  ativo: boolean
}

const ESPECIALIDADES = [
  'Clínica geral',
  'Dentística',
  'Endodontia',
  'Implantodontia',
  'Odontopediatria',
  'Ortodontia',
  'Periodontia',
  'Prótese',
  'Cirurgia bucomaxilofacial',
]

const iniciais = (nome: string) =>
  nome
    .replace(/^(dra?\.?)\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')

export const COR_PADRAO = '#0f766e'

/** Cadastro dos profissionais da clínica (F-024, S-013). */
export function Profissionais() {
  const { data: eu } = useSuspenseQuery(consultaEu)
  const podeEditar = pode(eu.perfis, 'profissional.editar')
  const qc = useQueryClient()
  const [busca, setBusca] = useState('')
  const [ativos, setAtivos] = useState(true)
  const [editando, setEditando] = useState<Profissional | 'novo' | null>(null)

  const lista = useQuery({
    queryKey: ['profissionais', busca, ativos],
    queryFn: async () =>
      (
        await api.get<Profissional[]>('/profissionais', {
          params: { busca: busca || undefined, ativos: ativos ? 1 : undefined },
        })
      ).data,
  })

  const atualizar = () => {
    qc.invalidateQueries({ queryKey: ['profissionais'] })
    qc.invalidateQueries({ queryKey: ['agenda', 'profissionais'] })
  }

  const salvar = useMutation({
    mutationFn: async (d: Record<string, string>) =>
      editando && editando !== 'novo'
        ? (await api.put(`/profissionais/${editando.id}`, d)).data
        : (await api.post('/profissionais', d)).data,
    onSuccess: () => {
      avisar('Profissional salvo')
      atualizar()
      setEditando(null)
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const ativar = useMutation({
    mutationFn: async (p: Profissional) =>
      (await api.post(`/profissionais/${p.id}/ativo`, { ativo: !p.ativo })).data,
    onSuccess: (p: Profissional) => {
      avisar(p.ativo ? 'Profissional ativado' : 'Profissional inativado')
      atualizar()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const erros = errosDosCampos(salvar.error)
  const atual = editando && editando !== 'novo' ? editando : null

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Profissionais</h1>
          <p className="text-suave">Dentistas da clínica, especialidades e cor na agenda.</p>
        </div>
        {podeEditar && (
          <button className="botao" onClick={() => setEditando('novo')}>
            Adicionar profissional
          </button>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-4">
        <input
          type="search"
          className="campo max-w-xs"
          placeholder="Pesquisar profissional"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={ativos} onChange={(e) => setAtivos(e.target.checked)} />
          Mostrar só os ativos
        </label>
      </div>

      {lista.data?.length === 0 && (
        <p className="cartao text-suave">Nenhum profissional encontrado.</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {lista.data?.map((p) => {
          const cor = p.corAgenda ?? COR_PADRAO
          return (
            <article
              key={p.id}
              className={`cartao space-y-3 border-t-4 ${p.ativo ? '' : 'opacity-60'}`}
              style={{ borderTopColor: cor }}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.ativo ? 'bg-sucesso/15 text-sucesso' : 'bg-suave/15 text-suave'}`}
                >
                  {p.ativo ? 'Ativo' : 'Inativo'}
                </span>
                {podeEditar && (
                  <span className="flex gap-1">
                    <button
                      className="botao-leve px-2 py-0.5 text-xs"
                      onClick={() => setEditando(p)}
                    >
                      Editar
                    </button>
                    <button
                      className="botao-leve px-2 py-0.5 text-xs"
                      disabled={ativar.isPending}
                      onClick={() => ativar.mutate(p)}
                    >
                      {p.ativo ? 'Inativar' : 'Ativar'}
                    </button>
                  </span>
                )}
              </div>
              <div className="flex flex-col items-center gap-2 text-center">
                <span
                  className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-semibold text-white"
                  style={{ backgroundColor: cor }}
                  aria-hidden
                >
                  {iniciais(p.nome)}
                </span>
                <p className="font-semibold">{p.nome}</p>
                {(p.especialidade || p.cro) && (
                  <p className="text-suave">
                    {[p.especialidade, p.cro].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              <dl className="space-y-1 border-t border-borda pt-3 text-suave">
                <div>
                  <dt className="sr-only">Celular</dt>
                  <dd>{p.celular ?? 'Sem celular'}</dd>
                </div>
                <div>
                  <dt className="sr-only">E-mail</dt>
                  <dd className="truncate">{p.email ?? 'Sem e-mail'}</dd>
                </div>
              </dl>
            </article>
          )
        })}
      </div>

      <Dialogo
        aberto={!!editando}
        aoFechar={() => setEditando(null)}
        titulo={atual ? 'Editar profissional' : 'Novo profissional'}
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            salvar.mutate(
              Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>,
            )
          }}
        >
          <div>
            <label className="rotulo" htmlFor="p-nome">
              Nome *
            </label>
            <input id="p-nome" name="nome" className="campo" defaultValue={atual?.nome} autoFocus />
            {erros.nome && <p className="mt-1 text-perigo">{erros.nome}</p>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="rotulo" htmlFor="p-cro">
                CRO
              </label>
              <input
                id="p-cro"
                name="cro"
                className="campo"
                placeholder="CRO-UF 00000"
                defaultValue={atual?.cro ?? ''}
              />
            </div>
            <div>
              <label className="rotulo" htmlFor="p-esp">
                Especialidade
              </label>
              <input
                id="p-esp"
                name="especialidade"
                list="especialidades"
                className="campo"
                defaultValue={atual?.especialidade ?? ''}
              />
              <datalist id="especialidades">
                {ESPECIALIDADES.map((e) => (
                  <option key={e} value={e} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="rotulo" htmlFor="p-cel">
                Celular
              </label>
              <input
                id="p-cel"
                name="celular"
                className="campo"
                defaultValue={atual?.celular ?? ''}
              />
            </div>
            <div>
              <label className="rotulo" htmlFor="p-email">
                E-mail
              </label>
              <input
                id="p-email"
                name="email"
                type="email"
                className="campo"
                defaultValue={atual?.email ?? ''}
              />
              {erros.email && <p className="mt-1 text-perigo">{erros.email}</p>}
            </div>
          </div>
          <div>
            <label className="rotulo" htmlFor="p-cor">
              Cor na agenda
            </label>
            <input
              id="p-cor"
              name="corAgenda"
              type="color"
              className="h-9 w-16 cursor-pointer rounded border border-borda"
              defaultValue={atual?.corAgenda ?? COR_PADRAO}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="botao-leve" onClick={() => setEditando(null)}>
              Cancelar
            </button>
            <button className="botao" disabled={salvar.isPending}>
              Salvar
            </button>
          </div>
        </form>
      </Dialogo>
    </div>
  )
}
