// Retornos inclusos no procedimento: nascem ao executar e são usados ao marcar consulta.
import { describe, expect, it } from 'vitest'
import { db } from '../src/db'
import { entrarComo, PACIENTE, usarServidor, type Cliente } from './ajuda'
import { somarPrazo } from '../../shared/agenda'
import { hojeNaClinica } from '../../shared/regras'

usarServidor()

/** Próxima segunda-feira, para não cair no domingo nem em "hoje". */
function proximaSegunda() {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7))
  return d.toISOString().slice(0, 10)
}

async function preparar(api: Cliente, extra: Record<string, unknown> = {}) {
  const dentista = await db.pessoa.create({
    data: { tipo: 'PROFISSIONAL', nome: 'Dra. Teste', nomeBusca: 'dra. teste' },
  })
  const { corpo: paciente } = await api('POST', '/api/pacientes', PACIENTE)
  const placa = await db.procedimento.create({
    data: {
      nome: 'Placa fictícia',
      nomeBusca: 'placa ficticia',
      valorCentavos: 180000,
      retornos: 2,
      alertaRetorno: 15,
      alertaRetornoUnidade: 'DIAS',
      ...extra,
    },
  })
  const saldo = async () =>
    (await api('GET', `/api/retornos/saldo?pacienteId=${paciente.id}`)).corpo as {
      id: number
      nome: string
      restantes: number
    }[]
  return { dentista, paciente, placa, saldo }
}

describe('somarPrazo', () => {
  it('soma dias e meses; mês curto fica no último dia', () => {
    expect(somarPrazo('2026-01-20', 15, 'DIAS')).toBe('2026-02-04')
    expect(somarPrazo('2026-01-31', 1, 'MESES')).toBe('2026-02-28')
    expect(somarPrazo('2026-11-15', 6, 'MESES')).toBe('2027-05-15')
  })
})

describe('executar procedimento com retornos e alerta', () => {
  it('orçamento: um lançamento em vários dentes dá os retornos e o alerta uma vez só', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    const { dentista, paciente, placa, saldo } = await preparar(api)
    const o = await api('POST', '/api/orcamentos', {
      pacienteId: paciente.id,
      profissionalId: dentista.id,
      itens: [
        { procedimentoId: placa.id, dente: '16' },
        { procedimentoId: placa.id, dente: '17' },
      ],
    })
    const executar = (i: { id: number }) => api('POST', `/api/orcamentos/itens/${i.id}/executar`)
    await Promise.all(o.corpo.itens.map(executar))
    // Desfazer e executar de novo não dá retorno nem alerta a mais.
    await executar(o.corpo.itens[0])
    await executar(o.corpo.itens[0])
    expect(await saldo()).toMatchObject([{ nome: 'Placa fictícia', restantes: 2 }])
    const alertas = await db.alertaRetorno.findMany({ where: { pacienteId: paciente.id } })
    expect(alertas).toHaveLength(1)
    expect(alertas[0]).toMatchObject({
      profissionalId: dentista.id,
      motivo: 'Retorno: Placa fictícia',
    })
    expect(alertas[0].data.toISOString().slice(0, 10)).toBe(somarPrazo(hojeNaClinica(), 15, 'DIAS'))
  })

  it('prontuário: executado direto conta da data do procedimento', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    const { dentista, paciente, placa, saldo } = await preparar(api, {
      alertaRetorno: 6,
      alertaRetornoUnidade: 'MESES',
    })
    await api('POST', `/api/pacientes/${paciente.id}/procedimentos`, {
      procedimentoId: placa.id,
      profissionalId: dentista.id,
      status: 'EXECUTADO',
      data: '2026-11-15',
      dentes: [{ dente: '16' }, { dente: '17' }],
    })
    const [alerta] = await db.alertaRetorno.findMany({ where: { pacienteId: paciente.id } })
    expect(alerta.data.toISOString().slice(0, 10)).toBe('2027-05-15')
    expect(await saldo()).toMatchObject([{ restantes: 2 }])
  })

  it('a realizar não dá nada; mudar para executado dá', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    const { dentista, paciente, placa, saldo } = await preparar(api)
    const r = await api('POST', `/api/pacientes/${paciente.id}/procedimentos`, {
      procedimentoId: placa.id,
      profissionalId: dentista.id,
      status: 'EXISTENTE',
      dente: '16',
    })
    expect(await saldo()).toEqual([])
    const mudou = await api('PUT', `/api/prontuario/procedimentos/${r.corpo.id}`, {
      procedimentoId: placa.id,
      profissionalId: dentista.id,
      status: 'EXECUTADO',
      dente: '16',
    })
    expect(mudou.status).toBe(200)
    expect(await saldo()).toMatchObject([{ restantes: 2 }])
    expect(await db.alertaRetorno.count({ where: { pacienteId: paciente.id } })).toBe(1)
  })

  it('procedimento sem retornos nem alerta não cria nada', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    const { dentista, paciente, placa, saldo } = await preparar(api, {
      retornos: null,
      alertaRetorno: null,
      alertaRetornoUnidade: null,
    })
    await api('POST', `/api/pacientes/${paciente.id}/procedimentos`, {
      procedimentoId: placa.id,
      profissionalId: dentista.id,
      status: 'EXECUTADO',
    })
    expect(await saldo()).toEqual([])
    expect(await db.alertaRetorno.count()).toBe(0)
  })
})

