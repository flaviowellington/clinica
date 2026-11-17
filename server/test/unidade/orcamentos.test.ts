// Regras de orçamento (shared/orcamentos.ts): parcelas, vencimentos, total e desconto.
import { describe, expect, it } from 'vitest'
import {
  DENTES_DECIDUOS,
  DENTES_PERMANENTES,
  descontoDoPercentual,
  dividirParcelas,
  percentualDoDesconto,
  tipoProcedimento,
  totalOrcamento,
  umMesDepois,
  vencimentos,
} from '../../../shared/orcamentos'

describe('dividirParcelas (R-015)', () => {
  it('300,00 em 7: as primeiras levam o centavo que sobra', () => {
    expect(dividirParcelas(30000, 7)).toEqual([4286, 4286, 4286, 4286, 4286, 4285, 4285])
  })
  it('1,00 em 3 → 0,34 + 0,33 + 0,33', () => {
    expect(dividirParcelas(100, 3)).toEqual([34, 33, 33])
  })
  it('uma parcela só leva o total', () => {
    expect(dividirParcelas(12345, 1)).toEqual([12345])
  })
  it('total zero dá parcelas zeradas', () => {
    expect(dividirParcelas(0, 4)).toEqual([0, 0, 0, 0])
  })
  it('para qualquer total e 1 a 24 parcelas: soma exata e diferença de no máximo 1 centavo', () => {
    for (const total of [1, 99, 100, 101, 999_99, 1_000_000, 123_457])
      for (let n = 1; n <= 24; n++) {
        const p = dividirParcelas(total, n)
        expect(p).toHaveLength(n)
        expect(p.reduce((s, x) => s + x, 0)).toBe(total)
        expect(Math.max(...p) - Math.min(...p)).toBeLessThanOrEqual(1)
        // Ordem: as maiores primeiro.
        expect([...p].sort((a, b) => b - a)).toEqual(p)
      }
  })
})

describe('vencimentos e umMesDepois', () => {
  it('mensal no mesmo dia', () => {
    expect(vencimentos('2026-11-15', 3)).toEqual(['2026-11-15', '2026-12-15', '2027-01-15'])
  })
  it('fim de mês ajusta para o último dia (fevereiro sem 29)', () => {
    expect(vencimentos('2026-01-31', 4)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ])
  })
  it('ano bissexto: 31/01 → 29/02', () => {
    expect(vencimentos('2028-01-31', 2)).toEqual(['2028-01-31', '2028-02-29'])
  })
  it('zero parcelas → lista vazia', () => {
    expect(vencimentos('2026-05-10', 0)).toEqual([])
  })
  it('umMesDepois: 31/03 → 30/04; 15/12 → 15/01 do ano seguinte', () => {
    expect(umMesDepois('2026-03-31')).toBe('2026-04-30')
    expect(umMesDepois('2026-12-15')).toBe('2027-01-15')
  })
})

describe('totalOrcamento', () => {
  const itens = [{ valorCentavos: 10000 }, { valorCentavos: 25050 }]
  it('soma os itens', () => expect(totalOrcamento(itens)).toBe(35050))
  it('tira o desconto', () => expect(totalOrcamento(itens, 5050)).toBe(30000))
  it('nunca fica negativo', () => expect(totalOrcamento(itens, 999999)).toBe(0))
  it('sem itens = zero', () => expect(totalOrcamento([])).toBe(0))
})

describe('desconto em % e em reais', () => {
  it('10% de R$ 333,33 → R$ 33,33 (arredonda o centavo)', () => {
    expect(descontoDoPercentual(33333, 10)).toBe(3333)
  })
  it('0% e 100%', () => {
    expect(descontoDoPercentual(50000, 0)).toBe(0)
    expect(descontoDoPercentual(50000, 100)).toBe(50000)
  })
  it('percentual com até 2 casas', () => {
    expect(percentualDoDesconto(30000, 3000)).toBe(10)
    expect(percentualDoDesconto(30000, 1000)).toBe(3.33)
  })
  it('subtotal zero não divide por zero', () => {
    expect(percentualDoDesconto(0, 500)).toBe(0)
  })
  it('ida e volta: % → reais → % fica igual para percentuais inteiros', () => {
    for (const pct of [1, 5, 10, 15, 25, 50, 99]) {
      const desc = descontoDoPercentual(100000, pct)
      expect(percentualDoDesconto(100000, desc)).toBe(pct)
    }
  })
})

describe('tipo de procedimento da tabela', () => {
  it('por dente × boca toda', () => {
    expect(tipoProcedimento(true).curto).toBe('por dente')
    expect(tipoProcedimento(false).curto).toBe('boca toda')
    expect(tipoProcedimento(false).rotulo).toMatch(/boca toda/)
  })
})

describe('numeração FDI das dentições', () => {
  it('permanente: 32 dentes, sem repetir, 16 por arcada', () => {
    const todos = DENTES_PERMANENTES.flat()
    expect(todos).toHaveLength(32)
    expect(new Set(todos).size).toBe(32)
    expect(DENTES_PERMANENTES.map((a) => a.length)).toEqual([16, 16])
  })
  it('decídua: 20 dentes, sem repetir, 10 por arcada', () => {
    const todos = DENTES_DECIDUOS.flat()
    expect(todos).toHaveLength(20)
    expect(new Set(todos).size).toBe(20)
  })
  it('superior só tem quadrantes 1/2 (5/6); inferior 3/4 (7/8)', () => {
    expect(DENTES_PERMANENTES[0].every((d) => [1, 2].includes(Math.floor(d / 10)))).toBe(true)
    expect(DENTES_PERMANENTES[1].every((d) => [3, 4].includes(Math.floor(d / 10)))).toBe(true)
    expect(DENTES_DECIDUOS[0].every((d) => [5, 6].includes(Math.floor(d / 10)))).toBe(true)
    expect(DENTES_DECIDUOS[1].every((d) => [7, 8].includes(Math.floor(d / 10)))).toBe(true)
  })
})
