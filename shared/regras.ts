// Regras do cadastro de paciente usadas pelo front (para habilitar botões)
// e pela API (que valida de novo, porque o front não é confiável).

export const COMO_CONHECEU = [
  'Google',
  'Instagram',
  'Facebook',
  'Indicado por',
  'Escola',
  'Outdoor',
  'Panfleto',
  'Placa',
  'Rádio',
  'TV',
  'Revista',
  'Outros',
] as const

export const MOTIVOS_INATIVACAO = {
  FALECIMENTO: 'Falecimento',
  SOLICITACAO_PACIENTE: 'Solicitação do paciente',
  DESISTENCIA_TRATAMENTO: 'Desistência do tratamento',
  OUTROS: 'Outros',
} as const
export type MotivoInativacao = keyof typeof MOTIVOS_INATIVACAO

/** Em nome de quem sai a nota fiscal do paciente. */
export const TOMADORES_NF = {
  PACIENTE: 'O próprio paciente',
  MAE: 'Mãe',
  PAI: 'Pai',
  RESPONSAVEL: 'Responsável legal',
  OUTRO: 'Outra pessoa (CPF)',
  EMPRESA: 'Empresa (CNPJ)',
} as const
export type TomadorNf = keyof typeof TOMADORES_NF

/** Minúsculas, sem acento e com espaços simples: é o que a busca compara. */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Data no formato aaaa-mm-dd, que existe, entre 1900 e hoje. */
export function dataValida(iso: string | null | undefined, hoje = new Date()): boolean {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toISOString().slice(0, 10) === iso && d.getUTCFullYear() >= 1900 && d <= hoje
}

export function cpfValido(cpf: string): boolean {
  const n = cpf.replace(/\D/g, '')
  if (n.length !== 11 || /^(\d)\1+$/.test(n)) return false
  for (const tam of [9, 10]) {
    let soma = 0
    for (let i = 0; i < tam; i++) soma += Number(n[i]) * (tam + 1 - i)
    if (((soma * 10) % 11) % 10 !== Number(n[tam])) return false
  }
  return true
}

/**
 * CNPJ com dígitos verificadores válidos. Aceita o CNPJ alfanumérico (letras nas 12
 * primeiras posições, valor = código ASCII − 48); os 2 últimos são sempre números.
 */
export function cnpjValido(cnpj: string): boolean {
  const n = cnpj.replace(/[^0-9a-z]/gi, '').toUpperCase()
  if (!/^[0-9A-Z]{12}\d{2}$/.test(n) || /^(\d)\1+$/.test(n)) return false
  for (const tam of [12, 13]) {
    let soma = 0
    for (let i = 0; i < tam; i++) soma += (n.charCodeAt(i) - 48) * (((tam - 1 - i) % 8) + 2)
    const dv = soma % 11 < 2 ? 0 : 11 - (soma % 11)
    if (dv !== Number(n[tam])) return false
  }
  return true
}

/** Regime tributário do emitente da nota. */
export const REGIMES_TRIBUTARIOS = {
  SIMPLES: 'Simples Nacional',
  MEI: 'MEI',
  PRESUMIDO: 'Lucro Presumido',
  REAL: 'Lucro Real',
  PF: 'Pessoa física (carnê-leão)',
} as const
export type RegimeTributario = keyof typeof REGIMES_TRIBUTARIOS

export function idade(nascimento: string, hoje = new Date()): number {
  const [a, m, d] = nascimento.split('-').map(Number)
  const passou = hoje.getMonth() + 1 > m || (hoje.getMonth() + 1 === m && hoje.getDate() >= d)
  return hoje.getFullYear() - a - (passou ? 0 : 1)
}

export interface DadosPaciente {
  nome?: string | null
  nascimento?: string | null
}

/** R-001: só Nome e Data de nascimento são obrigatórios. */
export function podeCadastrar(d: DadosPaciente): boolean {
  return !!d.nome?.trim() && dataValida(d.nascimento)
}

// ponytail: fuso fixo de Brasília; virar configuração se a clínica ficar em outro fuso.
/** Data de hoje (aaaa-mm-dd) no horário da clínica, não no do servidor (UTC). */
// Formatador criado uma vez: toLocaleDateString com fuso monta um novo a cada chamada (lento).
const DATA_NA_CLINICA = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' })
export const hojeNaClinica = (agora = new Date()) => DATA_NA_CLINICA.format(agora)

/** Cadastro sem nenhuma atualização há 1 ano ou mais: hora de conferir os dados e a foto com o paciente. */
export function cadastroDesatualizado(alteradoEm: string | Date, hoje = new Date()): boolean {
  const vence = new Date(alteradoEm)
  vence.setFullYear(vence.getFullYear() + 1)
  return vence <= hoje
}
