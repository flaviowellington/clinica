import { describe, expect, it } from 'vitest'
import { db } from '../src/db'
import { entrarComo, usarServidor } from './ajuda'

usarServidor()

type Item = { tipo: string; id: number; titulo: string; paciente: string | null; excluidoPor: string | null }

/** Paciente, profissional e um registro excluído de cada tipo, criados direto no banco. */
async function preparar(quem: number) {
  const excluido = { excluidoEm: new Date(), excluidoPorId: quem }
  const pessoa = (tipo: 'PACIENTE' | 'PROFISSIONAL', nome: string, extra = {}) =>
    db.pessoa.create({ data: { tipo, nome, nomeBusca: nome.toLowerCase(), ...extra } })
  const pac = await pessoa('PACIENTE', 'Ana Fictícia')
  const prof = await pessoa('PROFISSIONAL', 'Dr. Teste')
  await pessoa('PACIENTE', 'Bruno Excluído', excluido)
  await pessoa('PROFISSIONAL', 'Dra. Excluída', { ...excluido, ativo: false })
  const base = { pacienteId: pac.id, criadoPorId: quem }
  const proc = await db.procedimento.create({
    data: { nome: 'Limpeza', nomeBusca: 'limpeza', valorCentavos: 1000 },
  })
  await db.agendamento.create({
    data: { ...base, ...excluido, profissionalId: prof.id, data: new Date('2026-11-10'), inicio: '09:00', fim: '09:30' },
  })
  await db.orcamento.create({
    data: {
      ...base, ...excluido, profissionalId: prof.id,
      itens: { create: { procedimentoId: proc.id, nome: 'Limpeza', valorCentavos: 1000 } },
    },
  })
  await db.trabalhoProtetico.create({
    data: { ...base, ...excluido, profissionalId: prof.id, laboratorio: 'Lab', trabalho: 'Coroa' },
  })
  await db.procedimentoClinico.create({
    data: { ...base, ...excluido, profissionalId: prof.id, nome: 'Restauração', status: 'EXECUTADO', data: new Date('2026-11-01') },
  })
  const ficha = await db.fichaEspecialidade.create({
    data: { ...base, ...excluido, profissionalId: prof.id, especialidade: 'Ortodontia' },
  })
  await db.itemFichaEspecialidade.create({
    data: { fichaId: ficha.id, dente: '11', procedimento: 'Bráquete', status: 'A realizar', excluidoEm: new Date() },
  })
  await db.documento.create({ data: { ...base, ...excluido, modelo: 'Atestado', titulo: 'Atestado', texto: 'x' } })
  await db.arquivo.create({
    data: { ...base, ...excluido, categoria: 'FOTO', nome: 'foto.jpg', tipo: 'image/jpeg', tamanho: 1, dados: new Uint8Array([1]) },
  })
  await db.lancamento.create({
    data: { ...base, ...excluido, data: new Date('2026-11-01'), tipo: 'SAIDA', valorCentavos: 500, descricao: 'Luz' },
  })
  await db.alertaRetorno.create({
    data: { ...base, profissionalId: prof.id, data: new Date('2026-12-01'), excluidoEm: new Date() },
  })
}

