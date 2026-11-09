import { useState, type CSSProperties } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, dataBR, errosDosCampos, mensagemDeErro } from '../api'
import { avisar } from '../estado'
import { PERFIS, type Perfil } from '../../../shared/permissoes'
import { Dialogo } from '../componentes/Dialogo'
import { CampoSelect } from '../componentes/CampoSelect'
import { Icone } from '../componentes/Icones'
import { Situacao } from './Pacientes'
import { CamposProfissional } from './Profissionais'
import { CampoBusca } from '../componentes/BuscaPaciente'
import { CampoEmail } from '../componentes/CampoMascara'
import { normalizar } from '../../../shared/regras'

interface Usuario {
  id: number
  login: string
  nome: string
  email: string | null
  perfis: Perfil[]
  ativo: boolean
  criadoEm: string
  pessoa: { id: number; nome: string } | null
}
interface Profissional {
  id: number
  nome: string
  ativo: boolean
}

const DESCRICAO_PERFIL: Record<Perfil, string> = {
  ADMINISTRADOR: 'Tudo, inclusive usuários e configurações.',
  PROFISSIONAL: 'Agenda, prontuário completo e orçamentos.',
  RECEPCAO: 'Agenda, cadastro, orçamentos e recebimentos.',
  FINANCEIRO: 'Financeiro da clínica e relatórios financeiros.',
}
/** Cor de cada perfil, pela área: roxo = controle, ciano = saúde, laranja = atendimento, verde = dinheiro. */
const COR_PERFIL: Record<Perfil, string> = {
  ADMINISTRADOR: '#7c3aed',
  PROFISSIONAL: '#0891b2',
  RECEPCAO: '#ea580c',
  FINANCEIRO: '#16a34a',
}
/** Etiqueta na cor do perfil; o texto mistura com a cor do tema para ler bem no claro e no escuro. */
const estiloPerfil = (p: Perfil) => ({
  color: `color-mix(in srgb, ${COR_PERFIL[p]} 75%, var(--texto))`,
  backgroundColor: `color-mix(in srgb, ${COR_PERFIL[p]} 15%, transparent)`,
})
const SENHA_MINIMA = 8

const iniciais = (nome: string) => {
  const p = nome.trim().split(/\s+/)
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase()
}

