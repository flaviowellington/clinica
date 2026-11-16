// Quem pode fazer o quê. Base: data-model/permissions.md; ajustada à clínica (matriz combinada com o responsável).
// Um usuário pode ter vários perfis: a permissão final é a soma deles.
// A matriz abaixo é o padrão; o administrador muda em Configurações → Permissões (config "permissoes").

export const PERFIS = {
  ADMINISTRADOR: 'Administrador',
  PROFISSIONAL: 'Profissional',
  RECEPCAO: 'Recepção',
  FINANCEIRO: 'Financeiro',
} as const
export type Perfil = keyof typeof PERFIS

/** Cor de cada perfil, pela área: roxo = controle, ciano = saúde, laranja = atendimento, verde = dinheiro. */
export const COR_PERFIL: Record<Perfil, string> = {
  ADMINISTRADOR: '#7c3aed',
  PROFISSIONAL: '#0891b2',
  RECEPCAO: '#ea580c',
  FINANCEIRO: '#16a34a',
}

const TODOS: Perfil[] = ['ADMINISTRADOR', 'PROFISSIONAL', 'RECEPCAO', 'FINANCEIRO']
const ADM: Perfil[] = ['ADMINISTRADOR']
const CLINICO: Perfil[] = ['ADMINISTRADOR', 'PROFISSIONAL']
const GESTAO: Perfil[] = ['ADMINISTRADOR', 'FINANCEIRO']

const PADRAO = {
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
  // Conferir as aprovações (Financeiro → Aprovações): quem aprovou e confirmar.
  'orcamento.confirmar': ADM,
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
  'relatorio.ver': GESTAO,
  'usuario.gerenciar': ADM,
  'configuracao.editar': ADM,
  'dados.importar': ADM,
  'relatorio.agenda': GESTAO,
  'relatorio.pacientes': GESTAO,
  'relatorio.financeiro': GESTAO,
  'relatorio.geral': GESTAO,
  'relatorio.tratamentos': GESTAO,
} satisfies Record<string, Perfil[]>

export type Acao = keyof typeof PADRAO
export type Matriz = Record<Acao, Perfil[]>
export const MATRIZ_PADRAO: Matriz = PADRAO
export const ACOES = Object.keys(PADRAO) as Acao[]

/**
 * Módulos da tela de permissões. Sem o "ver" do módulo, nenhuma ação de dentro dele vale,
 * mesmo marcada (pode() confere as duas).
 */
export const MODULOS: { nome: string; ver: Acao; itens: { acao: Acao; rotulo: string }[] }[] = [
  {
    nome: 'Agenda',
    ver: 'agenda.ver',
    itens: [
      { acao: 'agenda.editar', rotulo: 'Marcar e remarcar consultas; Confirmações e Mensagens' },
      { acao: 'confirmacoes.todas', rotulo: 'Ver confirmações de todos os profissionais' },
    ],
  },
  {
    nome: 'Pacientes',
    ver: 'paciente.ver',
    itens: [
      { acao: 'paciente.editar', rotulo: 'Cadastrar e editar pacientes' },
      { acao: 'paciente.inativar', rotulo: 'Inativar e reativar pacientes' },
      { acao: 'paciente.excluir', rotulo: 'Excluir pacientes' },
      { acao: 'prontuario.ver', rotulo: 'Ver prontuário (plano, odontograma, documentos, exames)' },
      { acao: 'prontuario.editar', rotulo: 'Editar prontuário' },
      { acao: 'anamnese.ver', rotulo: 'Ver anamnese' },
      { acao: 'fotos.ver', rotulo: 'Ver fotos' },
      { acao: 'procedimento.executar', rotulo: 'Executar procedimentos' },
      { acao: 'financeiro.paciente', rotulo: 'Financeiro do paciente' },
    ],
  },
  {
    nome: 'Financeiro e orçamentos',
    ver: 'orcamento.ver',
    itens: [
      { acao: 'orcamento.editar', rotulo: 'Criar e editar orçamentos' },
      { acao: 'orcamento.aprovar', rotulo: 'Aprovar orçamentos' },
      { acao: 'orcamento.cancelar', rotulo: 'Cancelar orçamento aprovado' },
      { acao: 'orcamento.confirmar', rotulo: 'Confirmar orçamentos aprovados' },
      { acao: 'financeiro.receber', rotulo: 'Receber pagamentos' },
      { acao: 'financeiro.ver', rotulo: 'Ver o financeiro da clínica' },
      { acao: 'financeiro.editar', rotulo: 'Lançar e editar no financeiro da clínica' },
    ],
  },
  {
    nome: 'Controle Protético',
    ver: 'protetico.ver',
    itens: [
      { acao: 'protetico.editar', rotulo: 'Mudar o andamento dos trabalhos' },
      { acao: 'protetico.criar', rotulo: 'Criar, excluir e alterar trabalhos' },
    ],
  },
  {
    nome: 'Profissionais',
    ver: 'profissional.ver',
    itens: [{ acao: 'profissional.editar', rotulo: 'Cadastrar e editar profissionais' }],
  },
  {
    nome: 'Relatórios',
    ver: 'relatorio.ver',
    itens: [
      { acao: 'relatorio.agenda', rotulo: 'Relatórios da agenda' },
      { acao: 'relatorio.pacientes', rotulo: 'Relatórios de pacientes' },
      { acao: 'relatorio.financeiro', rotulo: 'Relatórios financeiros' },
      { acao: 'relatorio.geral', rotulo: 'Relatórios gerais' },
      { acao: 'relatorio.tratamentos', rotulo: 'Relatórios de tratamentos' },
    ],
  },
  { nome: 'Painel', ver: 'painel.ver', itens: [] },
  { nome: 'Usuários', ver: 'usuario.gerenciar', itens: [] },
  // Ver a lixeira já é restaurar: lá só se lista e restaura.
  { nome: 'Lixeira', ver: 'lixeira.restaurar', itens: [] },
  {
    nome: 'Configurações',
    ver: 'configuracao.editar',
    itens: [{ acao: 'dados.importar', rotulo: 'Importar dados' }],
  },
]

/** Ação → "ver" do módulo em que ela está. */
const MODULO_DE = new Map(MODULOS.flatMap((m) => m.itens.map((i) => [i.acao, m.ver] as const)))

let matriz: Matriz = PADRAO

/** Troca a matriz em uso (a que a clínica gravou; o que faltar fica no padrão). */
export function definirMatriz(m: Partial<Matriz>) {
  matriz = { ...PADRAO, ...m }
}

/** Confere e limpa a matriz enviada pela tela de permissões. */
export function lerMatriz(bruto: unknown): Matriz | null {
  if (!bruto || typeof bruto !== 'object') return null
  const b = bruto as Record<string, unknown>
  const valor: Matriz = { ...PADRAO }
  for (const a of ACOES) {
    const v = b[a]
    if (v === undefined) continue
    if (!Array.isArray(v)) return null
    valor[a] = [...new Set(v.filter((p): p is Perfil => typeof p === 'string' && p in PERFIS))]
  }
  return valor
}

const tem = (p: Perfil, a: Acao) => matriz[a].includes(p)

/** O administrador pode tudo, sempre: assim a clínica nunca fica trancada para fora. */
export function pode(perfis: readonly Perfil[], acao: Acao): boolean {
  const ver = MODULO_DE.get(acao)
  return perfis.some((p) => p === 'ADMINISTRADOR' || (tem(p, acao) && (!ver || tem(p, ver))))
}
