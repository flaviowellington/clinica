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
  'paciente.notaFiscal': GESTAO,
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
  // Abrir a ficha do profissional (o card em Profissionais); sem isso, só vê a lista.
  'profissional.abrir': ADM,
  // Financeiro da clínica: só Adm e Financeiro; os outros veem só os orçamentos abertos (orcamento.ver).
  'financeiro.ver': GESTAO,
  'financeiro.editar': GESTAO,
  'financeiro.paciente': TODOS,
  // Aba Nota fiscal do Financeiro: buscar paciente e ver/editar os dados da nota.
  'financeiro.notaFiscal': GESTAO,
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
  // Entrar em Configurações; cada aba tem a sua ação. O Financeiro entra só na aba Clínica.
  'configuracao.editar': GESTAO,
  'configuracao.clinica': GESTAO,
  'configuracao.horarios': ADM,
  'configuracao.especialidades': ADM,
  'configuracao.procedimentos': ADM,
  'configuracao.laboratorios': ADM,
  'configuracao.anamnese': ADM,
  'configuracao.documentos': ADM,
  'configuracao.mensagens': ADM,
  'configuracao.permissoes': ADM,
  'dados.importar': ADM,
  // Fora de MODULOS de propósito: só o administrador, não aparece na tela de permissões.
  'configuracao.logs': ADM,
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
 * Módulos da tela de permissões, na ordem do menu; as ações, na ordem das abas de cada página.
 * `modulo` é a parte do site onde a ação aparece. Sem o "ver" do módulo, nenhuma ação de
 * dentro dele vale, mesmo marcada (pode() confere as duas).
 */
