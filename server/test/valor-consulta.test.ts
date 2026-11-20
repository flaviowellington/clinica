// Valor da consulta do profissional: atender o paciente gera um orçamento só com a consulta.
import { describe, expect, it } from 'vitest'
import { db } from '../src/db'
import { entrarComo, PACIENTE, usarServidor, type Cliente } from './ajuda'

usarServidor()

function proximaSegunda() {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7))
  return d.toISOString().slice(0, 10)
}

async function consulta(api: Cliente, valorConsultaCentavos: number | null, extra = {}) {
  const dentista = await api('POST', '/api/profissionais', {
    nome: 'Dra. Fictícia',
    valorConsultaCentavos,
  })
  expect(dentista.status).toBe(201)
  expect(dentista.corpo.valorConsultaCentavos).toBe(valorConsultaCentavos)
  const { corpo: paciente } = await api('POST', '/api/pacientes', PACIENTE)
  const a = await api('POST', '/api/agenda', {
    data: proximaSegunda(),
    inicio: '09:00',
    profissionalId: dentista.corpo.id,
    pacienteId: paciente.id,
    ...extra,
  })
  const status = (s: string) => api('PATCH', `/api/agenda/${a.corpo.id}/status`, { status: s })
  const orcamentos = () =>
    db.orcamento.findMany({ where: { pacienteId: paciente.id }, include: { itens: true } })
  return { dentista: dentista.corpo, paciente, status, orcamentos }
}

describe('valor da consulta', () => {
  it('atendido gera um orçamento em aberto com a consulta, uma vez só', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    const { dentista, status, orcamentos } = await consulta(api, 25000)
    expect((await status('ATENDIDO')).status).toBe(200)
    // Voltar e atender de novo não duplica.
    await status('EM_ATENDIMENTO')
    await status('ATENDIDO')
    const lista = await orcamentos()
    expect(lista).toHaveLength(1)
    expect(lista[0]).toMatchObject({ status: 'ABERTO', profissionalId: dentista.id })
    expect(lista[0].itens).toMatchObject([{ nome: 'Consulta', valorCentavos: 25000 }])
  })

  it('sem valor não gera orçamento', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    const sem = await consulta(api, null)
    await sem.status('ATENDIDO')
    expect(await sem.orcamentos()).toHaveLength(0)
  })

  it('editar o profissional grava o valor', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    const { dentista } = await consulta(api, null)
    const r = await api('PUT', `/api/profissionais/${dentista.id}`, {
      nome: dentista.nome,
      valorConsultaCentavos: 18000,
    })
    expect(r.corpo.valorConsultaCentavos).toBe(18000)
  })
})
