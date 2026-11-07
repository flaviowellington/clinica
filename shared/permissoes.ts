// Quem pode fazer o quê. Base: data-model/permissions.md; ajustada à clínica (matriz combinada com o responsável).
// Um usuário pode ter vários perfis: a permissão final é a soma deles.

export const PERFIS = {
  ADMINISTRADOR: 'Administrador',
  PROFISSIONAL: 'Profissional',
  RECEPCAO: 'Recepção',
  FINANCEIRO: 'Financeiro',
} as const
export type Perfil = keyof typeof PERFIS

const TODOS: Perfil[] = ['ADMINISTRADOR', 'PROFISSIONAL', 'RECEPCAO', 'FINANCEIRO']
const ADM: Perfil[] = ['ADMINISTRADOR']
const CLINICO: Perfil[] = ['ADMINISTRADOR', 'PROFISSIONAL']
const GESTAO: Perfil[] = ['ADMINISTRADOR', 'FINANCEIRO']

const MATRIZ = {
  'paciente.ver': TODOS,
  'paciente.editar': TODOS,
  'paciente.inativar': TODOS,
  'paciente.excluir': ADM,
  'lixeira.restaurar': ADM,
  'agenda.ver': TODOS,
  'agenda.editar': TODOS,
  // Confirmações: o profissional só vê as consultas dele.
  'confirmacoes.todas': ['ADMINISTRADOR', 'RECEPCAO', 'FINANCEIRO'],
  'orcamento.ver': TODOS,
  'orcamento.editar': TODOS,
  'orcamento.aprovar': TODOS,
  'orcamento.cancelar': GESTAO,
  'procedimento.executar': CLINICO,
  // Prontuário clínico (anamnese, plano, odontograma, arquivos): só quem atende.
  'prontuario.ver': CLINICO,
  'prontuario.editar': CLINICO,
  'anamnese.ver': CLINICO,
  'fotos.ver': CLINICO,
  'profissional.ver': TODOS,
  'profissional.editar': ADM,
  // Financeiro da clínica: só Adm e Financeiro; os outros veem só os orçamentos abertos (orcamento.ver).
  'financeiro.ver': GESTAO,
  'financeiro.editar': GESTAO,
  'financeiro.paciente': TODOS,
  // Receber no balcão: o profissional não recebe (vê os orçamentos abertos, sem aprovar com pagamento).
  'financeiro.receber': ['ADMINISTRADOR', 'FINANCEIRO', 'RECEPCAO'],
  // Protético: todos mexem no andamento; criar, excluir e mudar paciente, laboratório,
  // trabalho, dentes e cor é de quem atende.
  'protetico.ver': TODOS,
  'protetico.editar': TODOS,
  'protetico.criar': CLINICO,
  'painel.ver': ADM,
  'usuario.gerenciar': ADM,
  'configuracao.editar': ADM,
  'dados.importar': ADM,
  'relatorio.agenda': GESTAO,
  'relatorio.pacientes': GESTAO,
  'relatorio.financeiro': GESTAO,
  'relatorio.geral': GESTAO,
  'relatorio.tratamentos': GESTAO,
} satisfies Record<string, Perfil[]>

export type Acao = keyof typeof MATRIZ

export function pode(perfis: readonly Perfil[], acao: Acao): boolean {
  return perfis.some((p) => (MATRIZ[acao] as Perfil[]).includes(p))
}
