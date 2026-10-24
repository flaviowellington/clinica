// Catálogo dos relatórios, agrupados como no menu. "pronto" = já gera dados.
import type { Acao } from './permissoes'

export interface Relatorio {
  id: string
  titulo: string
  pronto: boolean
}

export const GRUPOS: { titulo: string; permissao: Acao; itens: Relatorio[] }[] = [
  {
    titulo: 'Agendamentos',
    permissao: 'relatorio.agenda',
    itens: [
      { id: 'agenda-geral', titulo: 'Geral', pronto: true },
      { id: 'agenda-categoria', titulo: 'Por categoria', pronto: true },
      { id: 'agenda-faltas', titulo: 'Faltas', pronto: true },
      { id: 'agenda-primeira', titulo: 'Primeira consulta', pronto: true },
      { id: 'agenda-retorno', titulo: 'Alertas de retorno', pronto: true },
      { id: 'agenda-desmarcacoes', titulo: 'Desmarcações', pronto: true },
      { id: 'agenda-profissional', titulo: 'Consultas por profissional', pronto: true },
      { id: 'agenda-status', titulo: 'Consultas por status', pronto: true },
      { id: 'agenda-ocupacao', titulo: 'Ocupação da agenda', pronto: true },
    ],
  },
  {
    titulo: 'Pacientes',
    permissao: 'relatorio.pacientes',
    itens: [
      { id: 'pacientes-aniversariantes', titulo: 'Aniversariantes do período', pronto: true },
      { id: 'pacientes-faixa', titulo: 'Faixa etária', pronto: true },
      { id: 'pacientes-origem', titulo: 'Como conheceu a clínica', pronto: true },
      { id: 'pacientes-ultimo', titulo: 'Último agendamento', pronto: true },
      { id: 'pacientes-orcamentos', titulo: 'Orçamentos', pronto: true },
      { id: 'pacientes-novos', titulo: 'Pacientes novos', pronto: true },
      { id: 'pacientes-indicacoes', titulo: 'Indicações', pronto: true },
      { id: 'pacientes-inadimplentes', titulo: 'Cobrança: parcelas em atraso', pronto: true },
    ],
  },
  {
    titulo: 'Financeiro',
    permissao: 'relatorio.financeiro',
    itens: [
      { id: 'financeiro-resumo', titulo: 'Resumo da conta corrente', pronto: true },
      { id: 'financeiro-formas', titulo: 'Entradas por forma de pagamento', pronto: true },
      { id: 'financeiro-caixa', titulo: 'Caixa', pronto: true },
      { id: 'financeiro-dre', titulo: 'DRE', pronto: true },
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
    itens: [
      { id: 'geral-acessos', titulo: 'Acessos a fichas por usuário', pronto: true },
      { id: 'geral-usuarios', titulo: 'Usuários e perfis', pronto: true },
    ],
  },
  {
    titulo: 'Tratamentos',
    permissao: 'relatorio.tratamentos',
    itens: [
      { id: 'tratamentos-abertos', titulo: 'Tratamentos em aberto', pronto: true },
      { id: 'tratamentos-executados', titulo: 'Procedimentos executados', pronto: true },
      { id: 'tratamentos-faturamento', titulo: 'Faturamento por profissional', pronto: true },
      { id: 'tratamentos-procedimentos', titulo: 'Procedimentos mais orçados', pronto: true },
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
