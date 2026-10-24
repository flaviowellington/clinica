// Alerta de retorno, desmarcação, orçamentos e o financeiro que sai deles.
import { describe, expect, it } from 'vitest'
import { db } from '../src/db'
import { entrarComo, PACIENTE, usarServidor, type Cliente } from './ajuda'
import { dividirParcelas, vencimentos } from '../../shared/orcamentos'

usarServidor()

const SEGUNDA = '2026-10-19'

async function base(api: Cliente) {
  const dentista = await db.pessoa.create({
    data: { tipo: 'PROFISSIONAL', nome: 'Dra. Teste', nomeBusca: 'dra. teste' },
  })
  const { corpo: paciente } = await api('POST', '/api/pacientes', PACIENTE)
  const resina = await db.procedimento.create({
    data: {
      nome: 'Restauração em resina',
      nomeBusca: 'restauracao em resina',
      valorCentavos: 30000,
    },
  })
  const limpeza = await db.procedimento.create({
    data: { nome: 'Limpeza (profilaxia)', nomeBusca: 'limpeza (profilaxia)', valorCentavos: 15000 },
  })
  return { dentista, paciente, resina, limpeza }
}

describe('PT-20 e E-008 alerta de retorno', () => {
  it('cria, lista os abertos do período e conclui', async () => {
    const api = await entrarComo('RECEPCAO')
    const { dentista, paciente } = await base(api)
    const r = await api('POST', '/api/retornos', {
      pacienteId: paciente.id,
      profissionalId: dentista.id,
      data: '2026-11-20',
      motivo: 'Revisão',
    })
    expect(r.status).toBe(201)
    const lista = await api('GET', '/api/retornos?de=2026-11-01&ate=2026-11-30')
    expect(lista.corpo).toMatchObject([{ data: '2026-11-20', paciente: { nome: PACIENTE.nome } }])
    await api('POST', `/api/retornos/${r.corpo.id}/concluir`)
    expect((await api('GET', '/api/retornos?de=2026-11-01&ate=2026-11-30')).corpo).toEqual([])
  })
})

describe('desmarcar consulta (C-005, R-034)', () => {
  it('libera o horário, guarda o motivo e não vale depois do check-in', async () => {
    const api = await entrarComo('RECEPCAO')
    const { dentista, paciente } = await base(api)
    const marcar = () =>
      api('POST', '/api/agenda', {
        data: SEGUNDA,
        inicio: '09:00',
        profissionalId: dentista.id,
        pacienteId: paciente.id,
      })
    const { corpo: a } = await marcar()
    const d = await api('POST', `/api/agenda/${a.id}/desmarcar`, { motivo: 'Paciente viajou' })
    expect(d.corpo).toMatchObject({ motivoDesmarcacao: 'Paciente viajou' })
    expect((await api('GET', `/api/agenda?de=${SEGUNDA}&ate=${SEGUNDA}`)).corpo).toEqual([])

    const { corpo: b } = await marcar()
    await api('PATCH', `/api/agenda/${b.id}/status`, { status: 'EM_ESPERA' })
    expect((await api('POST', `/api/agenda/${b.id}/desmarcar`, {})).status).toBe(409)
  })
})

describe('PT-15 parcelamento', () => {
  it('300,00 em 7 vezes soma exato e vence todo mês', () => {
    expect(dividirParcelas(30000, 7)).toEqual([4286, 4286, 4286, 4286, 4286, 4285, 4285])
    expect(vencimentos('2026-11-22', 3)).toEqual(['2026-11-22', '2026-12-22', '2027-01-22'])
    expect(vencimentos('2027-01-31', 2)).toEqual(['2027-01-31', '2027-02-28'])
  })
})

