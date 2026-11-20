// Preço de criança ou de adulto pela idade do paciente (Configurações › Procedimentos: "Criança até").
import { describe, expect, it } from 'vitest'
import { db } from '../src/db'
import { entrarComo, usarServidor, type Cliente } from './ajuda'
import { idade, precoPara } from '../../shared/orcamentos'

usarServidor()

const selante = { valorCentavos: 25000, valorCriancaCentavos: 29000, valorAdultoCentavos: 25000 }

describe('precoPara', () => {
  it('idade em anos completos', () => {
    expect(idade('2014-11-20', '2026-11-19')).toBe(11)
    expect(idade('2014-11-19', '2026-11-19')).toBe(12)
  })
  it('até a idade máxima (inclusive) é criança; sem nascimento é adulto', () => {
    expect(precoPara(selante, '2014-11-19', 12, '2026-11-19')).toBe(29000)
    expect(precoPara(selante, '2013-11-19', 12, '2026-11-19')).toBe(25000)
    expect(precoPara(selante, null, 12, '2026-11-19')).toBe(25000)
  })
  it('faixa sem preço usa o da outra', () => {
    const soCrianca = {
      valorCentavos: 39000,
      valorCriancaCentavos: 39000,
      valorAdultoCentavos: null,
    }
    expect(precoPara(soCrianca, '1990-01-01', 12, '2026-11-19')).toBe(39000)
    const soAdulto = {
      valorCentavos: 80000,
      valorCriancaCentavos: null,
      valorAdultoCentavos: 80000,
    }
    expect(precoPara(soAdulto, '2020-01-01', 12, '2026-11-19')).toBe(80000)
  })
})

async function preparar(api: Cliente) {
  const dentista = await db.pessoa.create({
    data: { tipo: 'PROFISSIONAL', nome: 'Dra. Teste', nomeBusca: 'dra. teste' },
  })
  const p = await db.procedimento.create({
    data: { nome: 'Selante fictício', nomeBusca: 'selante ficticio', ...selante },
  })
  const paciente = async (nome: string, nascimento?: string) =>
    (await api('POST', '/api/pacientes', { nome, nascimento })).corpo
  const orcar = async (pacienteId: number, extra: Record<string, unknown> = {}) =>
    (
      await api('POST', '/api/orcamentos', {
        pacienteId,
        profissionalId: dentista.id,
        itens: [{ procedimentoId: p.id, dente: '16', ...extra }],
      })
    ).corpo.itens[0].valorCentavos
  return { paciente, orcar }
}

describe('orçamento usa o preço da idade do paciente', () => {
  it('criança, adulto e sem nascimento; a idade máxima vem da configuração', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    const { paciente, orcar } = await preparar(api)
    const ano = Number(new Date().toISOString().slice(0, 4))
    const crianca = await paciente('Criança Fictícia', `${ano - 8}-01-01`)
    const adulto = await paciente('Adulto Fictício', '1990-01-01')
    // O cadastro pela tela pede nascimento; o importado pode vir sem.
    const semData = await db.pessoa.create({
      data: { tipo: 'PACIENTE', nome: 'Sem Data Fictício', nomeBusca: 'sem data ficticio' },
    })
    expect(await orcar(crianca.id)).toBe(29000)
    expect(await orcar(adulto.id)).toBe(25000)
    expect(await orcar(semData.id)).toBe(25000)
    await api('PUT', '/api/configuracoes/faixaEtaria', { criancaAte: 5 })
    expect(await orcar(crianca.id)).toBe(25000)
    // Valor digitado no orçamento continua valendo (R-012).
    expect(await orcar(crianca.id, { valorCentavos: 100 })).toBe(100)
  })
})