describe('PT-50 restaurar registros excluídos', () => {
  it('a lixeira lista tudo que foi excluído, de todos os tipos', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    await preparar(api.usuario.id)
    const r = await api('GET', '/api/lixeira')
    expect(r.status).toBe(200)
    const tipos = (r.corpo as Item[]).map((i) => i.tipo).sort()
    expect(tipos).toEqual(
      [
        'agendamento', 'arquivo', 'documento', 'ficha', 'itemFicha', 'lancamento',
        'orcamento', 'paciente', 'procedimento', 'profissional', 'protetico', 'retorno',
      ].sort(),
    )
    const consulta = (r.corpo as Item[]).find((i) => i.tipo === 'agendamento')!
    expect(consulta.paciente).toBe('Ana Fictícia')
    expect(consulta.excluidoPor).toBe(api.usuario.nome)
  })

  it('restaurar devolve o registro e ele sai da lixeira', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    await preparar(api.usuario.id)
    for (const i of (await api('GET', '/api/lixeira')).corpo as Item[])
      expect((await api('POST', `/api/lixeira/${i.tipo}/${i.id}/restaurar`)).status).toBe(200)
    expect((await api('GET', '/api/lixeira')).corpo).toEqual([])
    expect(await db.agendamento.count({ where: { excluidoEm: null } })).toBe(1)
    expect(await db.orcamento.count({ where: { excluidoEm: null } })).toBe(1)
  })

  it('tipo desconhecido ou registro fora da lixeira dá 404', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    expect((await api('POST', '/api/lixeira/usuario/1/restaurar')).status).toBe(404)
    expect((await api('POST', '/api/lixeira/agendamento/999999/restaurar')).status).toBe(404)
  })

  it('lançamento desfeito pela desaprovação do orçamento não aparece', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    const pac = await db.pessoa.create({ data: { tipo: 'PACIENTE', nome: 'C', nomeBusca: 'c' } })
    const prof = await db.pessoa.create({ data: { tipo: 'PROFISSIONAL', nome: 'D', nomeBusca: 'd' } })
    const o = await db.orcamento.create({
      data: { pacienteId: pac.id, profissionalId: prof.id, criadoPorId: api.usuario.id },
    })
    await db.lancamento.create({
      data: {
        data: new Date(), tipo: 'VENDA', valorCentavos: 1, descricao: 'Venda', orcamentoId: o.id,
        criadoPorId: api.usuario.id, excluidoEm: new Date(),
      },
    })
    expect((await api('GET', '/api/lixeira')).corpo).toEqual([])
  })

  it('procedimento lançado em vários dentes aparece e volta junto', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    const q = api.usuario.id
    const pac = await db.pessoa.create({ data: { tipo: 'PACIENTE', nome: 'Ana', nomeBusca: 'ana' } })
    const prof = await db.pessoa.create({ data: { tipo: 'PROFISSIONAL', nome: 'Dr', nomeBusca: 'dr' } })
    const quando = Date.now()
    const proc = (dente: string, nome = 'Restauração', ms = 0) =>
      db.procedimentoClinico.create({
        data: {
          pacienteId: pac.id, profissionalId: prof.id, criadoPorId: q, nome, dente, status: 'A_REALIZAR',
          data: new Date('2026-11-01'), excluidoEm: new Date(quando + ms), excluidoPorId: q,
        },
      })
    await proc('11')
    await proc('12', 'Restauração', 300)
    await proc('21', 'Restauração', 600)
    await proc('31', 'Canal') // outro lançamento
    await proc('41', 'Restauração', 3_600_000) // mesmo nome, excluído uma hora depois
    const ficha = await db.fichaEspecialidade.create({
      data: { pacienteId: pac.id, profissionalId: prof.id, criadoPorId: q, especialidade: 'Ortodontia' },
    })
    for (const dente of ['13', '14'])
      await db.itemFichaEspecialidade.create({
        data: { fichaId: ficha.id, dente, procedimento: 'Bráquete', status: 'A realizar', excluidoEm: new Date(quando) },
      })

    const lista = (await api('GET', '/api/lixeira')).corpo as (Item & { ids: number[]; detalhe: string })[]
    const procs = lista.filter((i) => i.tipo === 'procedimento')
    expect(procs.map((i) => i.ids.length).sort()).toEqual([1, 1, 3])
    const grupo = procs.find((i) => i.ids.length === 3)!
    expect(grupo.detalhe).toContain('11, 12, 21')
    expect(lista.filter((i) => i.tipo === 'itemFicha').map((i) => i.ids.length)).toEqual([2])

    expect((await api('POST', `/api/lixeira/procedimento/${grupo.id}/restaurar`)).status).toBe(200)
    expect(await db.procedimentoClinico.count({ where: { excluidoEm: null } })).toBe(3)
    const item = lista.find((i) => i.tipo === 'itemFicha')!
    await api('POST', `/api/lixeira/itemFicha/${item.id}/restaurar`)
    expect(await db.itemFichaEspecialidade.count({ where: { excluidoEm: null } })).toBe(2)
  })

  it('só o administrador vê e restaura', async () => {
    const api = await entrarComo('RECEPCAO')
    expect((await api('GET', '/api/lixeira')).status).toBe(403)
    expect((await api('POST', '/api/lixeira/agendamento/1/restaurar')).status).toBe(403)
  })
})
