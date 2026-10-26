import axios from 'axios'
import { queryOptions } from '@tanstack/react-query'
import type { Perfil } from '../../shared/permissoes'
import type { MotivoInativacao } from '../../shared/regras'
import type { StatusAgenda } from '../../shared/agenda'
import type { ChaveConfig, PADROES } from '../../shared/configuracoes'

export const api = axios.create({ baseURL: '/api', withCredentials: true })

// Sessão vencida: volta para a tela de entrar.
api.interceptors.response.use(undefined, (erro) => {
  if (erro.response?.status === 401 && erro.config?.url !== '/eu' && erro.config?.url !== '/entrar')
    location.assign('/entrar')
  return Promise.reject(erro)
})

export function mensagemDeErro(erro: unknown): string {
  if (axios.isAxiosError(erro))
    return erro.response?.data?.erro ?? 'Sem conexão com o servidor. Tente de novo.'
  return 'Erro inesperado.'
}

export function errosDosCampos(erro: unknown): Record<string, string> {
  return (axios.isAxiosError(erro) && erro.response?.data?.erros) || {}
}

export interface Eu {
  id: number
  nome: string
  login: string
  perfis: Perfil[]
}

export const consultaEu = queryOptions({
  queryKey: ['eu'],
  queryFn: async () => (await api.get<Eu>('/eu')).data,
  staleTime: Infinity,
  retry: false,
})

export interface Paciente {
  id: number
  nome: string
  nascimento: string
  apelido: string | null
  cpf: string | null
  rg: string | null
  sexo: string | null
  estadoCivil: string | null
  observacoes: string | null
  email: string | null
  celular: string | null
  telefone: string | null
  comoConheceu: string | null
  indicadoPor: string | null
  nomeMae: string | null
  nomePai: string | null
  responsavelNome: string | null
  responsavelCpf: string | null
  responsavelParentesco: string | null
  ativo: boolean
  motivoInativacao: MotivoInativacao | null
  motivoInativacaoDescricao: string | null
  criadoEm: string
  excluidoEm: string | null
}

/** aaaa-mm-dd → dd/mm/aaaa */
export const dataBR = (iso: string | null) =>
  iso ? iso.slice(0, 10).split('-').reverse().join('/') : ''

export const cpfBR = (cpf: string | null) =>
  cpf ? cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : ''

export interface Agendamento {
  id: number
  tipo: 'CONSULTA' | 'COMPROMISSO'
  data: string
  inicio: string
  fim: string
  titulo: string | null
  categoria: string | null
  observacoes: string | null
  primeiraConsulta: boolean
  status: StatusAgenda
  checkinEm: string | null
  criadoEm: string
  paciente: { id: number; nome: string; celular: string | null } | null
  profissional: { id: number; nome: string }
  criadoPor: { nome: string }
}

export const consultaProfissionais = queryOptions({
  queryKey: ['agenda', 'profissionais'],
  queryFn: async () =>
    (
      await api.get<{
        profissionais: { id: number; nome: string; corAgenda: string | null }[]
        meuId: number | null
      }>('/agenda/profissionais')
    ).data,
  staleTime: 5 * 60_000,
})

/** Date local → aaaa-mm-dd (sem passar por UTC, para não trocar o dia). */
export const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Soma dias a uma data aaaa-mm-dd. */
export function somarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + dias)
  return isoLocal(d)
}

export const horaBR = (instante: string) =>
  new Date(instante).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

/** Configuração da clínica (shared/configuracoes.ts): padrão até o administrador mudar. */
export const consultaConfig = <C extends ChaveConfig>(chave: C) =>
  queryOptions({
    queryKey: ['config', chave],
    queryFn: async () => (await api.get<(typeof PADROES)[C]>(`/configuracoes/${chave}`)).data,
    staleTime: 5 * 60_000,
  })
