import { describe, expect, it } from 'vitest'
import { cpfValido, dataValida, idade, normalizar, podeCadastrar } from '../../shared/regras'
import { pode } from '../../shared/permissoes'
import { clicarHorario, ladoALado, paraHora } from '../../shared/agenda'
import { agruparProcedimentos, facesDoDente, normalizarFaces } from '../../shared/prontuario'
import { descontoDoPercentual, percentualDoDesconto } from '../../shared/orcamentos'

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

describe('encaixe na grade do dia', () => {
  const a = (id: number, inicio: string, fim: string) => ({ id, inicio, fim })
  it('consultas sobrepostas dividem a coluna e a que entrou depois é encaixe', () => {
    const r = ladoALado([a(1, '09:30', '10:00'), a(2, '09:30', '10:00'), a(3, '11:00', '11:30')])
    expect(r.get(1)).toEqual({ coluna: 0, colunas: 2, encaixe: false })
    expect(r.get(2)).toEqual({ coluna: 1, colunas: 2, encaixe: true })
    expect(r.get(3)).toEqual({ coluna: 0, colunas: 1, encaixe: false })
  })
  it('reaproveita a coluna livre e encostar no fim não é encaixe', () => {
    const r = ladoALado([a(1, '09:00', '10:00'), a(2, '09:15', '09:30'), a(3, '09:30', '09:45')])
    expect(r.get(2)).toEqual({ coluna: 1, colunas: 2, encaixe: true })
    expect(r.get(3)).toEqual({ coluna: 1, colunas: 2, encaixe: true })
    const s = ladoALado([a(1, '09:00', '09:30'), a(2, '09:30', '10:00')])
    expect(s.get(2)).toEqual({ coluna: 0, colunas: 1, encaixe: false })
  })
})

describe('escolher horários no modal por cliques', () => {
  // Horário n do dia (1 = 08:15...): "o 5", "o 7" como no exemplo da clínica.
  const H = (n: number) => paraHora(8 * 60 + 15 * n)
  const livre = () => false
  const clicar = (cliques: number[], ocupado: (a: string, b: string) => boolean = livre) =>
    cliques.reduce((s, n) => clicarHorario(s, H(n), ocupado), {
      inicio: '',
      ultimo: '',
      clicado: '',
    })
  const faixa = (a: number, b: number | '', c: number) => ({
    inicio: H(a),
    ultimo: b === '' ? '' : H(b),
    clicado: H(c),
  })

  it('dois cliques fazem a faixa, em qualquer ordem', () => {
    expect(clicar([5])).toEqual(faixa(5, '', 5))
    expect(clicar([5, 7])).toEqual(faixa(5, 7, 7))
    expect(clicar([19, 15])).toEqual(faixa(15, 19, 15))
  })
  it('clique fora da faixa aumenta até ele; clicar de novo no último ativo limpa', () => {
    expect(clicar([5, 7, 4])).toEqual(faixa(4, 7, 4))
    expect(clicar([5, 7, 9])).toEqual(faixa(5, 9, 9))
    expect(clicar([5, 7, 4, 4])).toEqual({ inicio: '', ultimo: '', clicado: '' })
    expect(clicar([5, 5])).toEqual({ inicio: '', ultimo: '', clicado: '' })
  })
  it('clique dentro da faixa recomeça a seleção ali', () => {
    expect(clicar([8, 14, 12])).toEqual(faixa(12, '', 12))
    expect(clicar([8, 14, 8])).toEqual(faixa(8, '', 8))
  })
  it('faixa que passaria por horário ocupado recomeça no clique', () => {
    const ocupado7 = (a: string, b: string) => a <= H(7) && H(7) <= b
    expect(clicar([5, 9], ocupado7)).toEqual(faixa(9, '', 9))
    expect(clicar([8, 10, 5], ocupado7)).toEqual(faixa(5, '', 5))
  })
})

describe('faces do dente no odontograma', () => {
  it('segue a posição na tela: esquerda, centro, direita, cervical, baixo, cima', () => {
    expect(facesDoDente('61')).toEqual(['M', 'I', 'D', 'C', 'P', 'V'])
    expect(facesDoDente('55')).toEqual(['D', 'O', 'M', 'C', 'P', 'V'])
    expect(facesDoDente('36')).toEqual(['M', 'O', 'D', 'C', 'V', 'L'])
    expect(facesDoDente('83')).toEqual(['D', 'I', 'M', 'C', 'V', 'L'])
  })
  it('várias faces viram uma sigla só, na ordem padrão', () => {
    expect(normalizarFaces('ilm')).toBe('LMI')
  })
  it('o mesmo lançamento em vários dentes vira um grupo só', () => {
    const base = {
      origem: 'CLINICO',
      nome: 'Resina',
      status: 'EXECUTADO',
      data: '2026-10-30',
      profissional: { id: 1 },
      observacao: null,
      observacaoPaciente: null,
      orcamentoId: null,
    }
    const grupos = agruparProcedimentos([
      { ...base, dente: '11' },
      { ...base, dente: '21' },
      { ...base, status: 'EXISTENTE', dente: '11' },
    ])
    expect(grupos.map((g) => g.map((i) => i.dente))).toEqual([['11', '21'], ['11']])
  })
})

describe('desconto do orçamento em R$ ou %', () => {
  it('% vira centavos arredondados, e o valor fixo mostra o % equivalente', () => {
    expect(descontoDoPercentual(33333, 10)).toBe(3333)
    expect(descontoDoPercentual(30000, 12.5)).toBe(3750)
    expect(percentualDoDesconto(30000, 3000)).toBe(10)
    expect(percentualDoDesconto(30000, 1000)).toBe(3.33)
    expect(percentualDoDesconto(0, 1000)).toBe(0)
  })
})
