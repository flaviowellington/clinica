import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  api,
  consultaProfissionais,
  errosDosCampos,
  isoLocal,
  mensagemDeErro,
  somarDias,
  type Paciente,
} from '../api'
import { avisar } from '../estado'
import { BuscaPaciente } from './BuscaPaciente'
import { CampoData } from './CampoData'

export interface Retorno {
  id: number
  data: string
  motivo: string | null
  paciente: { id: number; nome: string; celular: string | null }
  profissional: { id: number; nome: string }
}

export const consultaRetornos = {
  queryKey: ['retornos'],
  queryFn: async () => (await api.get<Retorno[]>('/retornos')).data,
}

/** Lista da lateral da agenda: próximos retornos (nome e dd/mm), com "Feito". */
export function ListaRetornos({ podeEditar }: { podeEditar: boolean }) {
  const qc = useQueryClient()
  const lista = useQuery(consultaRetornos)
  const concluir = useMutation({
    mutationFn: async (id: number) => (await api.post(`/retornos/${id}/concluir`)).data,
    onSuccess: () => {
      avisar('Retorno marcado como feito')
      qc.invalidateQueries({ queryKey: ['retornos'] })
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  return (
    <div className="cartao space-y-2">
      <p className="font-medium">Alertas de retorno</p>
      {lista.data?.length === 0 && (
        <p className="text-suave">Nenhum retorno nos próximos 60 dias.</p>
      )}
      <ul className="space-y-1">
        {lista.data?.map((r) => (
          <li key={r.id} className="flex items-center gap-2" title={r.motivo ?? undefined}>
            <Link
              to="/pacientes/$id"
              params={{ id: String(r.paciente.id) }}
              className="min-w-0 flex-1 truncate hover:text-primaria"
            >
              {r.paciente.nome}
            </Link>
            <span className="text-suave">
              {r.data.slice(8)}/{r.data.slice(5, 7)}
            </span>
            {podeEditar && (
              <button
                className="text-xs text-primaria hover:underline"
                disabled={concluir.isPending}
                onClick={() => concluir.mutate(r.id)}
                aria-label={`Marcar o retorno de ${r.paciente.nome} como feito`}
              >
                Feito
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Conteúdo do diálogo "Alerta de retorno". O profissional começa como o usuário logado (B-013). */
export function NovoRetorno(props: { paciente?: Paciente; aoTerminar: () => void }) {
  const qc = useQueryClient()
  const { data: prof } = useQuery(consultaProfissionais)
  const [paciente, setPaciente] = useState<Paciente | null>(props.paciente ?? null)
  const [profissionalId, setProfissionalId] = useState<number | ''>(prof?.meuId ?? '')
  const criar = useMutation({
    mutationFn: async (d: Record<string, unknown>) => (await api.post('/retornos', d)).data,
    onSuccess: () => {
      avisar('Alerta de retorno criado')
      qc.invalidateQueries({ queryKey: ['retornos'] })
      props.aoTerminar()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const erros = errosDosCampos(criar.error)
  const erro = (c: string) => erros[c] && <p className="mt-1 text-perigo">{erros[c]}</p>
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        const f = Object.fromEntries(new FormData(e.currentTarget))
        criar.mutate({ ...f, pacienteId: paciente?.id, profissionalId })
      }}
    >
      <div>
        <span className="rotulo">Paciente</span>
        <BuscaPaciente valor={paciente} aoEscolher={setPaciente} autoFocus />
        {erro('pacienteId')}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="rotulo">Retornar em</span>
          <CampoData name="data" defaultValue={somarDias(isoLocal(new Date()), 180)} required />
          {erro('data')}
        </label>
        <label>
          <span className="rotulo">Profissional</span>
          <select
            className="campo"
            value={profissionalId}
            onChange={(e) => setProfissionalId(Number(e.target.value) || '')}
          >
            <option value="">Escolha…</option>
            {prof?.profissionais.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
          {erro('profissionalId')}
        </label>
      </div>
      <label className="block">
        <span className="rotulo">Motivo</span>
        <input name="motivo" className="campo" placeholder="Ex.: revisão semestral" />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" className="botao-leve" onClick={props.aoTerminar}>
          Cancelar
        </button>
        <button className="botao" disabled={criar.isPending}>
          Criar alerta
        </button>
      </div>
    </form>
  )
}
