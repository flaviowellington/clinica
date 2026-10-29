// Regras do financeiro, usadas pelo front e pela API.

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
