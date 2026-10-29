import { describe, expect, it } from 'vitest'
import { db } from '../src/db'
import { entrarComo, PACIENTE, urlBase, usarServidor, type Cliente } from './ajuda'
import { HORARIOS } from '../../shared/agenda'

usarServidor()

/** Próxima segunda-feira, para não cair no domingo nem em "hoje". */
function proximaSegunda() {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7))
  return d.toISOString().slice(0, 10)
}
const SEGUNDA = proximaSegunda()

async function preparar(api: Cliente) {
  const dentista = await db.pessoa.create({
    data: { tipo: 'PROFISSIONAL', nome: 'Dra. Teste', nomeBusca: 'dra. teste' },
  })
  const { corpo: paciente } = await api('POST', '/api/pacientes', PACIENTE)
  const marcar = (extra: Record<string, unknown> = {}) =>
    api('POST', '/api/agenda', {
      data: SEGUNDA,
      inicio: '17:00',
      profissionalId: dentista.id,
      pacienteId: paciente.id,
      ...extra,
    })
  return { dentista, paciente, marcar }
}

describe('PT-21 e PT-83 grade de 15 min no expediente', () => {
  it('48 horários de 8:00 a 19:45', () => {
    expect(HORARIOS).toHaveLength(48)
    expect([HORARIOS[0], HORARIOS[1], HORARIOS.at(-1)]).toEqual(['08:00', '08:15', '19:45'])
  })
  it('recusa domingo e horário fora da grade', async () => {
    const api = await entrarComo('RECEPCAO')
    const { marcar } = await preparar(api)
    const domingo = new Date(`${SEGUNDA}T12:00:00Z`)
    domingo.setUTCDate(domingo.getUTCDate() - 1)
    const r1 = await marcar({ data: domingo.toISOString().slice(0, 10) })
    expect(r1.status).toBe(400)
    expect(r1.corpo.erros.data).toBeTruthy()
    const r2 = await marcar({ inicio: '20:00' })
    expect(r2.corpo.erros.inicio).toBeTruthy()
  })
})

describe('PT-29, PT-33 e PT-27 criar consulta', () => {
  it('grava paciente, profissional, horário, categoria; dura um intervalo; avisos em "Não enviar"', async () => {
    const api = await entrarComo('RECEPCAO')
    const { marcar, dentista, paciente } = await preparar(api)
    const r = await marcar({ categoria: 'Avaliação', observacoes: 'Dor no dente' })
    expect(r.status).toBe(201)
    expect(r.corpo).toMatchObject({
      data: SEGUNDA,
      inicio: '17:00',
      fim: '17:15',
      categoria: 'Avaliação',
      status: 'AGENDADO',
      confirmacao: 'NAO_ENVIAR',
      alerta: 'NAO_ENVIAR',
      profissional: { id: dentista.id },
      paciente: { id: paciente.id, nome: PACIENTE.nome },
      criadoPor: { nome: api.usuario.nome },
    })
  })
  it('não marca consulta para paciente inativo', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    const { marcar, paciente } = await preparar(api)
    await db.pessoa.update({ where: { id: paciente.id }, data: { ativo: false } })
    expect((await marcar()).status).toBe(400)
  })
})

describe('PT-63 compromisso', () => {
  it('bloqueia a agenda do profissional sem paciente', async () => {
    const api = await entrarComo('PROFISSIONAL')
    const { marcar } = await preparar(api)
    const r = await marcar({
      tipo: 'COMPROMISSO',
      pacienteId: null,
      titulo: 'Reunião',
      fim: '18:00',
    })
    expect(r.status).toBe(201)
    expect(r.corpo).toMatchObject({
      tipo: 'COMPROMISSO',
      titulo: 'Reunião',
      paciente: null,
      fim: '18:00',
    })
  })
})

describe('PT-20 listar por período e profissional', () => {
  it('filtra pelas datas e pelos profissionais escolhidos', async () => {
    const api = await entrarComo('RECEPCAO')
    const { marcar, dentista } = await preparar(api)
    const outro = await db.pessoa.create({
      data: { tipo: 'PROFISSIONAL', nome: 'Dr. Outro', nomeBusca: 'dr. outro' },
    })
    await marcar()
    await marcar({ profissionalId: outro.id, inicio: '09:00' })
    const todos = await api('GET', `/api/agenda?de=${SEGUNDA}&ate=${SEGUNDA}`)
    expect(todos.corpo.map((a: { inicio: string }) => a.inicio)).toEqual(['09:00', '17:00'])
    const so = await api(
      'GET',
      `/api/agenda?de=${SEGUNDA}&ate=${SEGUNDA}&profissionais=${dentista.id}`,
    )
    expect(so.corpo).toHaveLength(1)
    const antes = await api('GET', '/api/agenda?de=2000-01-01&ate=2000-01-07')
    expect(antes.corpo).toEqual([])
  })
  it('lista os profissionais para o filtro', async () => {
    const api = await entrarComo('RECEPCAO')
    await preparar(api)
    const r = await api('GET', '/api/agenda/profissionais')
    expect(r.corpo.profissionais.map((p: { nome: string }) => p.nome)).toEqual(['Dra. Teste'])
  })
})

