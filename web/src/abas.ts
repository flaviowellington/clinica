// As partes do sistema: menu do topo e cartões da tela inicial.
import { pode, type Perfil } from '../../shared/permissoes'
import { GRUPOS } from '../../shared/relatorios'
import type { NomeIcone } from './componentes/Icones'

const todos = () => true

export const ABAS: {
  para: '/agenda' | '/pacientes' | '/financeiro' | '/profissionais' | '/relatorios' | '/contas'
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
    para: '/pacientes',
    rotulo: 'Pacientes',
    descricao: 'Cadastro, prontuário e histórico de cada paciente.',
    icone: 'pacientes',
    visivel: todos,
  },
  {
    para: '/financeiro',
    rotulo: 'Financeiro',
    descricao: 'Entradas, saídas e vendas da clínica.',
    icone: 'financeiro',
    visivel: (p) => pode(p, 'financeiro.ver'),
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
    para: '/contas',
    rotulo: 'Conta digital',
    descricao: 'Pedido de conta para receber por Pix e boleto.',
    icone: 'conta',
    visivel: (p) => pode(p, 'conta.gerenciar'),
  },
]
