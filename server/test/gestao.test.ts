// Profissionais, financeiro (conta corrente), conta digital e relatórios.
import { describe, expect, it } from 'vitest'
import { db } from '../src/db'
import { entrarComo, PACIENTE, usarServidor } from './ajuda'
import { centavosDeDigitos, cnpjValido } from '../../shared/financeiro'

usarServidor()

const DENTISTA = {
  nome: 'Dra. Fictícia Teste',
  cro: 'CRO-SP 12345',
  especialidade: 'Ortodontia',
  email: 'dentista@example.com',
  celular: '+55 11 90000-0001',
  corAgenda: '#22c55e',
}

describe('PT-24 (F-024) profissionais', () => {
  it('administrador cadastra; a busca acha por nome; cor vai para a agenda', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    const r = await api('POST', '/api/profissionais', DENTISTA)
    expect(r.status).toBe(201)
    expect(r.corpo).toMatchObject(DENTISTA)
    const busca = await api('GET', '/api/profissionais?busca=teste')
    expect(busca.corpo.map((p: { nome: string }) => p.nome)).toEqual([DENTISTA.nome])
    const agenda = await api('GET', '/api/agenda/profissionais')
    expect(agenda.corpo.profissionais[0]).toMatchObject({
      nome: DENTISTA.nome,
      corAgenda: '#22c55e',
    })
  })
  it('inativo some da agenda e do filtro "apenas ativos"', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    const { corpo: p } = await api('POST', '/api/profissionais', DENTISTA)
    await api('POST', `/api/profissionais/${p.id}/ativo`, { ativo: false })
    expect((await api('GET', '/api/profissionais?ativos=1')).corpo).toEqual([])
    expect((await api('GET', '/api/profissionais')).corpo).toHaveLength(1)
    expect((await api('GET', '/api/agenda/profissionais')).corpo.profissionais).toEqual([])
  })
  it('edita e valida nome e cor', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    const { corpo: p } = await api('POST', '/api/profissionais', DENTISTA)
    const r = await api('PUT', `/api/profissionais/${p.id}`, {
      ...DENTISTA,
      especialidade: 'Endodontia',
    })
    expect(r.corpo.especialidade).toBe('Endodontia')
    const ruim = await api('POST', '/api/profissionais', { nome: '', corAgenda: 'azul' })
    expect(Object.keys(ruim.corpo.erros).sort()).toEqual(['corAgenda', 'nome'])
  })
  it('só o administrador cadastra', async () => {
    const api = await entrarComo('RECEPCAO')
    expect((await api('POST', '/api/profissionais', DENTISTA)).status).toBe(403)
    expect((await api('GET', '/api/profissionais')).status).toBe(200)
  })
})

describe('PT-55 (R-055) campo de valor e conta corrente', () => {
  it('monta centavos da direita para a esquerda', () => {
    expect(centavosDeDigitos('1')).toBe(1)
    expect(centavosDeDigitos('100')).toBe(100)
    expect(centavosDeDigitos('1.000,00')).toBe(100000)
  })
  it('lança, totaliza por tipo e agrupa por dia (mais recente primeiro)', async () => {
    const api = await entrarComo('FINANCEIRO')
    const { corpo: pac } = await (await entrarComo('RECEPCAO'))('POST', '/api/pacientes', PACIENTE)
    for (const l of [
      {
        data: '2026-10-20',
        tipo: 'VENDA',
        valorCentavos: 50000,
        descricao: 'Tratamento',
        pacienteId: pac.id,
      },
      {
        data: '2026-10-20',
        tipo: 'ENTRADA',
        valorCentavos: 20000,
        descricao: 'Parcela 1',
        forma: 'Pix',
      },
      { data: '2026-10-21', tipo: 'SAIDA', valorCentavos: 3000, descricao: 'Material' },
    ]) {
      expect((await api('POST', '/api/financeiro/lancamentos', l)).status).toBe(201)
    }
    const r = await api('GET', '/api/financeiro/lancamentos?de=2026-10-19&ate=2026-10-23')
    expect(r.corpo.totais).toEqual({ VENDA: 50000, CANCELAMENTO: 0, ENTRADA: 20000, SAIDA: 3000 })
    expect(r.corpo.quantidade).toBe(3)
    expect(r.corpo.dias.map((d: { data: string }) => d.data)).toEqual(['2026-10-21', '2026-10-20'])
    expect(
      r.corpo.dias[1].lancamentos[0].paciente?.nome ??
        r.corpo.dias[1].lancamentos[1].paciente?.nome,
    ).toBe(PACIENTE.nome)
    const so = await api(
      'GET',
      '/api/financeiro/lancamentos?de=2026-10-19&ate=2026-10-23&tipo=SAIDA',
    )
    expect(so.corpo.quantidade).toBe(1)
    const busca = await api(
      'GET',
      '/api/financeiro/lancamentos?de=2026-10-19&ate=2026-10-23&busca=parcela',
    )
    expect(busca.corpo.quantidade).toBe(1)
  })
  it('valida e exclui de forma lógica', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    const ruim = await api('POST', '/api/financeiro/lancamentos', { tipo: 'X', valorCentavos: 0 })
    expect(Object.keys(ruim.corpo.erros).sort()).toEqual([
      'data',
      'descricao',
      'tipo',
      'valorCentavos',
    ])
    const { corpo: l } = await api('POST', '/api/financeiro/lancamentos', {
      data: '2026-10-20',
      tipo: 'ENTRADA',
      valorCentavos: 100,
      descricao: 'Teste',
    })
    expect((await api('DELETE', `/api/financeiro/lancamentos/${l.id}`)).status).toBe(200)
    expect(
      (await api('GET', '/api/financeiro/lancamentos?de=2026-10-20&ate=2026-10-20')).corpo
        .quantidade,
    ).toBe(0)
    expect(await db.lancamento.count()).toBe(1)
  })
  it('recepção e profissional não veem o financeiro', async () => {
    for (const perfil of ['RECEPCAO', 'PROFISSIONAL'] as const) {
      const api = await entrarComo(perfil)
      expect(
        (await api('GET', '/api/financeiro/lancamentos?de=2026-10-20&ate=2026-10-20')).status,
      ).toBe(403)
    }
  })
})

