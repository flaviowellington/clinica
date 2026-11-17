// Funções soltas do front: datas, CPF, erros da API e avisos.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AxiosError, AxiosHeaders } from 'axios'
import { cpfBR, dataBR, errosDosCampos, isoLocal, mensagemDeErro, somarDias } from '../src/api'
import { avisar, useAvisos } from '../src/estado'
import { ABAS } from '../src/abas'

const erroDaApi = (status: number, data: unknown) =>
  new AxiosError('falhou', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: '',
    data,
    headers: {},
    config: { headers: new AxiosHeaders() },
  })

describe('datas', () => {
  it.each([
    ['2026-11-17', '17/11/2026'],
    ['2026-11-17T23:59:00Z', '17/11/2026'],
    [null, ''],
  ])('dataBR(%s) → "%s"', (iso, br) => expect(dataBR(iso)).toBe(br))

  it('isoLocal usa o dia local (sem passar por UTC)', () => {
    expect(isoLocal(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(isoLocal(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31')
  })
  it.each([
    ['2026-12-31', 1, '2027-01-01'],
    ['2026-03-01', -1, '2026-02-28'],
    ['2028-02-28', 1, '2028-02-29'],
    ['2026-11-17', 0, '2026-11-17'],
    ['2026-11-17', 30, '2026-12-17'],
  ])('somarDias(%s, %i) → %s', (iso, n, r) => expect(somarDias(iso, n)).toBe(r))
})

describe('cpfBR', () => {
  it('formata 11 dígitos', () => expect(cpfBR('52998224725')).toBe('529.982.247-25'))
  it('vazio', () => expect(cpfBR(null)).toBe(''))
})

describe('erros da API', () => {
  it('mensagem que o servidor mandou', () => {
    expect(mensagemDeErro(erroDaApi(400, { erro: 'Paciente já cadastrado.' }))).toBe(
      'Paciente já cadastrado.',
    )
  })
  it('sem resposta: sem conexão', () => {
    expect(mensagemDeErro(new AxiosError('Network Error', 'ERR_NETWORK'))).toBe(
      'Sem conexão com o servidor. Tente de novo.',
    )
  })
  it('erro que não é da API', () => {
    expect(mensagemDeErro(new Error('x'))).toBe('Erro inesperado.')
    expect(mensagemDeErro('texto')).toBe('Erro inesperado.')
  })
  it('erros por campo', () => {
    expect(
      errosDosCampos(erroDaApi(400, { erro: 'x', erros: { nome: 'Informe o nome.' } })),
    ).toEqual({
      nome: 'Informe o nome.',
    })
    expect(errosDosCampos(erroDaApi(500, {}))).toEqual({})
    expect(errosDosCampos(new Error('x'))).toEqual({})
  })
})

describe('avisar (avisos no canto da tela)', () => {
  afterEach(() => vi.useRealTimers())
  it('aparece e some sozinho depois do tempo', () => {
    vi.useFakeTimers()
    avisar('Paciente cadastrado', false, 1000)
    expect(useAvisos.getState().avisos.map((a) => a.texto)).toContain('Paciente cadastrado')
    vi.advanceTimersByTime(1001)
    expect(useAvisos.getState().avisos.map((a) => a.texto)).not.toContain('Paciente cadastrado')
  })
  it('aviso de erro fica marcado', () => {
    vi.useFakeTimers()
    avisar('Falhou', true)
    expect(useAvisos.getState().avisos.at(-1)).toMatchObject({ texto: 'Falhou', erro: true })
  })
})

describe('menu por perfil (abas.ts)', () => {
  it('administrador vê todos os módulos', () => {
    expect(ABAS.every((a) => a.visivel(['ADMINISTRADOR']))).toBe(true)
  })
  it('sem perfil, nenhum módulo', () => {
    expect(ABAS.filter((a) => a.visivel([]))).toEqual([])
  })
  it('recepção não vê Usuários nem Configurações', () => {
    const vistas = ABAS.filter((a) => a.visivel(['RECEPCAO'])).map((a) => a.para)
    expect(vistas).not.toContain('/usuarios')
    expect(vistas).not.toContain('/configuracoes')
    expect(vistas).toContain('/pacientes')
  })
  it('endereços sem repetir', () => {
    expect(new Set(ABAS.map((a) => a.para)).size).toBe(ABAS.length)
  })
})
