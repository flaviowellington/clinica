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
export const hojeNaClinica = (agora = new Date()) =>
  agora.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