describe('PT-10 a PT-19 orçamento', () => {
  async function criar(api: Cliente, extra: Record<string, unknown> = {}) {
    const b = await base(api)
    const r = await api('POST', '/api/orcamentos', {
      pacienteId: b.paciente.id,
      profissionalId: b.dentista.id,
      itens: [
        { procedimentoId: b.resina.id, dente: '16' },
        { procedimentoId: b.limpeza.id, valorCentavos: 12000 },
      ],
      descontoCentavos: 2000,
      forma: 'Boleto',
      parcelas: 2,
      primeiroVencimento: '2026-11-22',
      ...extra,
    })
    return { ...b, r }
  }

  it('busca procedimento por qualquer parte do nome (R-013)', async () => {
    const api = await entrarComo('RECEPCAO')
    await base(api)
    const r = await api('GET', '/api/procedimentos?busca=PROFIL')
    expect(r.corpo.map((p: { nome: string }) => p.nome)).toEqual(['Limpeza (profilaxia)'])
  })

  it('nasce em aberto, com valor da tabela editável e total com desconto (R-012, R-017)', async () => {
    const api = await entrarComo('RECEPCAO')
    const { r } = await criar(api)
    expect(r.status).toBe(201)
    expect(r.corpo).toMatchObject({
      status: 'ABERTO',
      totalCentavos: 40000,
      forma: 'Boleto',
      parcelas: 2,
    })
    expect(
      r.corpo.itens.map((i: { valorCentavos: number; dente: string | null }) => [
        i.valorCentavos,
        i.dente,
      ]),
    ).toEqual([
      [30000, '16'],
      [12000, null],
    ])
  })

  it('precisa de pelo menos um procedimento (R-010)', async () => {
    const api = await entrarComo('RECEPCAO')
    const { r } = await criar(api, { itens: [] })
    expect(r.status).toBe(400)
    expect(r.corpo.erros.itens).toBeTruthy()
  })

  it('aprovar gera venda e parcelas a receber, e fica só leitura (R-018, R-019, R-038)', async () => {
    const api = await entrarComo('RECEPCAO')
    const { r } = await criar(api)
    const ap = await api('POST', `/api/orcamentos/${r.corpo.id}/aprovar`)
    expect(ap.corpo.status).toBe('APROVADO')
    const venda = await db.lancamento.findMany({ where: { orcamentoId: r.corpo.id } })
    expect(venda.map((l) => [l.tipo, l.valorCentavos])).toEqual([['VENDA', 40000]])
    const parcelas = await db.contaFinanceira.findMany({
      where: { orcamentoId: r.corpo.id },
      orderBy: { parcela: 'asc' },
    })
    expect(
      parcelas.map((p) => [
        p.parcela,
        p.valorCentavos,
        p.vencimento.toISOString().slice(0, 10),
        p.forma,
      ]),
    ).toEqual([
      [1, 20000, '2026-11-22', 'Boleto'],
      [2, 20000, '2026-12-22', 'Boleto'],
    ])
    expect((await api('PUT', `/api/orcamentos/${r.corpo.id}`, { itens: [] })).status).toBe(409)
  })

  it('reprovar guarda o motivo', async () => {
    const api = await entrarComo('PROFISSIONAL')
    const { r } = await criar(api)
    const rep = await api('POST', `/api/orcamentos/${r.corpo.id}/reprovar`, {
      motivo: 'Achou caro',
    })
    expect(rep.corpo).toMatchObject({ status: 'REPROVADO', motivoReprovacao: 'Achou caro' })
  })

  it('desaprovar pede a senha e desfaz venda e parcelas (R-037, R-056)', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    const { r } = await criar(api)
    await api('POST', `/api/orcamentos/${r.corpo.id}/aprovar`)
    expect(
      (await api('POST', `/api/orcamentos/${r.corpo.id}/desaprovar`, { senha: 'errada' })).status,
    ).toBe(401)
    const ok = await api('POST', `/api/orcamentos/${r.corpo.id}/desaprovar`, {
      senha: 'senha-de-teste',
    })
    expect(ok.corpo.status).toBe('ABERTO')
    expect(
      await db.lancamento.count({ where: { orcamentoId: r.corpo.id, excluidoEm: null } }),
    ).toBe(0)
    expect(
      await db.contaFinanceira.count({ where: { orcamentoId: r.corpo.id, status: 'ABERTA' } }),
    ).toBe(0)
  })

  it('cancelar aprovado exige ciência, cancela parcelas e lança o cancelamento (R-036)', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    const { r } = await criar(api)
    await api('POST', `/api/orcamentos/${r.corpo.id}/aprovar`)
    expect((await api('POST', `/api/orcamentos/${r.corpo.id}/cancelar`, {})).status).toBe(400)
    const c = await api('POST', `/api/orcamentos/${r.corpo.id}/cancelar`, { ciente: true })
    expect(c.corpo.status).toBe('CANCELADO')
    const l = await db.lancamento.findMany({
      where: { orcamentoId: r.corpo.id },
      orderBy: { id: 'asc' },
    })
    expect(l.map((x) => x.tipo)).toEqual(['VENDA', 'CANCELAMENTO'])
    expect(
      await db.contaFinanceira.count({ where: { orcamentoId: r.corpo.id, status: 'CANCELADA' } }),
    ).toBe(2)
  })

  it('profissional não cancela aprovado, mas executa procedimento', async () => {
    const api = await entrarComo('PROFISSIONAL')
    const { r } = await criar(api)
    await api('POST', `/api/orcamentos/${r.corpo.id}/aprovar`)
    expect(
      (await api('POST', `/api/orcamentos/${r.corpo.id}/cancelar`, { ciente: true })).status,
    ).toBe(403)
    const item = r.corpo.itens[0]
    const ex = await api('POST', `/api/orcamentos/itens/${item.id}/executar`)
    expect(ex.corpo.executadoEm).toBeTruthy()
  })
})