type Item = { acao: Acao; modulo: string; rotulo: string }
export const MODULOS: { nome: string; ver: Acao; itens: Item[] }[] = [
  {
    nome: 'Agenda',
    ver: 'agenda.ver',
    itens: [
      {
        acao: 'agenda.editar',
        modulo: 'Agenda, Confirmações e Mensagens',
        rotulo: 'Marcar e remarcar consultas; Confirmações e Mensagens',
      },
      {
        acao: 'confirmacoes.todas',
        modulo: 'Confirmações',
        rotulo: 'Ver confirmações de todos os profissionais',
      },
    ],
  },
  {
    nome: 'Controle Protético',
    ver: 'protetico.ver',
    itens: [
      { acao: 'protetico.editar', modulo: 'Trabalhos', rotulo: 'Mudar o andamento dos trabalhos' },
      {
        acao: 'protetico.criar',
        modulo: 'Trabalhos',
        rotulo: 'Criar, excluir e alterar trabalhos',
      },
    ],
  },
  {
    nome: 'Pacientes',
    ver: 'paciente.ver',
    itens: [
      { acao: 'paciente.editar', modulo: 'Cadastro', rotulo: 'Cadastrar e editar pacientes' },
      { acao: 'paciente.inativar', modulo: 'Cadastro', rotulo: 'Inativar e reativar pacientes' },
      { acao: 'paciente.excluir', modulo: 'Cadastro', rotulo: 'Excluir pacientes' },
      {
        acao: 'paciente.notaFiscal',
        modulo: 'Nota Fiscal',
        rotulo: 'Ver e editar os dados da nota fiscal',
      },
      { acao: 'financeiro.paciente', modulo: 'Ficha', rotulo: 'Financeiro do paciente' },
      { acao: 'anamnese.ver', modulo: 'Anamnese', rotulo: 'Ver anamnese' },
      {
        acao: 'prontuario.ver',
        modulo: 'Prontuário',
        rotulo: 'Ver prontuário (plano, odontograma, documentos, exames)',
      },
      { acao: 'prontuario.editar', modulo: 'Prontuário', rotulo: 'Editar prontuário' },
      {
        acao: 'procedimento.executar',
        modulo: 'Plano e Orçamentos',
        rotulo: 'Executar procedimentos',
      },
      { acao: 'fotos.ver', modulo: 'Fotos', rotulo: 'Ver fotos' },
    ],
  },
  {
    nome: 'Financeiro e orçamentos',
    ver: 'orcamento.ver',
    itens: [
      { acao: 'orcamento.editar', modulo: 'Orçamentos', rotulo: 'Criar e editar orçamentos' },
      { acao: 'orcamento.aprovar', modulo: 'Orçamentos', rotulo: 'Aprovar orçamentos' },
      {
        acao: 'orcamento.cancelar',
        modulo: 'Orçamentos',
        rotulo: 'Cancelar orçamento aprovado',
      },
      { acao: 'financeiro.receber', modulo: 'Orçamentos abertos', rotulo: 'Receber pagamentos' },
      {
        acao: 'orcamento.confirmar',
        modulo: 'Aprovações',
        rotulo: 'Confirmar orçamentos aprovados',
      },
      {
        acao: 'financeiro.ver',
        modulo: 'Controle Financeiro e Gráficos',
        rotulo: 'Ver o financeiro da clínica',
      },
      {
        acao: 'financeiro.editar',
        modulo: 'Controle Financeiro',
        rotulo: 'Lançar e editar no financeiro da clínica',
      },
      {
        acao: 'financeiro.notaFiscal',
        modulo: 'Nota fiscal',
        rotulo: 'Buscar paciente e editar os dados da nota',
      },
    ],
  },
  { nome: 'Painel', ver: 'painel.ver', itens: [] },
  {
    nome: 'Profissionais',
    ver: 'profissional.ver',
    itens: [
      { acao: 'profissional.abrir', modulo: 'Ficha', rotulo: 'Abrir a ficha do profissional' },
      {
        acao: 'profissional.editar',
        modulo: 'Cadastro',
        rotulo: 'Cadastrar e editar profissionais',
      },
    ],
  },
  {
    nome: 'Relatórios',
    ver: 'relatorio.ver',
    itens: [
      { acao: 'relatorio.agenda', modulo: 'Agendamentos', rotulo: 'Relatórios da agenda' },
      { acao: 'relatorio.pacientes', modulo: 'Pacientes', rotulo: 'Relatórios de pacientes' },
      { acao: 'relatorio.financeiro', modulo: 'Financeiro', rotulo: 'Relatórios financeiros' },
      { acao: 'relatorio.geral', modulo: 'Geral', rotulo: 'Relatórios gerais' },
      {
        acao: 'relatorio.tratamentos',
        modulo: 'Tratamentos',
        rotulo: 'Relatórios de tratamentos',
      },
    ],
  },
  { nome: 'Usuários', ver: 'usuario.gerenciar', itens: [] },
  {
    nome: 'Configurações',
    ver: 'configuracao.editar',
    itens: [
      { acao: 'configuracao.clinica', modulo: 'Clínica', rotulo: 'Dados da clínica e emitente' },
      {
        acao: 'configuracao.horarios',
        modulo: 'Horários de atendimento',
        rotulo: 'Horários de atendimento',
      },
      { acao: 'configuracao.especialidades', modulo: 'Especialidades', rotulo: 'Especialidades' },
      {
        acao: 'configuracao.procedimentos',
        modulo: 'Procedimentos e preços',
        rotulo: 'Procedimentos e preços',
      },
      { acao: 'configuracao.laboratorios', modulo: 'Laboratórios', rotulo: 'Laboratórios' },
      { acao: 'configuracao.anamnese', modulo: 'Anamnese', rotulo: 'Modelos de anamnese' },
      {
        acao: 'configuracao.documentos',
        modulo: 'Modelos de documento',
        rotulo: 'Modelos de documento',
      },
      {
        acao: 'configuracao.mensagens',
        modulo: 'E-mail e mensagens',
        rotulo: 'E-mail e mensagens',
      },
      { acao: 'configuracao.permissoes', modulo: 'Permissões', rotulo: 'Permissões e desconto' },
      { acao: 'dados.importar', modulo: 'Importar dados', rotulo: 'Importar dados' },
    ],
  },
  // Ver a lixeira já é restaurar: lá só se lista e restaura.
  { nome: 'Lixeira', ver: 'lixeira.restaurar', itens: [] },
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

/** Ver e editar os dados da nota fiscal: pela ficha do paciente ou pela aba do Financeiro. */
export const podeNotaFiscal = (perfis: readonly Perfil[]) =>
  pode(perfis, 'paciente.notaFiscal') || pode(perfis, 'financeiro.notaFiscal')

/**
 * Desconto em orçamento: escolhido por usuário, não por cargo (config "desconto", em
 * Configurações → Permissões → Desconto). O Administrador pode sempre.
 */
export const podeDarDesconto = (u: { id: number; perfis: readonly Perfil[] }, lista: number[]) =>
  u.perfis.includes('ADMINISTRADOR') || lista.includes(u.id)
