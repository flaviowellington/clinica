import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, dataBR, errosDosCampos, mensagemDeErro } from '../api'
import { avisar } from '../estado'
import { PERFIS, type Perfil } from '../../../shared/permissoes'
import { Dialogo } from '../componentes/Dialogo'
import { CampoSelect } from '../componentes/CampoSelect'

interface Usuario {
  id: number
  login: string
  nome: string
  perfis: Perfil[]
  ativo: boolean
  criadoEm: string
  pessoa: { id: number; nome: string } | null
}
interface Profissional {
  id: number
  nome: string
}

const DESCRICAO_PERFIL: Record<Perfil, string> = {
  ADMINISTRADOR: 'Tudo, inclusive usuários e configurações.',
  PROFISSIONAL: 'Agenda, prontuário completo e orçamentos.',
  RECEPCAO: 'Agenda, cadastro, orçamentos e recebimentos.',
  FINANCEIRO: 'Financeiro da clínica e relatórios financeiros.',
}
const SENHA_MINIMA = 8

/** Usuários e Permissões (S-012). */
export function Usuarios() {
  const lista = useQuery({
    queryKey: ['usuarios'],
    queryFn: async () => (await api.get<Usuario[]>('/usuarios')).data,
  })
  const [editando, setEditando] = useState<Usuario | 'novo' | null>(null)
  const [senhaDe, setSenhaDe] = useState<Usuario | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Usuários</h1>
          <p className="text-suave">Quem entra no sistema e o que cada um pode fazer.</p>
        </div>
        <button className="botao" onClick={() => setEditando('novo')}>
          Novo usuário
        </button>
      </div>

      <div className="cartao overflow-x-auto p-0">
        <table className="w-full text-left">
          <thead className="border-b border-borda text-suave">
            <tr>
              {['Nome', 'Login', 'Perfis', 'Profissional', 'Situação', ''].map((t) => (
                <th key={t} className="px-4 py-2 font-medium">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lista.data?.map((u) => (
              <tr
                key={u.id}
                className={`border-b border-borda last:border-0 ${u.ativo ? '' : 'text-suave'}`}
              >
                <td className="px-4 py-2 font-medium">{u.nome}</td>
                <td className="px-4 py-2">{u.login}</td>
                <td className="px-4 py-2">{u.perfis.map((p) => PERFIS[p]).join(', ')}</td>
                <td className="px-4 py-2">{u.pessoa?.nome ?? '—'}</td>
                <td className="px-4 py-2">{u.ativo ? 'Ativo' : 'Inativo'}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <button className="text-primaria hover:underline" onClick={() => setEditando(u)}>
                    Editar
                  </button>
                  <button
                    className="ml-3 text-primaria hover:underline"
                    onClick={() => setSenhaDe(u)}
                  >
                    Trocar senha
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-suave">
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

function FormUsuario(props: { usuario?: Usuario; aoTerminar: () => void }) {
  const qc = useQueryClient()
  const u = props.usuario
  const [perfis, setPerfis] = useState<Perfil[]>(u?.perfis ?? [])
  const profissionais = useQuery({
    queryKey: ['profissionais', 'ativos'],
    queryFn: async () =>
      (await api.get<Profissional[]>('/profissionais', { params: { ativos: 1 } })).data,
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
  const erro = (c: string) => erros[c] && <p className="mt-1 text-perigo">{erros[c]}</p>
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        const f = Object.fromEntries(new FormData(e.currentTarget))
        salvar.mutate({
          ...f,
          perfis,
          pessoaId: Number(f.pessoaId) || null,
          ativo: u ? f.ativo === 'on' : true,
        })
      }}
    >
      <label className="block">
        <span className="rotulo">Nome *</span>
        <input name="nome" className="campo" defaultValue={u?.nome} required autoFocus />
        {erro('nome')}
      </label>
      {!u && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="rotulo">Login *</span>
            <input
              name="login"
              className="campo"
              required
              autoComplete="off"
              placeholder="ex.: maria.recepcao"
            />
            {erro('login')}
          </label>
          <label>
            <span className="rotulo">Senha inicial *</span>
            <input
              name="senha"
              type="password"
              className="campo"
              required
              minLength={SENHA_MINIMA}
              autoComplete="new-password"
            />
            {erro('senha')}
          </label>
        </div>
      )}
      <fieldset className="space-y-2">
        <legend className="rotulo">Perfis *</legend>
        {(Object.keys(PERFIS) as Perfil[]).map((p) => (
          <label key={p} className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={perfis.includes(p)}
              onChange={(e) =>
                setPerfis(e.target.checked ? [...perfis, p] : perfis.filter((x) => x !== p))
              }
            />
            <span>
              {PERFIS[p]} <span className="text-suave">— {DESCRICAO_PERFIL[p]}</span>
            </span>
          </label>
        ))}
        {erro('perfis')}
      </fieldset>
      <label className="block">
        <span className="rotulo">Profissional ligado (dentista)</span>
        <CampoSelect
          name="pessoaId"
          defaultValue={u?.pessoa?.id ?? ''}
          vazio="Nenhum"
          opcoes={profissionais.data?.map((p) => [p.id, p.nome] as const)}
        />
        <span className="text-xs text-suave">
          Assim a agenda e o prontuário já abrem com o nome dele.
        </span>
        {erro('pessoaId')}
      </label>
      {u && (
        <label className="flex items-center gap-2">
          <input type="checkbox" name="ativo" defaultChecked={u.ativo} />
          Ativo (pode entrar no sistema) · criado em {dataBR(u.criadoEm)}
        </label>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className="botao-leve" onClick={props.aoTerminar}>
          Cancelar
        </button>
        <button className="botao" disabled={!perfis.length || salvar.isPending}>
          Salvar
        </button>
      </div>
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
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        salvar.mutate(String(new FormData(e.currentTarget).get('senha')))
      }}
    >
      <label className="block">
        <span className="rotulo">Nova senha</span>
        <input
          name="senha"
          type="password"
          className="campo"
          required
          minLength={SENHA_MINIMA}
          autoComplete="new-password"
          autoFocus
        />
        <span className="text-xs text-suave">
          Pelo menos {SENHA_MINIMA} caracteres. Passe a senha à pessoa e peça que ela troque depois.
        </span>
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" className="botao-leve" onClick={props.aoTerminar}>
          Cancelar
        </button>
        <button className="botao" disabled={salvar.isPending}>
          Salvar senha
        </button>
      </div>
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
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        const f = Object.fromEntries(new FormData(e.currentTarget))
        if (f.nova !== f.repetir)
          return avisar('A nova senha e a repetição estão diferentes.', true)
        salvar.mutate(f)
      }}
    >
      <label className="block">
        <span className="rotulo">Senha atual</span>
        <input
          name="atual"
          type="password"
          className="campo"
          required
          autoComplete="current-password"
          autoFocus
        />
      </label>
      <label className="block">
        <span className="rotulo">Nova senha</span>
        <input
          name="nova"
          type="password"
          className="campo"
          required
          minLength={SENHA_MINIMA}
          autoComplete="new-password"
        />
      </label>
      <label className="block">
        <span className="rotulo">Repita a nova senha</span>
        <input
          name="repetir"
          type="password"
          className="campo"
          required
          minLength={SENHA_MINIMA}
          autoComplete="new-password"
        />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" className="botao-leve" onClick={props.aoTerminar}>
          Cancelar
        </button>
        <button className="botao" disabled={salvar.isPending}>
          Trocar senha
        </button>
      </div>
    </form>
  )
}
