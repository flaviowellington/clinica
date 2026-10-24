// Quem pode fazer o quê (data-model/permissions.md, "Matriz para o clone").
// Um usuário pode ter vários perfis: a permissão final é a soma deles.

export const PERFIS = {
  ADMINISTRADOR: 'Administrador',
  PROFISSIONAL: 'Profissional',
  RECEPCAO: 'Recepção',
  FINANCEIRO: 'Financeiro',
} as const
export type Perfil = keyof typeof PERFIS

const TODOS: Perfil[] = ['ADMINISTRADOR', 'PROFISSIONAL', 'RECEPCAO', 'FINANCEIRO']

const MATRIZ = {
  'paciente.ver': TODOS,
  'paciente.editar': ['ADMINISTRADOR', 'PROFISSIONAL', 'RECEPCAO'],
  'paciente.inativar': ['ADMINISTRADOR', 'PROFISSIONAL'],
  'paciente.excluir': ['ADMINISTRADOR', 'PROFISSIONAL'],
  'lixeira.restaurar': ['ADMINISTRADOR'],
  // Financeiro só visualiza a agenda (permissions.md).
  'agenda.ver': TODOS,
  'agenda.editar': ['ADMINISTRADOR', 'PROFISSIONAL', 'RECEPCAO'],
  // Orçamento (permissions.md): Recepção cria; aprovar é de todos; cancelar aprovado só Adm e Financeiro.
  'orcamento.ver': TODOS,
  'orcamento.editar': ['ADMINISTRADOR', 'PROFISSIONAL', 'RECEPCAO'],
  'orcamento.aprovar': TODOS,
  'orcamento.cancelar': ['ADMINISTRADOR', 'FINANCEIRO'],
  'procedimento.executar': ['ADMINISTRADOR', 'PROFISSIONAL'],
  'profissional.ver': TODOS,
  'profissional.editar': ['ADMINISTRADOR'],
  'financeiro.ver': ['ADMINISTRADOR', 'FINANCEIRO'],
  'financeiro.editar': ['ADMINISTRADOR', 'FINANCEIRO'],
  'conta.gerenciar': ['ADMINISTRADOR', 'FINANCEIRO'],
  // Relatórios por grupo (permissions.md: cada perfil vê os da sua área).
  'relatorio.agenda': ['ADMINISTRADOR', 'RECEPCAO'],
  'relatorio.pacientes': ['ADMINISTRADOR', 'RECEPCAO'],
  'relatorio.financeiro': ['ADMINISTRADOR', 'FINANCEIRO'],
  'relatorio.geral': ['ADMINISTRADOR'],
  'relatorio.tratamentos': ['ADMINISTRADOR', 'PROFISSIONAL'],
} satisfies Record<string, Perfil[]>

export type Acao = keyof typeof MATRIZ

export function pode(perfis: readonly Perfil[], acao: Acao): boolean {
  return perfis.some((p) => (MATRIZ[acao] as Perfil[]).includes(p))
}
