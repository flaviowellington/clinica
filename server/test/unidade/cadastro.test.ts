// Cadastro (shared/regras.ts), máscaras (shared/mascaras.ts) e dinheiro (shared/financeiro.ts).
import { describe, expect, it } from 'vitest'
import {
  cadastroDesatualizado,
  cnpjValido,
  cpfValido,
  dataValida,
  hojeNaClinica,
  idade,
  normalizar,
  podeCadastrar,
} from '../../../shared/regras'
import {
  celularVazio,
  mascaraCelular,
  mascaraCep,
  mascaraCnpj,
  mascaraCpf,
  mascaraRg,
} from '../../../shared/mascaras'
import { CATEGORIAS, FORMAS, centavosDeDigitos, reais } from '../../../shared/financeiro'

describe('normalizar (busca)', () => {
  it.each([
    ['  ÁRVORE   Ção ', 'arvore cao'],
    ['João', 'joao'],
    ['MÁRCIA\tSouza', 'marcia souza'],
    ['', ''],
  ])('"%s" → "%s"', (a, b) => expect(normalizar(a)).toBe(b))
})

describe('dataValida', () => {
  const hoje = new Date('2026-11-17T12:00:00Z')
  it.each([
    ['2024-02-29', true, 'bissexto'],
    ['2026-02-29', false, 'não bissexto'],
    ['2026-04-31', false, 'abril tem 30'],
    ['1900-01-01', true, 'limite de 1900'],
    ['1899-12-31', false, 'antes de 1900'],
    ['2026-11-17', true, 'hoje'],
    ['2026-11-18', false, 'amanhã'],
    ['2026-1-01', false, 'mês sem zero'],
    ['17/11/2026', false, 'formato BR'],
    ['', false, 'vazio'],
  ])('%s → %s (%s)', (iso, ok) => expect(dataValida(iso, hoje)).toBe(ok))
  it('null e undefined', () => {
    expect(dataValida(null)).toBe(false)
    expect(dataValida(undefined)).toBe(false)
  })
})

describe('CPF', () => {
  it.each(['529.982.247-25', '52998224725'])('válido: %s', (c) => expect(cpfValido(c)).toBe(true))
  it.each([
    ['dígito errado', '529.982.247-24'],
    ['todos iguais', '111.111.111-11'],
    ['zeros', '000.000.000-00'],
    ['curto', '5299822472'],
    ['longo', '529982247250'],
    ['vazio', ''],
  ])('inválido: %s', (_, c) => expect(cpfValido(c)).toBe(false))
})

describe('CNPJ (numérico e alfanumérico)', () => {
  it.each(['11.222.333/0001-81', '11222333000181', '12.ABC.345/01DE-35', '12abc34501de35'])(
    'válido: %s',
    (c) => expect(cnpjValido(c)).toBe(true),
  )
  it.each([
    ['dígito errado', '11.222.333/0001-82'],
    ['todos iguais', '00.000.000/0000-00'],
    ['letra no dígito verificador', '12.ABC.345/01DE-3A'],
    ['curto', '1122233300018'],
    ['vazio', ''],
  ])('inválido: %s', (_, c) => expect(cnpjValido(c)).toBe(false))
})

describe('idade', () => {
  const hoje = new Date(2026, 10, 17) // 17/11/2026, hora local
  it('faz aniversário hoje', () => expect(idade('1990-11-17', hoje)).toBe(36))
  it('aniversário amanhã', () => expect(idade('1990-11-18', hoje)).toBe(35))
  it('aniversário ontem', () => expect(idade('1990-11-16', hoje)).toBe(36))
  it('mês que vem', () => expect(idade('1990-12-01', hoje)).toBe(35))
  it('recém-nascido', () => expect(idade('2026-11-17', hoje)).toBe(0))
})

describe('podeCadastrar (R-001)', () => {
  it('nome e nascimento válidos bastam', () =>
    expect(podeCadastrar({ nome: 'Fulano', nascimento: '1990-01-01' })).toBe(true))
  it.each([
    ['sem nada', {}],
    ['só nome', { nome: 'Fulano' }],
    ['nome em branco', { nome: '  ', nascimento: '1990-01-01' }],
    ['nascimento inválido', { nome: 'Fulano', nascimento: '1990-02-30' }],
    ['nascimento nulo', { nome: 'Fulano', nascimento: null }],
  ])('bloqueia: %s', (_, d) => expect(podeCadastrar(d)).toBe(false))
})

describe('hojeNaClinica (fuso de Brasília)', () => {
  it('23h em Brasília ainda é o mesmo dia, mesmo já sendo amanhã em UTC', () => {
    expect(hojeNaClinica(new Date('2026-11-18T02:00:00Z'))).toBe('2026-11-17')
  })
  it('meia-noite em Brasília vira o dia', () => {
    expect(hojeNaClinica(new Date('2026-11-18T03:00:00Z'))).toBe('2026-11-18')
  })
})

