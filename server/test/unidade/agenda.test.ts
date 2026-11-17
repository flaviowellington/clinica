// Regras da agenda (shared/agenda.ts): grade, status, validação, sobreposição e seleção.
import { describe, expect, it } from 'vitest'
import {
  CATEGORIAS,
  COM_CHECKIN,
  HORARIOS,
  INTERVALO,
  STATUS,
  celulasEntre,
  clicarHorario,
  diaComExpediente,
  fimPadrao,
  ladoALado,
  lerHorariosSemana,
  minutosDeEspera,
  paraHora,
  paraMinutos,
  proximoStatus,
  validarAgendamento,
  type StatusAgenda,
} from '../../../shared/agenda'

describe('grade de horários (R-021, R-029)', () => {
  it('40 horários de 08:00 a 17:45, de 15 em 15', () => {
    expect(HORARIOS).toHaveLength(40)
    expect(HORARIOS[0]).toBe('08:00')
    expect(HORARIOS.at(-1)).toBe('17:45')
    for (let i = 1; i < HORARIOS.length; i++)
      expect(paraMinutos(HORARIOS[i]) - paraMinutos(HORARIOS[i - 1])).toBe(INTERVALO)
  })
  it('paraMinutos e paraHora são inversos', () => {
    for (const h of HORARIOS) expect(paraHora(paraMinutos(h))).toBe(h)
    expect(paraMinutos('00:00')).toBe(0)
    expect(paraHora(0)).toBe('00:00')
    expect(paraHora(23 * 60 + 59)).toBe('23:59')
  })
  it('fimPadrao: um intervalo depois do início (R-033)', () => {
    expect(fimPadrao('08:00')).toBe('08:15')
    expect(fimPadrao('17:45')).toBe('18:00')
  })
})

describe('diaComExpediente (R-083)', () => {
  it.each([
    ['2026-11-15', false, 'domingo'],
    ['2026-11-16', true, 'segunda'],
    ['2026-11-21', true, 'sábado'],
    ['2026-11-22', false, 'domingo'],
  ])('%s → %s (%s)', (d, esperado) => expect(diaComExpediente(d)).toBe(esperado))
})

