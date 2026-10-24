// Regras do financeiro e da conta digital, usadas pelo front e pela API.
import { cpfValido, normalizar } from './regras'

export const TIPOS_LANCAMENTO = {
  VENDA: 'Venda',
  CANCELAMENTO: 'Cancelamento de venda',
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
} as const
export type TipoLancamento = keyof typeof TIPOS_LANCAMENTO

export const FORMAS = [
  'Dinheiro',
  'Pix',
  'Cartão de crédito',
  'Cartão de débito',
  'Boleto',
  'Transferência',
  'Cheque',
] as const

/** 123456 → "R$ 1.234,56" */
export const reais = (centavos: number) =>
  (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * Campo de valor que monta os centavos da direita para a esquerda (R-055):
 * "1" → 1 centavo, "100" → R$ 1,00. Ignora tudo que não for dígito.
 */
export const centavosDeDigitos = (texto: string) =>
  Number(texto.replace(/\D/g, '').slice(0, 11) || 0)

export function cnpjValido(cnpj: string): boolean {
  const n = cnpj.replace(/\D/g, '')
  if (n.length !== 14 || /^(\d)\1+$/.test(n)) return false
  for (const tam of [12, 13]) {
    const pesos =
      tam === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const soma = pesos.reduce((s, p, i) => s + p * Number(n[i]), 0)
    const dv = soma % 11 < 2 ? 0 : 11 - (soma % 11)
    if (dv !== Number(n[tam])) return false
  }
  return true
}

const dataIso = (v?: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v))

export function validarLancamento(d: {
  data?: string | null
  tipo?: string | null
  valorCentavos?: number | null
  descricao?: string | null
}): Record<string, string> {
  const erros: Record<string, string> = {}
  if (!dataIso(d.data)) erros.data = 'Informe a data.'
  if (!d.tipo || !(d.tipo in TIPOS_LANCAMENTO)) erros.tipo = 'Escolha o tipo.'
  if (!d.valorCentavos || d.valorCentavos <= 0)
    erros.valorCentavos = 'Informe um valor maior que zero.'
  if (!d.descricao?.trim()) erros.descricao = 'Informe a descrição.'
  return erros
}

export const TIPOS_CONTA = {
  PESSOA_FISICA: 'Pessoa Física',
  PESSOA_JURIDICA: 'Pessoa Jurídica',
} as const
export type TipoConta = keyof typeof TIPOS_CONTA

export const STATUS_CONTA = {
  PENDENTE: 'Aguardando parceiro de pagamentos',
  ATIVA: 'Ativa',
  CANCELADA: 'Cancelada',
} as const

export function validarConta(d: {
  tipo?: string | null
  nome?: string | null
  documento?: string | null
  email?: string | null
  celular?: string | null
}): Record<string, string> {
  const erros: Record<string, string> = {}
  const pj = d.tipo === 'PESSOA_JURIDICA'
  if (!d.tipo || !(d.tipo in TIPOS_CONTA)) erros.tipo = 'Escolha o tipo de conta.'
  if (!d.nome?.trim() || normalizar(d.nome).length < 3)
    erros.nome = pj ? 'Informe a razão social.' : 'Informe o nome completo.'
  const doc = d.documento ?? ''
  if (pj ? !cnpjValido(doc) : !cpfValido(doc))
    erros.documento = pj ? 'CNPJ inválido.' : 'CPF inválido.'
  if (!d.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) erros.email = 'E-mail inválido.'
  if ((d.celular ?? '').replace(/\D/g, '').length < 10) erros.celular = 'Celular inválido.'
  return erros
}

/** Plano de contas da clínica, agrupado como no DRE (R-043). */
export const PLANO_DE_CONTAS = {
  'Receita operacional bruta': ['Receita de tratamentos', 'Outras receitas operacionais'],
  Deduções: ['Impostos sobre serviços', 'Taxas de cartão e boleto'],
  Custos: ['Material odontológico', 'Laboratório de prótese', 'Comissões de profissionais'],
  'Despesas operacionais': [
    'Aluguel e condomínio',
    'Salários e encargos',
    'Água, luz, telefone e internet',
    'Marketing',
    'Manutenção e equipamentos',
    'Despesas administrativas',
  ],
  'Receitas não operacionais': ['Rendimentos financeiros'],
  'Despesas não operacionais': ['Juros e tarifas bancárias'],
} as const
export type GrupoDre = keyof typeof PLANO_DE_CONTAS
export const CATEGORIAS = Object.values(PLANO_DE_CONTAS).flat() as string[]
export const CATEGORIA_PADRAO_ENTRADA = 'Receita de tratamentos'
export const grupoDe = (categoria: string | null | undefined) =>
  (Object.keys(PLANO_DE_CONTAS) as GrupoDre[]).find((g) =>
    (PLANO_DE_CONTAS[g] as readonly string[]).includes(categoria ?? ''),
  )

export const STATUS_CONTA_FINANCEIRA = {
  ABERTA: 'Em aberto',
  PAGA: 'Paga',
  CANCELADA: 'Cancelada',
} as const