describe('contas a pagar e a receber', () => {
  it('a pagar exige conta do plano de contas (R-054); baixar vira saída', async () => {
    const api = await entrarComo('FINANCEIRO')
    const sem = await api('POST', '/api/financeiro/contas', {
      tipo: 'PAGAR',
      descricao: 'Aluguel',
      valorCentavos: 250000,
      vencimento: '2026-11-05',
    })
    expect(sem.corpo.erros.categoria).toBeTruthy()
    const { corpo: c } = await api('POST', '/api/financeiro/contas', {
      tipo: 'PAGAR',
      descricao: 'Aluguel',
      valorCentavos: 250000,
      vencimento: '2026-11-05',
      categoria: 'Aluguel e condomínio',
    })
    const pago = await api('POST', `/api/financeiro/contas/${c[0].id}/baixar`, {
      data: '2026-11-05',
      forma: 'Pix',
    })
    expect(pago.corpo.status).toBe('PAGA')
    const l = await db.lancamento.findFirstOrThrow({ where: { id: pago.corpo.lancamentoId } })
    expect([l.tipo, l.valorCentavos, l.categoria]).toEqual([
      'SAIDA',
      250000,
      'Aluguel e condomínio',
    ])
  })

  it('lista por tipo, status e forma; parcela a receber baixada vira entrada', async () => {
    const api = await entrarComo('FINANCEIRO')
    const { corpo: criadas } = await api('POST', '/api/financeiro/contas', {
      tipo: 'RECEBER',
      descricao: 'Tratamento',
      valorCentavos: 30000,
      vencimento: '2026-11-10',
      forma: 'Cheque',
      detalhes: 'Banco 001, cheque 123',
      parcelas: 3,
    })
    expect(criadas.map((c: { valorCentavos: number }) => c.valorCentavos)).toEqual([
      10000, 10000, 10000,
    ])
    const cheques = await api(
      'GET',
      '/api/financeiro/contas?tipo=RECEBER&formas=Cheque&de=2026-11-01&ate=2027-02-28',
    )
    expect(cheques.corpo).toHaveLength(3)
    await api('POST', `/api/financeiro/contas/${criadas[0].id}/baixar`, { data: '2026-11-10' })
    const abertas = await api(
      'GET',
      '/api/financeiro/contas?tipo=RECEBER&status=ABERTA&de=2026-11-01&ate=2027-02-28',
    )
    expect(abertas.corpo).toHaveLength(2)
  })
})

