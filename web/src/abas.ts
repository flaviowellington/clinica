// As partes do sistema: menu do topo e cartões da tela inicial.
import { pode, type Perfil } from '../../shared/permissoes'
import { GRUPOS } from '../../shared/relatorios'
import type { NomeIcone } from './componentes/Icones'

const todos = () => true

export const ABAS: {
  para:
    | '/agenda'
    | '/confirmacoes'
    | '/mensagens'
    | '/pacientes'
    | '/protetico'
    | '/financeiro'
    | '/profissionais'
    | '/relatorios'
    | '/painel'
    | '/usuarios'
    | '/configuracoes'
  rotulo: string
  descricao: string
  icone: NomeIcone
  visivel: (perfis: readonly Perfil[]) => boolean
}[] = [
  {
    para: '/agenda',
    rotulo: 'Agenda',
    descricao: 'Marque, remarque e acompanhe as consultas do dia.',
    icone: 'agenda',
    visivel: todos,
  },
  {
    para: '/confirmacoes',
    rotulo: 'Confirmações',
    descricao: 'Confirme as consultas por e-mail ou à mão.',
    icone: 'confirmacoes',
    visivel: (p) => pode(p, 'agenda.editar'),
  },
  {
    para: '/mensagens',
    rotulo: 'Mensagens',
    descricao: 'Texto, confirmação ou plano para assinar, por e-mail ou WhatsApp.',
    icone: 'conversa',
    visivel: (p) => pode(p, 'agenda.editar'),
  },
  {
    para: '/pacientes',
    rotulo: 'Pacientes',
    descricao: 'Cadastro, prontuário e histórico de cada paciente.',
    icone: 'pacientes',
    visivel: todos,
  },
  {
    para: '/protetico',
    rotulo: 'Controle Protético',
    descricao: 'Trabalhos de laboratório, do envio à instalação.',
    icone: 'protetico',
    visivel: (p) => pode(p, 'protetico.ver'),
  },
  {
    para: '/financeiro',
    rotulo: 'Financeiro',
    descricao: 'Faturamento da clínica.',
    icone: 'financeiro',
    // Todos entram; quem não é do financeiro vê só os orçamentos abertos.
    visivel: (p) => pode(p, 'orcamento.ver'),
  },
  {
    para: '/profissionais',
    rotulo: 'Profissionais',
    descricao: 'Dentistas da clínica, especialidades e cor na agenda.',
    icone: 'profissionais',
    visivel: todos,
  },
  {
    para: '/relatorios',
    rotulo: 'Relatórios',
    descricao: 'Números da agenda, dos pacientes e do financeiro.',
    icone: 'relatorios',
    visivel: (p) => GRUPOS.some((g) => pode(p, g.permissao)),
  },
  {
    para: '/painel',
    rotulo: 'Painel',
    descricao: 'Indicadores de agenda, vendas, recebimentos e inadimplência.',
    icone: 'painel',
    visivel: (p) => pode(p, 'painel.ver'),
  },
  {
    para: '/usuarios',
    rotulo: 'Usuários',
    descricao: 'Quem entra no sistema, com quais perfis.',
    icone: 'usuarios',
    visivel: (p) => pode(p, 'usuario.gerenciar'),
  },
  {
    para: '/configuracoes',
    rotulo: 'Configurações',
    descricao: 'Dados da clínica, procedimentos, anamnese, modelos e e-mail.',
    icone: 'configuracoes',
    visivel: (p) => pode(p, 'configuracao.editar'),
  },
]
