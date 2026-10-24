import { describe, expect, it } from 'vitest'
import { cpfValido, dataValida, idade, normalizar, podeCadastrar } from '../../shared/regras'
import { pode } from '../../shared/permissoes'

describe('PT-01 botão "Cadastrar paciente"', () => {
  it('fica desabilitado vazio ou só com o nome', () => {
    expect(podeCadastrar({})).toBe(false)
    expect(podeCadastrar({ nome: 'Paciente Teste' })).toBe(false)
    expect(podeCadastrar({ nome: '   ', nascimento: '1990-01-01' })).toBe(false)
  })
  it('habilita com nome e nascimento, sem CPF, telefone ou e-mail', () => {
    expect(podeCadastrar({ nome: 'Paciente Teste', nascimento: '1990-01-01' })).toBe(true)
  })
})

describe('regras de apoio', () => {
  it('data de nascimento precisa existir e não ser futura', () => {
    expect(dataValida('1990-02-30')).toBe(false)
    expect(dataValida('1899-12-31')).toBe(false)
    expect(dataValida('2999-01-01')).toBe(false)
    expect(dataValida('2000-02-29')).toBe(true)
  })
  it('CPF confere os dígitos verificadores', () => {
    expect(cpfValido('000.000.000-00')).toBe(false)
    expect(cpfValido('529.982.247-25')).toBe(true)
    expect(cpfValido('529.982.247-24')).toBe(false)
  })
  it('idade conta o aniversário', () => {
    const hoje = new Date(2026, 9, 23)
    expect(idade('1990-10-23', hoje)).toBe(36)
    expect(idade('1990-10-24', hoje)).toBe(35)
  })
  it('normaliza acento, caixa e espaços', () => {
    expect(normalizar('  JOSÉ   da  Conceição ')).toBe('jose da conceicao')
  })
  it('a permissão é a soma dos perfis', () => {
    expect(pode(['RECEPCAO'], 'paciente.excluir')).toBe(false)
    expect(pode(['RECEPCAO', 'PROFISSIONAL'], 'paciente.excluir')).toBe(true)
    expect(pode(['FINANCEIRO'], 'paciente.editar')).toBe(false)
  })
})

describe('data de hoje no horário da clínica', () => {
  it('às 22h de Brasília (01h UTC do dia seguinte) ainda é o mesmo dia', async () => {
    const { hojeNaClinica } = await import('../../shared/regras')
    expect(hojeNaClinica(new Date('2026-10-24T01:00:00Z'))).toBe('2026-10-23')
  })
})
