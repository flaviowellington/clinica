// Catálogo dos relatórios, agrupados como no menu. "pronto" = já gera dados.
import type { Acao } from './permissoes'

export type Filtro = 'profissional' | 'status' | 'categoria'

export interface Relatorio {
  id: string
  titulo: string
  pronto: boolean
  /** Filtros além do período que o relatório aceita. */
  filtros?: Filtro[]
  /** Não depende do período (mostra a situação de hoje ou o cadastro inteiro). */
  semPeriodo?: true
  /** A ordem das linhas faz parte do relatório (ex.: DRE): a tela não deixa reordenar. */
  semOrdenar?: true
}

/** O que a tela manda além do período; vazio = sem filtro. */
export interface Filtros {
  profissionais?: number[]
  status?: string
  categoria?: string
}

export const GRUPOS: { titulo: string; permissao: Acao; itens: Relatorio[] }[] = [
  {
    titulo: 'Agendamentos',
    permissao: 'relatorio.agenda',
    itens: [
      {
        id: 'agenda-geral',
        titulo: 'Geral',
        pronto: true,
        filtros: ['profissional', 'status', 'categoria'],
      },
      {
        id: 'agenda-categoria',
        titulo: 'Por categoria',
        pronto: true,
        filtros: ['profissional', 'status'],
      },
      {
        id: 'agenda-faltas',
        titulo: 'Faltas',
        pronto: true,
        filtros: ['profissional', 'categoria'],
      },
      {
        id: 'agenda-primeira',
        titulo: 'Primeira consulta',
        pronto: true,
        filtros: ['profissional', 'status', 'categoria'],
      },
      {
        id: 'agenda-retorno',
        titulo: 'Alertas de retorno',
        pronto: true,
        filtros: ['profissional'],
      },
      {
        id: 'agenda-desmarcacoes',
        titulo: 'Desmarcações',
        pronto: true,
        filtros: ['profissional', 'categoria'],
      },
      {
        id: 'agenda-profissional',
        titulo: 'Consultas por profissional',
        pronto: true,
        filtros: ['profissional', 'categoria'],
      },
      {
        id: 'agenda-ocupacao',
        titulo: 'Ocupação da agenda',
        pronto: true,
        filtros: ['profissional', 'categoria'],
      },
    ],
  },
  {
    titulo: 'Pacientes',
    permissao: 'relatorio.pacientes',
    itens: [
      { id: 'pacientes-aniversariantes', titulo: 'Aniversariantes do período', pronto: true },
      { id: 'pacientes-faixa', titulo: 'Faixa etária', pronto: true, semPeriodo: true },
      { id: 'pacientes-origem', titulo: 'Como conheceu a clínica', pronto: true },
      { id: 'pacientes-ultimo', titulo: 'Último agendamento', pronto: true, semPeriodo: true },
      { id: 'pacientes-orcamentos', titulo: 'Orçamentos', pronto: true, filtros: ['profissional'] },
      { id: 'pacientes-novos', titulo: 'Pacientes novos', pronto: true },
      {
        id: 'pacientes-inadimplentes',
        titulo: 'Cobrança: parcelas em atraso',
        pronto: true,
        semPeriodo: true,
      },
    ],
  },
  {
    titulo: 'Financeiro',
    permissao: 'relatorio.financeiro',
    itens: [
      { id: 'financeiro-caixa', titulo: 'Caixa', pronto: true },
      { id: 'financeiro-dre', titulo: 'DRE', pronto: true, semOrdenar: true },
      { id: 'financeiro-recibos', titulo: 'Recibos', pronto: true },
      { id: 'financeiro-pagar', titulo: 'Contas a pagar', pronto: true },
      { id: 'financeiro-receber', titulo: 'Contas a receber', pronto: true },
      { id: 'financeiro-categorias', titulo: 'Despesas por conta', pronto: true },
      { id: 'financeiro-lancamentos', titulo: 'Todos os lançamentos', pronto: true },
    ],
  },
  {
    titulo: 'Geral',
    permissao: 'relatorio.geral',
    itens: [{ id: 'geral-acessos', titulo: 'Acessos a fichas por usuário', pronto: true }],
  },
  {
    titulo: 'Tratamentos',
    permissao: 'relatorio.tratamentos',
    itens: [
      {
        id: 'tratamentos-abertos',
        titulo: 'Tratamentos em aberto',
        pronto: true,
        filtros: ['profissional'],
        semPeriodo: true,
      },
      {
        id: 'tratamentos-executados',
        titulo: 'Procedimentos executados',
        pronto: true,
        filtros: ['profissional'],
      },
      {
        id: 'tratamentos-procedimentos',
        titulo: 'Procedimentos mais orçados',
        pronto: true,
        filtros: ['profissional'],
      },
    ],
  },
]

export const acharRelatorio = (id: string) => {
  for (const g of GRUPOS) {
    const r = g.itens.find((i) => i.id === id)
    if (r) return { ...r, grupo: g.titulo, permissao: g.permissao }
  }
  return null
}