describe('conta digital (F-010, BR-006)', () => {
  it('valida CNPJ', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true)
    expect(cnpjValido('11.222.333/0001-82')).toBe(false)
  })
  it('pedido de conta fica aguardando parceiro e pode ser cancelado', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    const r = await api('POST', '/api/contas', {
      tipo: 'PESSOA_JURIDICA',
      nome: 'Clínica Fictícia Ltda',
      documento: '11.222.333/0001-81',
      email: 'clinica@example.com',
      celular: '(11) 90000-0000',
    })
    expect(r.status).toBe(201)
    expect(r.corpo).toMatchObject({ status: 'PENDENTE', documento: '11222333000181' })
    expect((await api('GET', '/api/contas')).corpo).toHaveLength(1)
    const c = await api('POST', `/api/contas/${r.corpo.id}/cancelar`)
    expect(c.corpo.status).toBe('CANCELADA')
  })
  it('recusa documento inválido e perfis sem permissão', async () => {
    const api = await entrarComo('FINANCEIRO')
    const r = await api('POST', '/api/contas', {
      tipo: 'PESSOA_FISICA',
      nome: 'Fulano',
      documento: '123',
    })
    expect(Object.keys(r.corpo.erros).sort()).toEqual(['celular', 'documento', 'email'])
    expect((await (await entrarComo('RECEPCAO'))('GET', '/api/contas')).status).toBe(403)
  })
})

describe('relatórios', () => {
  it('agenda geral e por categoria no período', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    const dentista = await db.pessoa.create({
      data: { tipo: 'PROFISSIONAL', nome: 'Dra. Rel', nomeBusca: 'dra. rel' },
    })
    const { corpo: pac } = await api('POST', '/api/pacientes', PACIENTE)
    for (const [inicio, categoria] of [
      ['09:00', 'Avaliação'],
      ['10:00', 'Avaliação'],
      ['11:00', 'Retorno'],
    ])
      await api('POST', '/api/agenda', {
        data: '2026-10-19',
        inicio,
        categoria,
        profissionalId: dentista.id,
        pacienteId: pac.id,
      })
    const geral = await api('GET', '/api/relatorios/agenda-geral?de=2026-10-19&ate=2026-10-19')
    expect(geral.corpo.linhas).toHaveLength(3)
    expect(geral.corpo.colunas[0]).toBe('Data')
    const cat = await api('GET', '/api/relatorios/agenda-categoria?de=2026-10-19&ate=2026-10-19')
    expect(cat.corpo.linhas).toEqual([
      ['Avaliação', 2],
      ['Retorno', 1],
    ])
  })
  it('respeita o grupo do perfil e recusa relatório que ainda não existe', async () => {
    const fin = await entrarComo('FINANCEIRO')
    expect(
      (await fin('GET', '/api/relatorios/agenda-geral?de=2026-10-19&ate=2026-10-19')).status,
    ).toBe(403)
    expect(
      (await fin('GET', '/api/relatorios/financeiro-resumo?de=2026-10-19&ate=2026-10-19')).status,
    ).toBe(200)
    const adm = await entrarComo('ADMINISTRADOR')
    expect(
      (await adm('GET', '/api/relatorios/nao-existe?de=2026-10-19&ate=2026-10-19')).status,
    ).toBe(404)
  })
  it('acessos a fichas por usuário', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    const { corpo: pac } = await api('POST', '/api/pacientes', PACIENTE)
    await api('GET', `/api/pacientes/${pac.id}`)
    await api('GET', `/api/pacientes/${pac.id}`)
    const hoje = new Date().toISOString().slice(0, 10)
    const r = await api('GET', `/api/relatorios/geral-acessos?de=${hoje}&ate=${hoje}`)
    expect(r.corpo.linhas).toEqual([[api.usuario.nome, 2, 1]])
  })
})

describe('catálogo de relatórios', () => {
  it('todo relatório do menu existe e responde com colunas e linhas', async () => {
    const { GRUPOS } = await import('../../shared/relatorios')
    const api = await entrarComo('ADMINISTRADOR')
    for (const g of GRUPOS)
      for (const r of g.itens) {
        const res = await api('GET', `/api/relatorios/${r.id}?de=2026-10-01&ate=2026-10-31`)
        expect([r.id, res.status]).toEqual([r.id, 200])
        expect(res.corpo.colunas.length).toBeGreaterThan(0)
        expect(Array.isArray(res.corpo.linhas)).toBe(true)
      }
  })
})
