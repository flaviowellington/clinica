// Regras do financeiro, usadas pelo front e pela API.

export const TIPOS_LANCAMENTO = {
  VENDA: 'Venda',
  CANCELAMENTO: 'Cancelamento de venda',
  ENTRADA: 'Entrada',
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

/** Plano de contas da clínica: só receitas, o sistema não lança despesas. */
export const CATEGORIAS = [
  'Receita de tratamentos',
  'Outras receitas operacionais',
  'Rendimentos financeiros',
]
export const CATEGORIA_PADRAO_ENTRADA = 'Receita de tratamentos'

export const STATUS_CONTA_FINANCEIRA = {
  ABERTA: 'Em aberto',
  PAGA: 'Paga',
  CANCELADA: 'Cancelada',
} as const