describe('PT-30 e PT-31 status e check-in', () => {
  it('"Em espera" grava check-in e início da espera; voltar a "Agendado" limpa', async () => {
    const api = await entrarComo('RECEPCAO')
    const { marcar } = await preparar(api)
    const { corpo: c } = await marcar()
    const espera = await api('PATCH', `/api/agenda/${c.id}/status`, { status: 'EM_ESPERA' })
    expect(espera.corpo.status).toBe('EM_ESPERA')
    expect(espera.corpo.checkinEm).toBeTruthy()
    expect(espera.corpo.esperaInicio).toBeTruthy()
    const volta = await api('PATCH', `/api/agenda/${c.id}/status`, { status: 'AGENDADO' })
    expect(volta.corpo.checkinEm).toBeNull()
  })
  it('recusa status que não existe', async () => {
    const api = await entrarComo('RECEPCAO')
    const { marcar } = await preparar(api)
    const { corpo: c } = await marcar()
    expect((await api('PATCH', `/api/agenda/${c.id}/status`, { status: 'XYZ' })).status).toBe(400)
  })
})

describe('PT-34 e PT-86 excluir consulta', () => {
  it('com check-in não exclui; sem check-in some da agenda', async () => {
    const api = await entrarComo('RECEPCAO')
    const { marcar } = await preparar(api)
    const { corpo: c } = await marcar()
    await api('PATCH', `/api/agenda/${c.id}/status`, { status: 'EM_ESPERA' })
    expect((await api('DELETE', `/api/agenda/${c.id}`)).status).toBe(409)

    await api('PATCH', `/api/agenda/${c.id}/status`, { status: 'AGENDADO' })
    expect((await api('DELETE', `/api/agenda/${c.id}`)).status).toBe(200)
    const lista = await api('GET', `/api/agenda?de=${SEGUNDA}&ate=${SEGUNDA}`)
    expect(lista.corpo).toEqual([])
    // Exclusão lógica: o registro continua no banco.
    expect(await db.agendamento.count()).toBe(1)
  })
})

describe('PT-85 mover consulta', () => {
  it('muda data, horário e profissional mantendo a duração', async () => {
    const api = await entrarComo('RECEPCAO')
    const { marcar } = await preparar(api)
    const outro = await db.pessoa.create({
      data: { tipo: 'PROFISSIONAL', nome: 'Dr. Outro', nomeBusca: 'dr. outro' },
    })
    const { corpo: c } = await marcar({ fim: '17:30' })
    const r = await api('PUT', `/api/agenda/${c.id}/horario`, {
      data: SEGUNDA,
      inicio: '10:00',
      profissionalId: outro.id,
    })
    expect(r.corpo).toMatchObject({ inicio: '10:00', fim: '10:30', profissional: { id: outro.id } })
  })
})

describe('permissões da agenda', () => {
  it('Financeiro só visualiza', async () => {
    const recepcao = await entrarComo('RECEPCAO')
    const { marcar } = await preparar(recepcao)
    const { corpo: c } = await marcar()
    const fin = await entrarComo('FINANCEIRO')
    expect((await fin('GET', `/api/agenda?de=${SEGUNDA}&ate=${SEGUNDA}`)).corpo).toHaveLength(1)
    expect((await fin('DELETE', `/api/agenda/${c.id}`)).status).toBe(403)
    expect(
      (await fin('PATCH', `/api/agenda/${c.id}/status`, { status: 'CONFIRMADO' })).status,
    ).toBe(403)
  })
})

describe('tempo real', () => {
  it('quem está ouvindo recebe o aviso quando outro marca uma consulta', async () => {
    const api = await entrarComo('RECEPCAO')
    expect((await fetch(urlBase() + '/api/eventos')).status).toBe(401) // só logado
    const ouvindo = await fetch(urlBase() + '/api/eventos', { headers: { cookie: api.cookie } })
    const leitor = ouvindo.body!.getReader()
    await leitor.read() // "retry" inicial: a conexão está aberta

    const { marcar } = await preparar(api)
    expect((await marcar()).status).toBe(201)
    const { value } = await leitor.read()
    expect(new TextDecoder().decode(value)).toContain('"assunto":"agenda"')
    await leitor.cancel()
  })
})

describe('categorias da agenda criadas pela clínica', () => {
  it('quem marca consulta cria categoria com nome e cor e já pode usá-la', async () => {
    const api = await entrarComo('RECEPCAO')
    const r = await api('POST', '/api/agenda/categorias', { nome: ' Clareamento ', cor: '#FF00AA' })
    expect(r.status).toBe(201)
    expect(r.corpo).toMatchObject({ Avaliação: '#0ea5e9', Clareamento: '#ff00aa' })
    const lidas = await api('GET', '/api/configuracoes/categorias')
    expect(lidas.corpo.Clareamento).toBe('#ff00aa')
    const { marcar } = await preparar(api)
    expect((await marcar({ categoria: 'Clareamento' })).corpo.categoria).toBe('Clareamento')
  })
  it('recusa nome repetido (sem olhar acento e maiúsculas), vazio e cor inválida', async () => {
    const api = await entrarComo('RECEPCAO')
    for (const corpo of [
      { nome: 'avaliacao', cor: '#123456' },
      { nome: '  ', cor: '#123456' },
      { nome: 'Nova', cor: 'vermelho' },
    ])
      expect((await api('POST', '/api/agenda/categorias', corpo)).status).toBe(400)
  })
  it('categoria que não existe não é gravada na consulta', async () => {
    const api = await entrarComo('RECEPCAO')
    const { marcar } = await preparar(api)
    expect((await marcar({ categoria: 'Inventada' })).corpo.categoria).toBeNull()
  })
})