describe('marcar consulta usando o retorno', () => {
  it('gasta um retorno, aparece na consulta e volta ao desmarcar', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    const { dentista, paciente, placa, saldo } = await preparar(api, { retornos: 1 })
    await api('POST', `/api/pacientes/${paciente.id}/procedimentos`, {
      procedimentoId: placa.id,
      profissionalId: dentista.id,
      status: 'EXECUTADO',
    })
    const [credito] = await saldo()
    const marcar = (inicio: string) =>
      api('POST', '/api/agenda', {
        data: proximaSegunda(),
        inicio,
        profissionalId: dentista.id,
        pacienteId: paciente.id,
        retornoId: credito.id,
      })
    const a = await marcar('09:00')
    expect(a.status).toBe(201)
    expect(a.corpo.retorno).toMatchObject({ nome: 'Placa fictícia' })
    expect(await saldo()).toEqual([])
    // Acabou: não marca outro com o mesmo retorno.
    expect((await marcar('10:00')).status).toBe(400)
    await api('POST', `/api/agenda/${a.corpo.id}/desmarcar`, { motivo: 'Paciente viajou' })
    expect(await saldo()).toMatchObject([{ restantes: 1 }])
  })

  it('retorno de outro paciente é recusado', async () => {
    const api = await entrarComo('RECEPCAO')
    const { dentista, placa } = await preparar(api)
    const outro = await db.pessoa.create({
      data: { tipo: 'PACIENTE', nome: 'Outra Pessoa', nomeBusca: 'outra pessoa' },
    })
    const credito = await db.retornoProcedimento.create({
      data: { chave: 'teste', pacienteId: outro.id, procedimentoId: placa.id, nome: 'X', total: 3 },
    })
    const { corpo: paciente } = await api('POST', '/api/pacientes', {
      ...PACIENTE,
      nome: 'Mais Um',
    })
    const r = await api('POST', '/api/agenda', {
      data: proximaSegunda(),
      inicio: '09:00',
      profissionalId: dentista.id,
      pacienteId: paciente.id,
      retornoId: credito.id,
    })
    expect(r.status).toBe(400)
    expect(r.corpo.erros.retornoId).toBeTruthy()
  })
})

describe('retornos do orçamento aprovado', () => {
  it('nascem na aprovação; rejeitar tira os que sobram e os usados ficam', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    const { dentista, paciente, placa, saldo } = await preparar(api)
    const { corpo: o } = await api('POST', '/api/orcamentos', {
      pacienteId: paciente.id,
      profissionalId: dentista.id,
      itens: [{ procedimentoId: placa.id, dente: '16' }],
    })
    await api('POST', `/api/orcamentos/${o.id}/aprovar`)
    const [credito] = await saldo()
    expect(credito).toMatchObject({ nome: 'Placa fictícia', restantes: 2 })
    const consulta = await api('POST', '/api/agenda', {
      data: proximaSegunda(),
      inicio: '09:00',
      profissionalId: dentista.id,
      pacienteId: paciente.id,
      retornoId: credito.id,
    })
    expect(consulta.status).toBe(201)

    const r = await api('POST', `/api/orcamentos/${o.id}/rejeitar`, { senha: 'senha-de-teste' })
    expect(r.status).toBe(200)
    expect(await saldo()).toEqual([])
    const usada = await db.agendamento.findUnique({ where: { id: consulta.corpo.id } })
    expect(usada!.retornoId).toBe(credito.id)

    // Aprovar de novo devolve o que faltava; executar depois não dá a mais e cria o alerta.
    await api('POST', `/api/orcamentos/${o.id}/aprovar`)
    expect(await saldo()).toMatchObject([{ restantes: 1 }])
    await api('POST', `/api/orcamentos/itens/${o.itens[0].id}/executar`)
    expect(await saldo()).toMatchObject([{ restantes: 1 }])
    expect(await db.alertaRetorno.count({ where: { pacienteId: paciente.id } })).toBe(1)
  })
})