describe('PT-52 fluxo de caixa, extrato e conciliação', () => {
  it('fluxo traz realizado, previsto, saldo e acumulado por dia', async () => {
    const api = await entrarComo('FINANCEIRO')
    await api('POST', '/api/financeiro/lancamentos', {
      data: '2026-10-01',
      tipo: 'ENTRADA',
      valorCentavos: 10000,
      descricao: 'Antes',
    })
    await api('POST', '/api/financeiro/lancamentos', {
      data: '2026-10-20',
      tipo: 'ENTRADA',
      valorCentavos: 5000,
      descricao: 'Parcela',
    })
    await api('POST', '/api/financeiro/lancamentos', {
      data: '2026-10-20',
      tipo: 'SAIDA',
      valorCentavos: 2000,
      descricao: 'Material',
    })
    await api('POST', '/api/financeiro/contas', {
      tipo: 'RECEBER',
      descricao: 'Parcela 2',
      valorCentavos: 7000,
      vencimento: '2026-10-21',
    })
    const f = await api('GET', '/api/financeiro/fluxo?de=2026-10-20&ate=2026-10-21')
    expect(f.corpo.saldoAnterior).toBe(10000)
    expect(f.corpo.dias).toEqual([
      {
        data: '2026-10-20',
        entradas: 5000,
        saidas: 2000,
        entradasPrevistas: 0,
        saidasPrevistas: 0,
        saldo: 3000,
        acumulado: 13000,
      },
      {
        data: '2026-10-21',
        entradas: 0,
        saidas: 0,
        entradasPrevistas: 7000,
        saidasPrevistas: 0,
        saldo: 7000,
        acumulado: 20000,
      },
    ])
    const e = await api('GET', '/api/financeiro/extrato?de=2026-10-20&ate=2026-10-21')
    expect(e.corpo.itens.map((i: { saldo: number }) => i.saldo)).toEqual([15000, 13000])
  })

  it('conciliação marca lançamentos de uma conta bancária e compara saldo', async () => {
    const api = await entrarComo('FINANCEIRO')
    const { corpo: banco } = await api('POST', '/api/financeiro/bancos', {
      nome: 'Conta da clínica',
      banco: 'Banco Fictício',
      saldoInicialCentavos: 100000,
    })
    const { corpo: l } = await api('POST', '/api/financeiro/lancamentos', {
      data: '2026-10-20',
      tipo: 'ENTRADA',
      valorCentavos: 5000,
      descricao: 'Pix recebido',
    })
    await api('PATCH', `/api/financeiro/lancamentos/${l.id}/conciliar`, {
      contaBancariaId: banco.id,
    })
    const c = await api(
      'GET',
      `/api/financeiro/conciliacao?contaBancariaId=${banco.id}&de=2026-10-01&ate=2026-10-31`,
    )
    expect(c.corpo.saldoConciliado).toBe(105000)
    expect(c.corpo.lancamentos[0]).toMatchObject({ id: l.id, conciliado: true })
  })
})

describe('relatórios que dependem dessas partes', () => {
  it('DRE soma por grupo do plano de contas (R-043)', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    for (const [tipo, valor, categoria] of [
      ['ENTRADA', 100000, 'Receita de tratamentos'],
      ['SAIDA', 5000, 'Taxas de cartão e boleto'],
      ['SAIDA', 20000, 'Material odontológico'],
      ['SAIDA', 30000, 'Aluguel e condomínio'],
    ] as const)
      await api('POST', '/api/financeiro/lancamentos', {
        data: '2026-10-20',
        tipo,
        valorCentavos: valor,
        descricao: categoria,
        categoria,
      })
    const r = await api('GET', '/api/relatorios/financeiro-dre?de=2026-10-01&ate=2026-10-31')
    const linha = (nome: string) => r.corpo.linhas.find((l: string[]) => l[0] === nome)?.[1]
    expect(linha('Receita operacional bruta')).toBe('1.000,00')
    expect(linha('(=) Receita líquida')).toBe('950,00')
    expect(linha('(=) Lucro bruto')).toBe('750,00')
    expect(linha('(=) Resultado do período')).toBe('450,00')
  })

  it('tratamentos em aberto e procedimentos executados', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    const b = await base(api)
    const { corpo: o } = await api('POST', '/api/orcamentos', {
      pacienteId: b.paciente.id,
      profissionalId: b.dentista.id,
      itens: [{ procedimentoId: b.resina.id, dente: '16' }, { procedimentoId: b.limpeza.id }],
      forma: 'Pix',
    })
    await api('POST', `/api/orcamentos/${o.id}/aprovar`)
    await api('POST', `/api/orcamentos/itens/${o.itens[1].id}/executar`)
    const hoje = new Date().toISOString().slice(0, 10)
    const abertos = await api(
      'GET',
      `/api/relatorios/tratamentos-abertos?de=2000-01-01&ate=${hoje}`,
    )
    expect(abertos.corpo.linhas).toHaveLength(1)
    expect(abertos.corpo.linhas[0]).toContain('Restauração em resina (16)')
    const exec = await api('GET', `/api/relatorios/tratamentos-executados?de=${hoje}&ate=${hoje}`)
    expect(exec.corpo.linhas.map((l: string[]) => l[2])).toEqual(['Limpeza (profilaxia)'])
    const orc = await api('GET', `/api/relatorios/pacientes-orcamentos?de=${hoje}&ate=${hoje}`)
    expect(orc.corpo.linhas[0]).toContain('Aprovado')
  })
})
