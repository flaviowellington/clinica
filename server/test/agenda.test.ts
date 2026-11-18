import { describe, expect, it } from 'vitest'
import { db } from '../src/db'
import { entrarComo, PACIENTE, urlBase, usarServidor, type Cliente } from './ajuda'
import { HORARIOS } from '../../shared/agenda'
import { atualizarAtrasos } from '../src/agenda'
import { hojeNaClinica } from '../../shared/regras'

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
    expect(HORARIOS).toHaveLength(40)
    expect([HORARIOS[0], HORARIOS[1], HORARIOS.at(-1)]).toEqual(['08:00', '08:15', '17:45'])
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

describe('status automáticos: Atrasado e Faltou', () => {
  it('confirmada sem chegar: atrasa no horário e falta 1 h depois; o resto não muda', async () => {
    const api = await entrarComo('RECEPCAO')
    const { marcar } = await preparar(api)
    const caso = async (data: string, inicio: string, status: string) => {
      const { corpo } = await marcar()
      await db.agendamento.update({
        where: { id: corpo.id },
        data: { data: new Date(`${data}T00:00:00Z`), inicio, status: status as 'AGENDADO' },
      })
      return corpo.id as number
    }
    const ids = {
      atrasa: await caso('2026-11-16', '13:00', 'CONFIRMADO'),
      falta: await caso('2026-11-16', '12:15', 'CONFIRMADO'),
      atrasadoFalta: await caso('2026-11-16', '12:30', 'ATRASADO'),
      ontem: await caso('2026-11-15', '17:00', 'CONFIRMADO'),
      cedo: await caso('2026-11-16', '14:00', 'CONFIRMADO'),
      agendado: await caso('2026-11-16', '12:00', 'AGENDADO'),
      espera: await caso('2026-11-16', '12:00', 'EM_ESPERA'),
    }
    // 13:30 em São Paulo.
    expect(await atualizarAtrasos(new Date('2026-11-16T13:30:00-03:00'))).toBe(4)
    const status = async (id: number) =>
      (await db.agendamento.findUnique({ where: { id } }))!.status
    expect(await status(ids.atrasa)).toBe('ATRASADO')
    expect(await status(ids.falta)).toBe('FALTOU')
    expect(await status(ids.atrasadoFalta)).toBe('FALTOU')
    expect(await status(ids.ontem)).toBe('FALTOU')
    expect(await status(ids.cedo)).toBe('CONFIRMADO')
    expect(await status(ids.agendado)).toBe('AGENDADO')
    expect(await status(ids.espera)).toBe('EM_ESPERA')
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
  it('Financeiro mexe na agenda como a recepção', async () => {
    const recepcao = await entrarComo('RECEPCAO')
    const { marcar } = await preparar(recepcao)
    const { corpo: c } = await marcar()
    const fin = await entrarComo('FINANCEIRO')
    expect((await fin('GET', `/api/agenda?de=${SEGUNDA}&ate=${SEGUNDA}`)).corpo).toHaveLength(1)
    expect(
      (await fin('PATCH', `/api/agenda/${c.id}/status`, { status: 'CONFIRMADO' })).status,
    ).toBe(200)
  })
})

describe('tempo real', () => {
  it('quem está ouvindo recebe o aviso quando outro marca uma consulta', async () => {
    const api = await entrarComo('RECEPCAO')
    expect((await fetch(urlBase() + '/api/eventos')).status).toBe(401) // só logado
    const { marcar } = await preparar(api) // antes de ouvir: criar o paciente também avisa
    const ouvindo = await fetch(urlBase() + '/api/eventos', { headers: { cookie: api.cookie } })
    const leitor = ouvindo.body!.getReader()
    await leitor.read() // "retry" inicial: a conexão está aberta

    expect((await marcar()).status).toBe(201)
    const { value } = await leitor.read()
    expect(new TextDecoder().decode(value)).toContain('"assunto":"agenda"')
    await leitor.cancel()
  })
  it('avisa também quando muda paciente e configurações; leitura não avisa', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    const ouvindo = await fetch(urlBase() + '/api/eventos', { headers: { cookie: api.cookie } })
    const leitor = ouvindo.body!.getReader()
    await leitor.read()
    const proximo = async () => new TextDecoder().decode((await leitor.read()).value)

    await api('GET', '/api/pacientes')
    expect((await api('POST', '/api/pacientes', PACIENTE)).status).toBe(201)
    expect(await proximo()).toContain('"assunto":"pacientes"') // o GET antes não gerou aviso
    const cats = (await api('GET', '/api/configuracoes/categorias')).corpo
    expect((await api('PUT', '/api/configuracoes/categorias', cats)).status).toBe(200)
    expect(await proximo()).toContain('"assunto":"config"')
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

/** Abre o /api/eventos com o login e vai juntando o que chega. */
async function ouvir(cookie: string) {
  const ctrl = new AbortController()
  const r = await fetch(`${urlBase()}/api/eventos`, { headers: { cookie }, signal: ctrl.signal })
  let texto = ''
  const leitor = r.body!.getReader()
  void (async () => {
    try {
      for (;;) {
        const { value, done } = await leitor.read()
        if (done) return
        texto += new TextDecoder().decode(value)
      }
    } catch {
      /* fechou */
    }
  })()
  return { texto: () => texto, fechar: () => ctrl.abort() }
}

describe('chamar o paciente avisa a recepção', () => {
  it('só quem é da recepção recebe, com o nome do paciente e do profissional', async () => {
    const recepcao = await entrarComo('RECEPCAO')
    const financeiro = await entrarComo('FINANCEIRO')
    const { dentista, marcar } = await preparar(recepcao)
    const { corpo: a } = await marcar()
    await recepcao('PATCH', `/api/agenda/${a.id}/status`, { status: 'EM_ESPERA' })

    const naRecepcao = await ouvir(recepcao.cookie)
    const noFinanceiro = await ouvir(financeiro.cookie)
    await new Promise((r) => setTimeout(r, 100)) // conexões registradas
    const chamou = await recepcao('POST', `/api/agenda/${a.id}/chamar`)
    expect(chamou.status).toBe(200)
    // Chamado fica pendente na espera até a recepção confirmar.
    expect(chamou.corpo.status).toBe('EM_ESPERA')
    expect(chamou.corpo.chamadoEm).toBeTruthy()
    await new Promise((r) => setTimeout(r, 200))
    naRecepcao.fechar()
    noFinanceiro.fechar()

    const chamado = JSON.stringify({
      assunto: 'chamado',
      paciente: PACIENTE.nome,
      profissional: dentista.nome,
    })
    expect(naRecepcao.texto()).toContain(chamado)
    expect(noFinanceiro.texto()).not.toContain('chamado')
    expect(noFinanceiro.texto()).toContain('"assunto":"agenda"')
  })

  it('a recepção confirma que chamou: vira "Em atendimento" e o chamado some', async () => {
    const recepcao = await entrarComo('RECEPCAO')
    const { marcar } = await preparar(recepcao)
    const { corpo: a } = await marcar()
    expect((await recepcao('POST', `/api/agenda/${a.id}/chamar`)).status).toBe(400) // não chegou
    await recepcao('PATCH', `/api/agenda/${a.id}/status`, { status: 'EM_ESPERA' })
    await recepcao('POST', `/api/agenda/${a.id}/chamar`)
    const r = await recepcao('PATCH', `/api/agenda/${a.id}/status`, { status: 'EM_ATENDIMENTO' })
    expect(r.corpo.status).toBe('EM_ATENDIMENTO')
    expect(r.corpo.chamadoEm).toBeNull()
  })

  it('não avisa em outras trocas de status', async () => {
    const recepcao = await entrarComo('RECEPCAO')
    const { marcar } = await preparar(recepcao)
    const { corpo: a } = await marcar()
    const ouvindo = await ouvir(recepcao.cookie)
    await new Promise((r) => setTimeout(r, 100))
    await recepcao('PATCH', `/api/agenda/${a.id}/status`, { status: 'EM_ATENDIMENTO' }) // não estava na espera
    await new Promise((r) => setTimeout(r, 200))
    ouvindo.fechar()
    expect(ouvindo.texto()).not.toContain('chamado')
  })

  it('quem perde a recepção para de receber, e quem é inativado perde a conexão', async () => {
    const admin = await entrarComo('ADMINISTRADOR')
    const recepcao = await entrarComo('RECEPCAO')
    const outra = await entrarComo('RECEPCAO')
    const { marcar } = await preparar(recepcao)
    const { corpo: a } = await marcar()
    await recepcao('PATCH', `/api/agenda/${a.id}/status`, { status: 'EM_ESPERA' })

    const tirada = await ouvir(recepcao.cookie)
    const inativada = await ouvir(outra.cookie)
    await new Promise((r) => setTimeout(r, 100))
    const editar = (u: typeof recepcao.usuario, perfis: string[], ativo = true) =>
      admin('PUT', `/api/usuarios/${u.id}`, {
        nome: u.nome,
        email: `${u.login}@exemplo.com`,
        perfis,
        ativo,
      })
    expect((await editar(recepcao.usuario, ['FINANCEIRO'])).status).toBe(200)
    expect((await editar(outra.usuario, ['RECEPCAO'], false)).status).toBe(200)
    await admin('POST', `/api/agenda/${a.id}/chamar`)
    await new Promise((r) => setTimeout(r, 200))
    tirada.fechar()
    inativada.fechar()

    expect(tirada.texto()).toContain('"assunto":"config"') // recarrega as próprias permissões
    expect(tirada.texto()).not.toContain('chamado')
    expect(inativada.texto()).not.toContain('chamado')
  })
})

describe('sala de espera: check-in de consulta de qualquer dia', () => {
  /** Consulta direto no banco: a API não deixa marcar no passado. */
  async function consultas(api: Awaited<ReturnType<typeof entrarComo>>, dias: number[]) {
    const dentista = await db.pessoa.create({
      data: { tipo: 'PROFISSIONAL', nome: 'Dra. Espera', nomeBusca: 'dra. espera' },
    })
    const { corpo: paciente } = await api('POST', '/api/pacientes', PACIENTE)
    const hoje = new Date(`${hojeNaClinica()}T00:00:00Z`)
    const lista = await Promise.all(
      dias.map((d, i) =>
        db.agendamento.create({
          data: {
            data: new Date(hoje.getTime() + d * 86_400_000),
            inicio: HORARIOS[i % HORARIOS.length],
            fim: HORARIOS[(i % HORARIOS.length) + 1] ?? '18:00',
            profissionalId: dentista.id,
            pacienteId: paciente.id,
            criadoPorId: api.usuario.id,
          },
        }),
      ),
    )
    return { dentista, ids: lista.map((a) => a.id) }
  }
  const naEspera = async (api: Cliente, dentistaId: number) =>
    (
      (await api('GET', '/api/agenda/espera')).corpo as {
        id: number
        profissional: { id: number }
        chamadoEm: string | null
      }[]
    ).filter((a) => a.profissional.id === dentistaId)

  it('consultas de ontem, hoje e amanhã aparecem juntas, todas', async () => {
    const recepcao = await entrarComo('RECEPCAO')
    const { dentista, ids } = await consultas(recepcao, [-1, 0, 1, 7, -30])
    for (const id of ids)
      expect(
        (await recepcao('PATCH', `/api/agenda/${id}/status`, { status: 'EM_ESPERA' })).status,
      ).toBe(200)
    expect((await naEspera(recepcao, dentista.id)).map((a) => a.id).sort()).toEqual([...ids].sort())
  })

  it('check-in antigo (de outro dia) não fica preso na sala', async () => {
    const recepcao = await entrarComo('RECEPCAO')
    const { dentista, ids } = await consultas(recepcao, [-1])
    await db.agendamento.update({
      where: { id: ids[0] },
      data: { status: 'EM_ESPERA', checkinEm: new Date(Date.now() - 2 * 86_400_000) },
    })
    expect(await naEspera(recepcao, dentista.id)).toEqual([])
  })

  it('permutações caóticas: o que a API diz bate com o modelo depois de cada rodada', async () => {
    const recepcao = await entrarComo('RECEPCAO')
    const outraRecepcao = await entrarComo('RECEPCAO')
    const { dentista, ids } = await consultas(recepcao, [-2, -1, 0, 0, 1, 3])
    const quem = [recepcao, outraRecepcao]
    // Sorteio com semente: falhou, dá para repetir igual.
    let semente = Number(process.env.SEMENTE ?? 20261117)
    const sorte = (n: number) => (semente = (semente * 1103515245 + 12345) % 2 ** 31) % n
    type Estado = { status: string; chamado: boolean }
    const modelo = new Map<number, Estado>(
      ids.map((id) => [id, { status: 'AGENDADO', chamado: false }]),
    )
    const acoes = ['chegou', 'chamar', 'confirmar', 'voltar', 'finalizar'] as const

    for (let rodada = 0; rodada < 25; rodada++) {
      // Rajada: várias ações ao mesmo tempo, cada uma num agendamento diferente.
      const alvos = [...ids].sort(() => sorte(3) - 1).slice(0, 1 + sorte(ids.length))
      await Promise.all(
        alvos.map(async (id) => {
          const api = quem[sorte(2)]
          const acao = acoes[sorte(acoes.length)]
          const m = modelo.get(id)!
          if (acao === 'chamar') {
            const r = await api('POST', `/api/agenda/${id}/chamar`)
            if (m.status === 'EM_ESPERA') {
              expect(r.status, `rodada ${rodada}: chamar ${id}`).toBe(200)
              m.chamado = true
            } else expect(r.status, `rodada ${rodada}: chamar ${id} fora da espera`).toBe(400)
            return
          }
          const status = {
            chegou: 'EM_ESPERA',
            confirmar: 'EM_ATENDIMENTO',
            voltar: 'AGENDADO',
            finalizar: 'ATENDIDO',
          }[acao]
          const r = await api('PATCH', `/api/agenda/${id}/status`, { status })
          expect(r.status, `rodada ${rodada}: ${acao} ${id}`).toBe(200)
          if (status !== 'EM_ESPERA') m.chamado = false
          m.status = status
        }),
      )
      const espera = await naEspera(outraRecepcao, dentista.id)
      const esperado = ids.filter((id) => modelo.get(id)!.status === 'EM_ESPERA').sort()
      expect(espera.map((a) => a.id).sort(), `rodada ${rodada}`).toEqual(esperado)
      for (const a of espera)
        expect(!!a.chamadoEm, `rodada ${rodada}: chamado de ${a.id}`).toBe(
          modelo.get(a.id)!.chamado,
        )
    }
  })
})
