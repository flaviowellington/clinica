// Regras de orçamento usadas pelo front e pela API (rules/orcamentos.md).

export const STATUS_ORCAMENTO = {
  ABERTO: 'Em aberto',
  APROVADO: 'Aprovado',
  CANCELADO: 'Cancelado',
} as const
export type StatusOrcamento = keyof typeof STATUS_ORCAMENTO

/** Dentes na numeração FDI, na ordem da boca (R-014). */
export const DENTES_PERMANENTES = [
  [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28],
  [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38],
]
export const DENTES_DECIDUOS = [
  [55, 54, 53, 52, 51, 61, 62, 63, 64, 65],
  [85, 84, 83, 82, 81, 71, 72, 73, 74, 75],
]

/**
 * Divide o total em parcelas com centavos exatos (R-015): as primeiras
 * levam o centavo que sobra. 300,00 em 7 → 42,86 ×5 e 42,85 ×2.
 */
export function dividirParcelas(totalCentavos: number, n: number): number[] {
  const base = Math.floor(totalCentavos / n)
  const resto = totalCentavos - base * n
  return Array.from({ length: n }, (_, i) => base + (i < resto ? 1 : 0))
}

/** Vencimentos mensais no mesmo dia, a partir do primeiro (aaaa-mm-dd). Fim de mês ajusta. */
export function vencimentos(primeiro: string, n: number): string[] {
  const [a, m, d] = primeiro.split('-').map(Number)
  return Array.from({ length: n }, (_, i) => {
    const ultimoDia = new Date(Date.UTC(a, m - 1 + i + 1, 0)).getUTCDate()
    return new Date(Date.UTC(a, m - 1 + i, Math.min(d, ultimoDia))).toISOString().slice(0, 10)
  })
}

/** Um mês depois da data (R-015: 1ª parcela vence um mês após o orçamento). */
export const umMesDepois = (iso: string) => vencimentos(iso, 2)[1]

export const totalOrcamento = (itens: { valorCentavos: number }[], descontoCentavos = 0) =>
  Math.max(0, itens.reduce((s, i) => s + i.valorCentavos, 0) - descontoCentavos)

/** Desconto em %: 10% de R$ 333,33 → R$ 33,33 (arredonda para o centavo). */
export const descontoDoPercentual = (subtotalCentavos: number, percentual: number) =>
  Math.round((subtotalCentavos * percentual) / 100)

/** O mesmo desconto em %, com até 2 casas: R$ 30,00 de R$ 300,00 → 10. */
export const percentualDoDesconto = (subtotalCentavos: number, descontoCentavos: number) =>
  subtotalCentavos ? Math.round((descontoCentavos / subtotalCentavos) * 10000) / 100 : 0