describe('cadastroDesatualizado (1 ano sem atualizar)', () => {
  const alterado = '2025-11-17T12:00:00Z'
  it('exatamente 1 ano → desatualizado', () =>
    expect(cadastroDesatualizado(alterado, new Date('2026-11-17T12:00:00Z'))).toBe(true))
  it('1 minuto antes de 1 ano → em dia', () =>
    expect(cadastroDesatualizado(alterado, new Date('2026-11-17T11:59:00Z'))).toBe(false))
  it('aceita Date', () =>
    expect(cadastroDesatualizado(new Date(alterado), new Date('2027-01-01T00:00:00Z'))).toBe(true))
})

describe('máscaras', () => {
  it.each([
    ['', ''],
    ['123', '123'],
    ['12345', '12345-'],
    ['12345678', '12345-678'],
    ['12345-6789', '12345-678'],
    ['ab12c', '12'],
  ])('CEP "%s" → "%s"', (v, m) => expect(mascaraCep(v)).toBe(m))
  it('CEP apagando não devolve o hífen', () => expect(mascaraCep('12345', true)).toBe('12345'))

  it.each([
    ['', ''],
    ['529', '529.'],
    ['52998224725', '529.982.247-25'],
  ])('CPF "%s" → "%s"', (v, m) => expect(mascaraCpf(v)).toBe(m))
  it('CPF: a máscara é idempotente', () => {
    const m = mascaraCpf('52998224725')
    expect(mascaraCpf(m)).toBe(m)
  })

  it.each([
    ['11222333000181', '11.222.333/0001-81'],
    ['12abc34501de35', '12.ABC.345/01DE-35'],
    ['11.222.333/0001-81999', '11.222.333/0001-81'],
    ['11', '11.'],
  ])('CNPJ "%s" → "%s"', (v, m) => expect(mascaraCnpj(v)).toBe(m))

  it('RG: 8 dígitos 00.000.000; 9 alfanuméricos 000.000.000', () => {
    expect(mascaraRg('12345678')).toBe('12.345.678')
    expect(mascaraRg('12345678x')).toBe('123.456.78x')
  })

  it.each([
    ['11987654321', '+55 (11) 98765-4321'],
    ['(11) 98765-4321', '+55 (11) 98765-4321'],
    ['+55 11987654321999', '+55 (11) 98765-4321'],
    ['+55 ', '+55 '],
    ['+1 2025550123', '+1 (20) 25550-123'],
  ])('celular "%s" → "%s"', (v, m) => expect(mascaraCelular(v)).toBe(m))
  it('celular apagando não devolve o hífen', () => {
    expect(mascaraCelular('+55 (11) 98765-', true)).toBe('+55 (11) 98765')
  })
  it.each([
    ['', true],
    ['+55 ', true],
    ['+55 (', true],
    ['+', true],
    ['+55 (1', false],
    ['11', false],
  ])('celularVazio("%s") → %s', (v, ok) => expect(celularVazio(v)).toBe(ok))

  // ReDoS: com três \s* seguidos, 200 mil espaços (cabem no corpo de 200 KB) travavam a API por dias.
  it('responde na hora com um campo enorme de espaços', () => {
    const t = performance.now()
    expect(celularVazio(' '.repeat(200_000) + '!')).toBe(false)
    expect(celularVazio('+55' + ' '.repeat(200_000) + '(' + ' '.repeat(200_000))).toBe(true)
    expect(performance.now() - t).toBeLessThan(100)
  })
})

describe('dinheiro', () => {
  const br = (c: number) => reais(c).replace(/\s/g, ' ')
  it.each([
    [0, 'R$ 0,00'],
    [1, 'R$ 0,01'],
    [100, 'R$ 1,00'],
    [123456, 'R$ 1.234,56'],
    [100000000, 'R$ 1.000.000,00'],
  ])('reais(%i) → %s', (c, t) => expect(br(c)).toBe(t))
  it.each([
    ['1', 1],
    ['100', 100],
    ['R$ 1.234,56', 123456],
    ['', 0],
    ['abc', 0],
    ['123456789012345', 12345678901],
  ])('centavosDeDigitos("%s") → %i (R-055)', (t, c) => expect(centavosDeDigitos(t)).toBe(c))
  it('digitar e formatar: ida e volta', () => {
    for (const c of [0, 1, 99, 100, 12345, 999999]) expect(centavosDeDigitos(reais(c))).toBe(c)
  })
  it('formas e categorias sem repetição', () => {
    expect(new Set(FORMAS).size).toBe(FORMAS.length)
    expect(new Set(CATEGORIAS).size).toBe(CATEGORIAS.length)
  })
})
