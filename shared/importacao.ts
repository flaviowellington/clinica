// Campos que cada importação aceita, e nomes de coluna comuns para achar cada um sozinho.
import { normalizar } from './regras'

interface Campo {
  rotulo: string
  obrigatorio?: boolean
  /** Cabeçalhos que costumam significar este campo (sem acento, minúsculas). */
  sinonimos: string[]
}

export const CAMPOS_IMPORTACAO = {
  pacientes: {
    nome: {
      rotulo: 'Nome',
      obrigatorio: true,
      sinonimos: ['nome', 'paciente', 'nome do paciente', 'nome completo'],
    },
    nascimento: {
      rotulo: 'Data de nascimento',
      sinonimos: ['nascimento', 'data de nascimento', 'dt nascimento', 'data nasc'],
    },
    cpf: { rotulo: 'CPF', sinonimos: ['cpf', 'cpf do paciente'] },
    rg: { rotulo: 'RG', sinonimos: ['rg', 'identidade'] },
    sexo: { rotulo: 'Sexo', sinonimos: ['sexo', 'genero'] },
    estadoCivil: { rotulo: 'Estado civil', sinonimos: ['estado civil'] },
    celular: {
      rotulo: 'Celular',
      sinonimos: ['celular', 'whatsapp', 'telefone celular', 'fone celular'],
    },
    email: { rotulo: 'E-mail', sinonimos: ['email', 'e-mail'] },
    apelido: { rotulo: 'Apelido', sinonimos: ['apelido', 'nome social'] },
    comoConheceu: {
      rotulo: 'Como conheceu',
      sinonimos: ['como conheceu', 'origem', 'como conheceu a clinica'],
    },
    indicadoPor: { rotulo: 'Indicado por', sinonimos: ['indicado por', 'indicacao'] },
    nomeMae: { rotulo: 'Nome da mãe', sinonimos: ['mae', 'nome da mae'] },
    nomePai: { rotulo: 'Nome do pai', sinonimos: ['pai', 'nome do pai'] },
    responsavelNome: { rotulo: 'Responsável', sinonimos: ['responsavel', 'nome do responsavel'] },
    responsavelCpf: {
      rotulo: 'CPF do responsável',
      sinonimos: ['cpf do responsavel', 'cpf responsavel'],
    },
    observacoes: { rotulo: 'Observações', sinonimos: ['observacoes', 'observacao', 'obs'] },
  },
  agendamentos: {
    paciente: {
      rotulo: 'Paciente',
      obrigatorio: true,
      sinonimos: ['paciente', 'nome do paciente', 'nome'],
    },
    pacienteCpf: { rotulo: 'CPF do paciente', sinonimos: ['cpf', 'cpf do paciente'] },
    profissional: {
      rotulo: 'Profissional',
      obrigatorio: true,
      sinonimos: ['profissional', 'dentista', 'doutor'],
    },
    data: { rotulo: 'Data', obrigatorio: true, sinonimos: ['data', 'data da consulta', 'dia'] },
    inicio: {
      rotulo: 'Hora de início',
      obrigatorio: true,
      sinonimos: ['inicio', 'hora', 'horario', 'hora inicio', 'hora de inicio'],
    },
    fim: { rotulo: 'Hora de fim', sinonimos: ['fim', 'termino', 'hora fim', 'hora de fim'] },
    status: { rotulo: 'Situação', sinonimos: ['status', 'situacao'] },
    categoria: { rotulo: 'Categoria', sinonimos: ['categoria', 'tipo'] },
    observacoes: { rotulo: 'Observações', sinonimos: ['observacoes', 'observacao', 'obs'] },
  },
  procedimentos: {
    paciente: {
      rotulo: 'Paciente',
      obrigatorio: true,
      sinonimos: ['paciente', 'nome do paciente', 'nome'],
    },
    pacienteCpf: { rotulo: 'CPF do paciente', sinonimos: ['cpf', 'cpf do paciente'] },
    profissional: {
      rotulo: 'Profissional',
      obrigatorio: true,
      sinonimos: ['profissional', 'dentista'],
    },
    procedimento: {
      rotulo: 'Procedimento',
      obrigatorio: true,
      sinonimos: ['procedimento', 'descricao', 'tratamento'],
    },
    data: {
      rotulo: 'Data',
      obrigatorio: true,
      sinonimos: ['data', 'data de execucao', 'executado em'],
    },
    dente: { rotulo: 'Dente', sinonimos: ['dente', 'dentes', 'regiao', 'dente/regiao'] },
    faces: { rotulo: 'Faces', sinonimos: ['faces', 'face'] },
    observacao: {
      rotulo: 'Observação',
      sinonimos: ['observacao', 'observacoes', 'obs', 'evolucao', 'anotacao'],
    },
  },
} satisfies Record<string, Record<string, Campo>>

export type TipoImportacao = keyof typeof CAMPOS_IMPORTACAO

export const TITULOS_IMPORTACAO: Record<TipoImportacao, string> = {
  pacientes: 'Pacientes',
  agendamentos: 'Agendamentos',
  procedimentos: 'Procedimentos do prontuário',
}

/** Sugere, para cada campo, a coluna da planilha cujo cabeçalho combina. */
export function sugerirColunas(tipo: TipoImportacao, cabecalhos: string[]) {
  const norm = cabecalhos.map((c) => normalizar(c))
  const usadas = new Set<number>()
  const mapa: Record<string, number | null> = {}
  for (const [campo, def] of Object.entries(CAMPOS_IMPORTACAO[tipo]) as [string, Campo][]) {
    const i = norm.findIndex((c, k) => !usadas.has(k) && def.sinonimos.includes(c))
    mapa[campo] = i >= 0 ? i : null
    if (i >= 0) usadas.add(i)
  }
  return mapa
}
