import { describe, expect, it } from 'vitest'
import { mascaraCelular, mascaraCpf, mascaraRg } from '../../shared/mascaras'
import { celular, email, erroDe } from '../../shared/dtos'

describe('máscara de CPF', () => {
  it('põe pontos e hífen enquanto digita', () => {
    expect(mascaraCpf('123')).toBe('123.')
    expect(mascaraCpf('123456')).toBe('123.456.')
    expect(mascaraCpf('123456789')).toBe('123.456.789-')
    expect(mascaraCpf('52998224725')).toBe('529.982.247-25')
  })
  it('ao apagar não devolve o separador do fim', () => {
    expect(mascaraCpf('123', true)).toBe('123')
    expect(mascaraCpf('123.4', true)).toBe('123.4')
  })
  it('aceita no máximo 11 dígitos e ignora letras', () => {
    expect(mascaraCpf('529.982.247-251234')).toBe('529.982.247-25')
    expect(mascaraCpf('5a2b9')).toBe('529.')
  })
})

describe('máscara de RG', () => {
  it('agrupa 00.000.000 e aceita letras e símbolos', () => {
    expect(mascaraRg('12')).toBe('12.')
    expect(mascaraRg('12345')).toBe('12.345.')
    expect(mascaraRg('123456')).toBe('12.345.6')
    expect(mascaraRg('12345678')).toBe('12.345.678')
    expect(mascaraRg('123456789')).toBe('123.456.789')
    expect(mascaraRg('12.345.6789')).toBe('123.456.789')
    expect(mascaraRg('1234567890')).toBe('123.456.7890')
    expect(mascaraRg('12345678-X')).toBe('12.345.678-X')
    expect(mascaraRg('MG1234')).toBe('MG.123.4')
  })
  it('ao apagar não devolve o ponto do fim', () => {
    expect(mascaraRg('12', true)).toBe('12')
  })
})

describe('máscara de celular', () => {
  it('formata +55 (00) 00000-0000 digitando corrido', () => {
    expect(mascaraCelular('+55 1')).toBe('+55 (1')
    expect(mascaraCelular('+55 11')).toBe('+55 (11) ')
    expect(mascaraCelular('+55 (11) 98765')).toBe('+55 (11) 98765-')
    expect(mascaraCelular('+55 (11) 987654321')).toBe('+55 (11) 98765-4321')
  })
  it('com +55 bloqueia mais de 11 dígitos', () => {
    expect(mascaraCelular('+55 (11) 98765-43219999')).toBe('+55 (11) 98765-4321')
  })
  it('deixa trocar o DDI e então aceita mais dígitos', () => {
    expect(mascaraCelular('+351 (11) 98765-43210')).toBe('+351 (11) 98765-43210')
  })
  it('número antigo sem DDI ganha +55', () => {
    expect(mascaraCelular('11987654321')).toBe('+55 (11) 98765-4321')
  })
  it('ao apagar não devolve o separador do fim', () => {
    expect(mascaraCelular('+55 (11)', true)).toBe('+55 (11')
  })
})

describe('DTO de e-mail e celular (padrão dos formulários)', () => {
  it('celular: vazio ou só o DDI vale null; incompleto dá erro', () => {
    expect(celular.parse('+55 ')).toBeNull()
    expect(celular.parse('')).toBeNull()
    expect(celular.parse('+55 (11) 98765-4321')).toBe('+55 (11) 98765-4321')
    expect(celular.parse('(11) 3000-0000')).toBe('(11) 3000-0000')
    expect(celular.parse('+351 912 345 678')).toBe('+351 912 345 678')
    expect(erroDe(celular, '+55 (11) 9876')).toBe('Celular inválido.')
  })
  it('e-mail: aparado; sem domínio dá erro', () => {
    expect(email.parse('  a@b.co ')).toBe('a@b.co')
    expect(email.parse('')).toBeNull()
    expect(erroDe(email, 'a@b')).toBe('E-mail inválido.')
  })
})