describe('status do atendimento', () => {
  it('sete status, todos com rótulo e cor #rrggbb', () => {
    expect(Object.keys(STATUS)).toHaveLength(7)
    for (const s of Object.values(STATUS)) expect(s.cor).toMatch(/^#[0-9a-f]{6}$/)
  })
  it('cores diferentes entre si (não confundir na grade)', () => {
    const cores = Object.values(STATUS).map((s) => s.cor)
    expect(new Set(cores).size).toBe(cores.length)
  })
  it.each<[StatusAgenda, StatusAgenda | null]>([
    ['AGENDADO', 'EM_ESPERA'],
    ['CONFIRMADO', 'EM_ESPERA'],
    ['ATRASADO', 'EM_ESPERA'],
    ['FALTOU', 'EM_ESPERA'],
    ['EM_ESPERA', 'EM_ATENDIMENTO'],
    ['EM_ATENDIMENTO', 'ATENDIDO'],
    ['ATENDIDO', null],
  ])('próximo de %s → %s', (s, prox) => expect(proximoStatus(s)?.status ?? null).toBe(prox))
  it('rótulos dos botões', () => {
    expect(proximoStatus('AGENDADO')?.rotulo).toBe('Paciente chegou')
    expect(proximoStatus('EM_ESPERA')?.rotulo).toBe('Chamar para atendimento')
    expect(proximoStatus('EM_ATENDIMENTO')?.rotulo).toBe('Finalizar atendimento')
  })
  it('com check-in: em espera, em atendimento e atendido (R-034)', () => {
    expect([...COM_CHECKIN].sort()).toEqual(['ATENDIDO', 'EM_ATENDIMENTO', 'EM_ESPERA'])
  })
  it('categorias com cor válida', () => {
    for (const c of Object.values(CATEGORIAS)) expect(c).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('minutosDeEspera', () => {
  const chegada = new Date('2026-11-17T13:00:00Z')
  it('conta minutos inteiros', () => {
    expect(minutosDeEspera(chegada, new Date('2026-11-17T13:31:59Z'))).toBe(31)
  })
  it('aceita texto ISO', () => {
    expect(minutosDeEspera('2026-11-17T13:00:00Z', new Date('2026-11-17T14:00:00Z'))).toBe(60)
  })
  it('chegada no futuro (relógio adiantado) → 0', () => {
    expect(minutosDeEspera(chegada, new Date('2026-11-17T12:00:00Z'))).toBe(0)
  })
})

describe('validarAgendamento', () => {
  const ok = {
    data: '2026-11-16',
    inicio: '09:00',
    fim: '09:30',
    profissionalId: 1,
    pacienteId: 2,
  }
  it('agendamento completo é válido', () => expect(validarAgendamento(ok)).toEqual({}))
  it('sem fim também é válido', () => expect(validarAgendamento({ ...ok, fim: null })).toEqual({}))
  it.each([
    ['data vazia', { data: null }, 'data', 'Informe a data.'],
    ['data no formato BR', { data: '16/11/2026' }, 'data', 'Informe a data.'],
    ['domingo', { data: '2026-11-15' }, 'data', 'A clínica não abre neste dia.'],
    ['início antes do expediente', { inicio: '07:45' }, 'inicio', 'Escolha um horário.'],
    ['início fora da grade', { inicio: '09:10' }, 'inicio', 'Escolha um horário.'],
    ['início depois do último', { inicio: '18:00', fim: '18:30' }, 'inicio', 'Escolha um horário.'],
    ['fim igual ao início', { fim: '09:00' }, 'fim', 'O fim precisa ser depois do início.'],
    ['fim antes do início', { fim: '08:30' }, 'fim', 'O fim precisa ser depois do início.'],
    ['sem profissional', { profissionalId: null }, 'profissionalId', 'Escolha o profissional.'],
    ['sem paciente', { pacienteId: null }, 'pacienteId', 'Escolha o paciente.'],
  ])('%s', (_, mudanca, campo, msg) => {
    expect(validarAgendamento({ ...ok, ...mudanca })).toEqual({ [campo]: msg })
  })
  it('compromisso não precisa de paciente, mas precisa de título', () => {
    const c = { ...ok, tipo: 'COMPROMISSO', pacienteId: null }
    expect(validarAgendamento({ ...c, titulo: 'Reunião' })).toEqual({})
    expect(validarAgendamento({ ...c, titulo: '   ' })).toEqual({
      titulo: 'Informe o que é o compromisso.',
    })
  })
  it('tudo vazio: todos os erros de uma vez', () => {
    expect(Object.keys(validarAgendamento({})).sort()).toEqual([
      'data',
      'inicio',
      'pacienteId',
      'profissionalId',
    ])
  })
})

describe('ladoALado: agendamentos sobrepostos dividem a coluna', () => {
  it('dois sobrepostos e um separado', () => {
    const r = ladoALado([
      { id: 1, inicio: '09:00', fim: '10:00' },
      { id: 2, inicio: '09:30', fim: '10:30' },
      { id: 3, inicio: '11:00', fim: '11:30' },
    ])
    expect(r.get(1)).toEqual({ coluna: 0, colunas: 2, encaixe: false })
    expect(r.get(2)).toEqual({ coluna: 1, colunas: 2, encaixe: true })
    expect(r.get(3)).toEqual({ coluna: 0, colunas: 1, encaixe: false })
  })
  it('um termina quando o outro começa: não sobrepõe', () => {
    const r = ladoALado([
      { id: 1, inicio: '09:00', fim: '09:30' },
      { id: 2, inicio: '09:30', fim: '10:00' },
    ])
    expect(r.get(1)).toEqual({ coluna: 0, colunas: 1, encaixe: false })
    expect(r.get(2)).toEqual({ coluna: 0, colunas: 1, encaixe: false })
  })
  it('reaproveita a coluna que ficou livre dentro do grupo', () => {
    const r = ladoALado([
      { id: 1, inicio: '09:00', fim: '10:00' },
      { id: 2, inicio: '09:00', fim: '09:30' },
      { id: 3, inicio: '09:30', fim: '10:00' },
    ])
    expect(r.get(3)).toEqual({ coluna: 1, colunas: 2, encaixe: true })
  })
  it('a ordem de entrada não importa', () => {
    const itens = [
      { id: 2, inicio: '09:30', fim: '10:30' },
      { id: 1, inicio: '09:00', fim: '10:00' },
    ]
    expect(ladoALado(itens)).toEqual(ladoALado([...itens].reverse()))
  })
  it('três ao mesmo tempo → três colunas', () => {
    const r = ladoALado([1, 2, 3].map((id) => ({ id, inicio: '10:00', fim: '11:00' })))
    expect([...r.values()].map((x) => [x.coluna, x.colunas])).toEqual([
      [0, 3],
      [1, 3],
      [2, 3],
    ])
  })
  it('lista vazia', () => expect(ladoALado([]).size).toBe(0))
})

describe('clicarHorario: escolher a faixa no modal', () => {
  const vazio = { inicio: '', ultimo: '', clicado: '' }
  const livre = () => false
  it('primeiro clique começa a faixa', () => {
    expect(clicarHorario(vazio, '09:00', livre)).toEqual({
      inicio: '09:00',
      ultimo: '',
      clicado: '09:00',
    })
  })
  it('segundo clique fecha a faixa (depois ou antes do primeiro)', () => {
    const um = { inicio: '09:00', ultimo: '', clicado: '09:00' }
    expect(clicarHorario(um, '10:00', livre)).toEqual({
      inicio: '09:00',
      ultimo: '10:00',
      clicado: '10:00',
    })
    expect(clicarHorario(um, '08:00', livre)).toEqual({
      inicio: '08:00',
      ultimo: '09:00',
      clicado: '08:00',
    })
  })
  const faixa = { inicio: '09:00', ultimo: '10:00', clicado: '10:00' }
  it('clicar de novo no último limpa tudo', () => {
    expect(clicarHorario(faixa, '10:00', livre)).toEqual(vazio)
  })
  it('clique depois da faixa aumenta até ali', () => {
    expect(clicarHorario(faixa, '11:00', livre)).toEqual({
      inicio: '09:00',
      ultimo: '11:00',
      clicado: '11:00',
    })
  })
  it('clique antes da faixa aumenta para trás', () => {
    expect(clicarHorario(faixa, '08:00', livre)).toEqual({
      inicio: '08:00',
      ultimo: '10:00',
      clicado: '08:00',
    })
  })
  it('clique dentro da faixa recomeça ali', () => {
    expect(clicarHorario(faixa, '09:30', livre)).toEqual({
      inicio: '09:30',
      ultimo: '',
      clicado: '09:30',
    })
  })
  it('faixa que passaria por horário ocupado recomeça no clique', () => {
    expect(clicarHorario(faixa, '11:00', () => true)).toEqual({
      inicio: '11:00',
      ultimo: '',
      clicado: '11:00',
    })
  })
  it('a conferência de ocupado recebe a faixa ordenada', () => {
    const pedidos: [string, string][] = []
    clicarHorario({ inicio: '10:00', ultimo: '', clicado: '10:00' }, '09:00', (a, b) => {
      pedidos.push([a, b])
      return false
    })
    expect(pedidos).toEqual([['09:00', '10:00']])
  })
})

describe('semana fixa (horários fechados)', () => {
  it('limpa, tira repetidos e ordena', () => {
    expect(lerHorariosSemana(['2-09:00', '1-08:00', '1-08:00'])).toEqual(['1-08:00', '2-09:00'])
  })
  it('lista vazia é válida', () => expect(lerHorariosSemana([])).toEqual([]))
  it.each([
    ['não é lista', 'x'],
    ['domingo (0)', ['0-08:00']],
    ['dia 7', ['7-08:00']],
    ['fora da grade', ['1-08:10']],
    ['depois do expediente', ['1-18:00']],
    ['não é texto', [108]],
    ['grande demais', Array.from({ length: 6 * 40 + 1 }, () => '1-08:00')],
  ])('recusa: %s', (_, v) => expect(lerHorariosSemana(v)).toBeNull())

  it('celulasEntre: retângulo entre dois cliques, em qualquer ordem', () => {
    const esperado = ['1-08:30', '1-08:45', '1-09:00', '2-08:30', '2-08:45', '2-09:00']
    expect(celulasEntre('1-08:30', '2-09:00')).toEqual(esperado)
    expect(celulasEntre('2-09:00', '1-08:30')).toEqual(esperado)
    expect(celulasEntre('2-08:30', '1-09:00')).toEqual(esperado)
  })
  it('celulasEntre: mesma célula → uma só', () => {
    expect(celulasEntre('3-10:00', '3-10:00')).toEqual(['3-10:00'])
  })
  it('semana inteira = 6 × 40 células', () => {
    expect(celulasEntre('1-08:00', '6-17:45')).toHaveLength(240)
  })
})