/** Usuários e Permissões (S-012). */
export function Usuarios() {
  const lista = useQuery({
    queryKey: ['usuarios'],
    queryFn: async () => (await api.get<Usuario[]>('/usuarios')).data,
  })
  const [editando, setEditando] = useState<Usuario | 'novo' | null>(null)
  const [senhaDe, setSenhaDe] = useState<Usuario | null>(null)
  const ativos = lista.data?.filter((u) => u.ativo).length ?? 0
  const inativos = (lista.data?.length ?? 0) - ativos
  const [busca, setBusca] = useState('')
  const termo = normalizar(busca.trim())
  // Busca por nome ou perfil; ativos primeiro (o sort é estável: mantém a ordem do servidor).
  const vistos = (lista.data ?? [])
    .filter((u) =>
      [u.nome, ...u.perfis.map((p) => PERFIS[p])].some((t) => normalizar(t).includes(termo)),
    )
    .sort((a, b) => Number(b.ativo) - Number(a.ativo))

  return (
    // Em tela grande a página ocupa a janela: só a tabela rola.
    <div className="flex flex-col gap-5 lg:h-[calc(100vh-2rem)]">
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titulo">Usuários</h1>
          <p className="subtitulo">Quem entra no sistema e o que cada um pode fazer.</p>
        </div>
        <button className="botao" onClick={() => setEditando('novo')}>
          <Icone nome="mais" className="h-4 w-4" />
          Novo usuário
        </button>
      </header>

      <div className="w-full max-w-sm shrink-0">
        <CampoBusca placeholder="Pesquisar por nome ou perfil" valor={busca} aoMudar={setBusca} />
      </div>

      <div className="cartao flex min-h-0 flex-col overflow-hidden p-0">
        {lista.data && (
          <div className="shrink-0 border-b border-borda px-4 py-2.5 text-sm font-bold text-suave">
            {ativos} {ativos === 1 ? 'ativo' : 'ativos'}
            {inativos > 0 && ` · ${inativos} ${inativos === 1 ? 'inativo' : 'inativos'}`}
          </div>
        )}
        <div className="min-h-0 overflow-auto">
          <table className="w-full min-w-[46rem] text-left">
            <thead className="sticky top-0 z-10 bg-superficie">
              <tr>
                {['Nome', 'Login', 'Perfis', 'Profissional', 'Situação', ''].map((t) => (
                  <th
                    key={t}
                    className="px-4 py-2.5 text-xs font-bold tracking-wide text-suave uppercase shadow-[inset_0_-1px_0_var(--borda)]"
                  >
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={lista.isFetching ? 'opacity-60' : ''}>
              {vistos.map((u) => (
                <tr
                  key={u.id}
                  className={`border-b border-borda last:border-0 hover:bg-primaria-clara ${u.ativo ? '' : 'text-suave'}`}
                >
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-3 font-bold">
                      <span
                        aria-hidden
                        className={`grid size-8 shrink-0 place-items-center rounded-full text-xs ${u.ativo ? 'bg-primaria/15 text-primaria' : 'bg-superficie-2'}`}
                      >
                        {iniciais(u.nome)}
                      </span>
                      <span className={u.ativo ? 'text-titulo' : ''}>{u.nome}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-sm">{u.login}</td>
                  <td className="px-4 py-2.5">
                    <span className="flex flex-wrap gap-1">
                      {u.perfis.map((p) => (
                        <span
                          key={p}
                          className="etiqueta"
                          style={u.ativo ? estiloPerfil(p) : undefined}
                        >
                          {PERFIS[p]}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">{u.pessoa?.nome ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <Situacao ativo={u.ativo} />
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button className="botao-fantasma botao-pequeno" onClick={() => setEditando(u)}>
                      <Icone nome="lapis" className="h-4 w-4" />
                      Editar
                    </button>
                    <button className="botao-fantasma botao-pequeno" onClick={() => setSenhaDe(u)}>
                      <Icone nome="cadeado" className="h-4 w-4" />
                      Trocar senha
                    </button>
                  </td>
                </tr>
              ))}
              {lista.data && vistos.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-suave">
                    {busca ? `Nenhum usuário com “${busca}”.` : 'Nenhum usuário cadastrado.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="alerta-info shrink-0">
        Um usuário pode ter mais de um perfil: ele pode fazer tudo o que cada perfil permite.
        Ninguém é apagado: inative quem saiu da clínica, e o histórico continua com o nome dele.
      </p>

      <Dialogo
        aberto={!!editando}
        aoFechar={() => setEditando(null)}
        titulo={editando === 'novo' ? 'Novo usuário' : 'Editar usuário'}
      >
        {editando && (
          <FormUsuario
            usuario={editando === 'novo' ? undefined : editando}
            aoTerminar={() => setEditando(null)}
          />
        )}
      </Dialogo>
      <Dialogo
        aberto={!!senhaDe}
        aoFechar={() => setSenhaDe(null)}
        titulo={`Nova senha de ${senhaDe?.nome ?? ''}`}
      >
        {senhaDe && <NovaSenha usuario={senhaDe} aoTerminar={() => setSenhaDe(null)} />}
      </Dialogo>
    </div>
  )
}

/** Rodapé dos formulários em janela: Cancelar e o botão de enviar. */
function Rodape(props: { aoCancelar: () => void; ocupado: boolean; texto: string }) {
  return (
    <div className="flex justify-end gap-2 border-t border-borda pt-4">
      <button type="button" className="botao-leve" onClick={props.aoCancelar}>
        Cancelar
      </button>
      <button className="botao" disabled={props.ocupado}>
        {props.texto}
      </button>
    </div>
  )
}

function FormUsuario(props: { usuario?: Usuario; aoTerminar: () => void }) {
  const qc = useQueryClient()
  const u = props.usuario
  const [perfis, setPerfis] = useState<Perfil[]>(u?.perfis ?? [])
  const [pessoaId, setPessoaId] = useState(String(u?.pessoa?.id ?? ''))
  const ehProfissional = perfis.includes('PROFISSIONAL')
  // Usuário novo com perfil Profissional e nenhum profissional escolhido: cadastra um junto.
  const criaProfissional = !u && ehProfissional && !pessoaId
  const profissionais = useQuery({
    // Todos, inclusive inativos: senão o vínculo de um dentista inativo some ao salvar.
    queryKey: ['profissionais', 'todos'],
    queryFn: async () => (await api.get<Profissional[]>('/profissionais')).data,
  })
  const salvar = useMutation({
    mutationFn: async (d: Record<string, unknown>) =>
      u ? (await api.put(`/usuarios/${u.id}`, d)).data : (await api.post('/usuarios', d)).data,
    onSuccess: () => {
      avisar(u ? 'Usuário atualizado' : 'Usuário criado')
      qc.invalidateQueries({ queryKey: ['usuarios'] })
      props.aoTerminar()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const erros = errosDosCampos(salvar.error)
  const erro = (c: string) => erros[c] && <p className="erro-campo">{erros[c]}</p>
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        const f = Object.fromEntries(new FormData(e.currentTarget))
        // "emailUsuario" no form: "email" é o do profissional criado junto.
        const { cro, especialidade, celular, email, corAgenda, emailUsuario, ...resto } = f
        salvar.mutate({
          ...resto,
          email: emailUsuario,
          perfis,
          pessoaId: Number(f.pessoaId) || null,
          ativo: u ? f.ativo === 'on' : true,
          ...(criaProfissional && {
            profissional: { cro, especialidade, celular, email, corAgenda },
          }),
        })
      }}
    >
      {/* Cadastrando o profissional junto: duas colunas na janela larga, para caber sem rolar. */}
      <div
        className={
          criaProfissional ? 'dialogo-largo grid items-start gap-4 lg:grid-cols-2' : 'space-y-4'
        }
      >
        <div className="space-y-4">
          <div>
            <label className="rotulo" htmlFor="u-nome">
              Nome *
            </label>
            <input
              id="u-nome"
              name="nome"
              className="campo"
              defaultValue={u?.nome}
              required
              autoFocus
            />
            {erro('nome')}
          </div>
          <div>
            <label className="rotulo" htmlFor="u-email">
              E-mail *
            </label>
            <CampoEmail
              id="u-email"
              name="emailUsuario"
              required
              defaultValue={u?.email ?? ''}
              erro={erros.email}
            />
            <span className="ajuda">Para onde vai o código quando a pessoa esquecer a senha.</span>
          </div>
          {!u && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="rotulo" htmlFor="u-login">
                  Login *
                </label>
                <input
                  id="u-login"
                  name="login"
                  className="campo"
                  required
                  autoComplete="off"
                  placeholder="Ex.: maria.recepcao"
                />
                {erro('login')}
              </div>
              <div>
                <label className="rotulo" htmlFor="u-senha">
                  Senha inicial *
                </label>
                <input
                  id="u-senha"
                  name="senha"
                  type="password"
                  className="campo"
                  required
                  minLength={SENHA_MINIMA}
                  autoComplete="new-password"
                />
                <span className="ajuda">Pelo menos {SENHA_MINIMA} caracteres.</span>
                {erro('senha')}
              </div>
            </div>
          )}
          <fieldset>
            <legend className="rotulo">Perfis *</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(PERFIS) as Perfil[]).map((p) => (
                <label
                  key={p}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-borda p-3 hover:border-(--cor-check) has-[:checked]:border-(--cor-check) has-[:checked]:bg-[color-mix(in_srgb,var(--cor-check)_10%,transparent)]"
                  style={{ '--cor-check': COR_PERFIL[p] } as CSSProperties}
                >
                  <span
                    aria-hidden
                    className="mt-1.5 size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: COR_PERFIL[p] }}
                  />
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    // O checkbox global redefine --cor-check nele mesmo; repete aqui para valer.
                    style={
                      { '--cor-check': COR_PERFIL[p], '--sobre-check': '#fff' } as CSSProperties
                    }
                    checked={perfis.includes(p)}
                    onChange={(e) =>
                      setPerfis(e.target.checked ? [...perfis, p] : perfis.filter((x) => x !== p))
                    }
                  />
                  <span>
                    <span className="block font-bold">{PERFIS[p]}</span>
                    <span className="text-sm text-suave">{DESCRICAO_PERFIL[p]}</span>
                  </span>
                </label>
              ))}
            </div>
            {erro('perfis')}
          </fieldset>
          {(ehProfissional || u?.pessoa) && (
            <div>
              <label className="rotulo" htmlFor="u-pessoa">
                Profissional ligado (dentista)
              </label>
              <CampoSelect
                id="u-pessoa"
                name="pessoaId"
                value={pessoaId}
                onChange={(e) => setPessoaId(e.target.value)}
                vazio={u ? 'Nenhum' : 'Cadastrar novo profissional'}
                opcoes={profissionais.data?.map(
                  (p) => [p.id, p.ativo ? p.nome : `${p.nome} (inativo)`] as const,
                )}
              />
              <span className="ajuda">Assim a agenda e o prontuário já abrem com o nome dele.</span>
              {erro('pessoaId')}
            </div>
          )}
        </div>
        {criaProfissional && (
          <fieldset className="space-y-4 rounded-2xl bg-superficie-2 p-3">
            <legend className="sr-only">Dados do profissional</legend>
            <p className="text-sm text-suave">
              O profissional é cadastrado com o nome acima. A foto você coloca depois, em
              Profissionais.
            </p>
            {erro('profissional')}
            <CamposProfissional erros={erros} />
          </fieldset>
        )}
      </div>
      {u && (
        <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-superficie-2 p-3">
          <input type="checkbox" name="ativo" className="check-sucesso" defaultChecked={u.ativo} />
          <span>
            <span className="block font-bold">Ativo</span>
            <span className="text-sm text-suave">
              Pode entrar no sistema · criado em {dataBR(u.criadoEm)}
            </span>
          </span>
        </label>
      )}
      <Rodape
        aoCancelar={props.aoTerminar}
        ocupado={!perfis.length || salvar.isPending}
        texto="Salvar"
      />
    </form>
  )
}

function NovaSenha(props: { usuario: Usuario; aoTerminar: () => void }) {
  const salvar = useMutation({
    mutationFn: async (senha: string) =>
      (await api.post(`/usuarios/${props.usuario.id}/senha`, { senha })).data,
    onSuccess: () => {
      avisar('Senha alterada')
      props.aoTerminar()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        salvar.mutate(String(new FormData(e.currentTarget).get('senha')))
      }}
    >
      <div>
        <label className="rotulo" htmlFor="u-nova">
          Nova senha *
        </label>
        <input
          id="u-nova"
          name="senha"
          type="password"
          className="campo"
          required
          minLength={SENHA_MINIMA}
          autoComplete="new-password"
          autoFocus
        />
        <span className="ajuda">
          Pelo menos {SENHA_MINIMA} caracteres. Passe a senha à pessoa e peça que ela troque depois.
        </span>
      </div>
      <Rodape aoCancelar={props.aoTerminar} ocupado={salvar.isPending} texto="Salvar senha" />
    </form>
  )
}

/** "Trocar minha senha": qualquer usuário, informando a senha atual. */
export function TrocarMinhaSenha(props: { aoTerminar: () => void }) {
  const salvar = useMutation({
    mutationFn: async (d: Record<string, FormDataEntryValue>) =>
      (await api.post('/eu/senha', d)).data,
    onSuccess: () => {
      avisar('Senha alterada')
      props.aoTerminar()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const campos = [
    ['atual', 'Senha atual', 'current-password'],
    ['nova', 'Nova senha', 'new-password'],
    ['repetir', 'Repita a nova senha', 'new-password'],
  ] as const
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        const f = Object.fromEntries(new FormData(e.currentTarget))
        if (f.nova !== f.repetir)
          return avisar('A nova senha e a repetição estão diferentes.', true)
        salvar.mutate(f)
      }}
    >
      {campos.map(([nome, rotulo, auto], i) => (
        <div key={nome}>
          <label className="rotulo" htmlFor={`eu-${nome}`}>
            {rotulo} *
          </label>
          <input
            id={`eu-${nome}`}
            name={nome}
            type="password"
            className="campo"
            required
            minLength={nome === 'atual' ? undefined : SENHA_MINIMA}
            autoComplete={auto}
            autoFocus={i === 0}
          />
        </div>
      ))}
      <Rodape aoCancelar={props.aoTerminar} ocupado={salvar.isPending} texto="Trocar senha" />
    </form>
  )
}
