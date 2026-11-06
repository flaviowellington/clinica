// Profissionais, financeiro (conta corrente) e relatórios.
import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { db } from '../src/db'
import { entrarComo, PACIENTE, usarServidor } from './ajuda'
import { centavosDeDigitos } from '../../shared/financeiro'

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
  it('inativos vêm por último na lista', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    const { corpo: a } = await api('POST', '/api/profissionais', {
      ...DENTISTA,
      nome: 'Dr. Alberto',
    })
    await api('POST', '/api/profissionais', { ...DENTISTA, nome: 'Dr. Bruno' })
    await api('POST', `/api/profissionais/${a.id}/ativo`, { ativo: false })
    const nomes = (await api('GET', '/api/profissionais')).corpo.map(
      (p: { nome: string }) => p.nome,
    )
    expect(nomes).toEqual(['Dr. Bruno', 'Dr. Alberto'])
  })
  it('exclui só quem já está inativo; o registro fica guardado', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    const { corpo: p } = await api('POST', '/api/profissionais', DENTISTA)
    const ativo = await api('DELETE', `/api/profissionais/${p.id}`)
    expect(ativo.status).toBe(400)
    expect(ativo.corpo.erro).toMatch(/Inative/)

    await api('POST', `/api/profissionais/${p.id}/ativo`, { ativo: false })
    expect(
      (await (await entrarComo('RECEPCAO'))('DELETE', `/api/profissionais/${p.id}`)).status,
    ).toBe(403)
    expect((await api('DELETE', `/api/profissionais/${p.id}`)).status).toBe(200)
    expect((await api('GET', '/api/profissionais')).corpo).toEqual([])
    expect((await api('DELETE', `/api/profissionais/${p.id}`)).status).toBe(404)
    const guardado = await db.pessoa.findUnique({ where: { id: p.id } })
    expect(guardado?.excluidoEm).toBeTruthy()
    expect(guardado?.excluidoPorId).toBe(api.usuario.id)
  })
})

describe('foto do profissional', () => {
  // Imagem 1000x600: metade esquerda vermelha, metade direita azul.
  const imagem = async () => {
    const azul = await sharp({
      create: { width: 500, height: 600, channels: 3, background: '#0000ff' },
    })
      .png()
      .toBuffer()
    return sharp({ create: { width: 1000, height: 600, channels: 3, background: '#ff0000' } })
      .composite([{ input: azul, left: 500, top: 0 }])
      .png()
      .toBuffer()
  }
  const envio = (dados: Uint8Array, recorte: { x: number; y: number; tamanho: number }) => {
    const f = new FormData()
    f.append('foto', new Blob([dados as BlobPart], { type: 'image/png' }), 'foto.png')
    for (const [k, v] of Object.entries(recorte)) f.append(k, String(v))
    return f
  }

  it('recorta o quadrado escolhido, guarda 400x400 em WebP e remove', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    const { corpo: p } = await api('POST', '/api/profissionais', DENTISTA)
    expect(p.fotoEm).toBeNull()

    const r = await api(
      'POST',
      `/api/profissionais/${p.id}/foto`,
      envio(await imagem(), { x: 550, y: 100, tamanho: 400 }),
    )
    expect(r.status).toBe(200)
    expect(r.corpo.fotoEm).toBeTruthy()

    const foto = await api('GET', `/api/profissionais/${p.id}/foto`)
    expect(foto.tipo).toBe('image/webp')
    const meta = await sharp(foto.corpo).metadata()
    expect([meta.width, meta.height]).toEqual([400, 400])
    // O recorte caiu todo na metade azul: o vermelho foi removido.
    const [vermelho, , azul] = (await sharp(foto.corpo).stats()).channels
    expect(azul.mean).toBeGreaterThan(200)
    expect(vermelho.mean).toBeLessThan(30)

    expect((await api('DELETE', `/api/profissionais/${p.id}/foto`)).status).toBe(200)
    expect((await api('GET', `/api/profissionais/${p.id}/foto`)).status).toBe(404)
    expect((await api('GET', '/api/profissionais')).corpo[0].fotoEm).toBeNull()
  })

  it('recusa recorte fora da imagem, arquivo que não é imagem e quem não pode editar', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    const { corpo: p } = await api('POST', '/api/profissionais', DENTISTA)
    const url = `/api/profissionais/${p.id}/foto`
    const fora = await api('POST', url, envio(await imagem(), { x: 800, y: 0, tamanho: 400 }))
    expect(fora.status).toBe(400)
    const falsa = await api(
      'POST',
      url,
      envio(new TextEncoder().encode('não sou imagem'), { x: 0, y: 0, tamanho: 10 }),
    )
    expect(falsa.status).toBe(400)
    expect(falsa.corpo.erro).toMatch(/imagem/)

    const recepcao = await entrarComo('RECEPCAO')
    const r = await recepcao('POST', url, envio(await imagem(), { x: 0, y: 0, tamanho: 400 }))
    expect(r.status).toBe(403)
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
      (await fin('GET', '/api/relatorios/financeiro-caixa?de=2026-10-19&ate=2026-10-19')).status,
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

describe('relatórios: correções de cálculo e filtros', () => {
  /** Dois dentistas, um paciente e um agendamento por linha de `consultas`. */
  async function cenario(
    api: Awaited<ReturnType<typeof entrarComo>>,
    consultas: {
      data: string
      prof: 0 | 1
      status?: 'ATENDIDO' | 'FALTOU'
      categoria?: string
      desmarcada?: boolean
      primeira?: boolean
    }[],
  ) {
    const profs = await Promise.all(
      ['Dra. Alfa', 'Dr. Beta'].map((nome) =>
        db.pessoa.create({ data: { tipo: 'PROFISSIONAL', nome, nomeBusca: nome.toLowerCase() } }),
      ),
    )
    const { corpo: pac } = await api('POST', '/api/pacientes', PACIENTE)
    let h = 8
    for (const c of consultas)
      await db.agendamento.create({
        data: {
          data: new Date(`${c.data}T00:00:00Z`),
          inicio: `${String(h).padStart(2, '0')}:00`,
          fim: `${String(h++).padStart(2, '0')}:30`,
          profissionalId: profs[c.prof].id,
          pacienteId: pac.id,
          status: c.status ?? 'AGENDADO',
          categoria: c.categoria,
          primeiraConsulta: c.primeira ?? false,
          desmarcadoEm: c.desmarcada ? new Date() : null,
          criadoPorId: api.usuario.id,
        },
      })
    return { profs, pac }
  }
  const linhas = async (api: Awaited<ReturnType<typeof entrarComo>>, url: string) =>
    (await api('GET', `/api/relatorios/${url}`)).corpo.linhas

  it('consulta desmarcada não conta em Geral, Por categoria e Primeira consulta', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    await cenario(api, [
      { data: '2026-10-19', prof: 0, categoria: 'Avaliação', primeira: true },
      { data: '2026-10-19', prof: 0, categoria: 'Avaliação', primeira: true, desmarcada: true },
    ])
    const p = '?de=2026-10-19&ate=2026-10-19'
    expect(await linhas(api, `agenda-geral${p}`)).toHaveLength(1)
    expect(await linhas(api, `agenda-categoria${p}`)).toEqual([['Avaliação', 1]])
    expect(await linhas(api, `agenda-primeira${p}`)).toHaveLength(1)
  })

  it('filtra por profissional, status e categoria', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    const { profs } = await cenario(api, [
      { data: '2026-10-19', prof: 0, categoria: 'Avaliação', status: 'ATENDIDO' },
      { data: '2026-10-19', prof: 0, categoria: 'Retorno', status: 'FALTOU' },
      { data: '2026-10-19', prof: 1, categoria: 'Avaliação', status: 'ATENDIDO' },
    ])
    const p = '?de=2026-10-19&ate=2026-10-19'
    expect(await linhas(api, `agenda-geral${p}&profissionais=${profs[0].id}`)).toHaveLength(2)
    expect(await linhas(api, `agenda-geral${p}&status=ATENDIDO`)).toHaveLength(2)
    expect(await linhas(api, `agenda-geral${p}&categoria=Retorno`)).toHaveLength(1)
    expect(await linhas(api, `agenda-profissional${p}&profissionais=${profs[1].id}`)).toEqual([
      ['Dr. Beta', 1, 1, 0, 0, '0%'],
    ])
    // Nenhum marcado: nada.
    expect(await linhas(api, `agenda-geral${p}&profissionais=0`)).toEqual([])
    // Vários de uma vez.
    expect(
      await linhas(api, `agenda-geral${p}&profissionais=${profs[0].id},${profs[1].id}`),
    ).toHaveLength(3)
  })

  it('Último agendamento ignora consulta futura e desmarcada', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    await cenario(api, [
      { data: '2020-03-10', prof: 0, status: 'ATENDIDO' },
      { data: '2020-04-10', prof: 0, desmarcada: true },
      { data: '2099-01-10', prof: 0 },
    ])
    const [l] = await linhas(api, 'pacientes-ultimo')
    expect(l[2]).toBe('10/03/2020')
  })

  it('Tratamentos em aberto e Cobrança não dependem do período escolhido', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    const { profs, pac } = await cenario(api, [])
    const proc = await db.procedimento.create({
      data: { nome: 'Canal', nomeBusca: 'canal', valorCentavos: 80000 },
    })
    await db.orcamento.create({
      data: {
        pacienteId: pac.id,
        profissionalId: profs[0].id,
        status: 'APROVADO',
        aprovadoEm: new Date('2020-01-15T12:00:00Z'),
        criadoPorId: api.usuario.id,
        itens: { create: [{ procedimentoId: proc.id, nome: 'Canal', valorCentavos: 80000 }] },
      },
    })
    await db.contaFinanceira.create({
      data: {
        tipo: 'RECEBER',
        descricao: 'Parcela antiga',
        valorCentavos: 10000,
        vencimento: new Date('2020-02-01T00:00:00Z'),
        pacienteId: pac.id,
        criadoPorId: api.usuario.id,
      },
    })
    const mes = '?de=2026-10-01&ate=2026-10-31'
    expect(await linhas(api, `tratamentos-abertos${mes}`)).toHaveLength(1)
    expect(await linhas(api, `pacientes-inadimplentes${mes}`)).toHaveLength(1)
  })

  it('Procedimentos mais orçados desconta o desconto do orçamento', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    const { profs, pac } = await cenario(api, [])
    const proc = await db.procedimento.create({
      data: { nome: 'Resina', nomeBusca: 'resina', valorCentavos: 30000 },
    })
    await db.orcamento.create({
      data: {
        pacienteId: pac.id,
        profissionalId: profs[0].id,
        status: 'APROVADO',
        aprovadoEm: new Date(),
        descontoCentavos: 10000,
        criadoPorId: api.usuario.id,
        itens: {
          create: [
            { procedimentoId: proc.id, nome: 'Resina', valorCentavos: 30000 },
            { procedimentoId: proc.id, nome: 'Resina', valorCentavos: 10000 },
          ],
        },
      },
    })
    const hoje = new Date().toISOString().slice(0, 10)
    const [l] = await linhas(api, `tratamentos-procedimentos?de=${hoje}&ate=${hoje}`)
    // 400 de itens − 100 de desconto = 300.
    expect(l).toEqual(['Resina', 2, 2, '100%', '300,00'])
  })
})

describe('relatórios repetidos saem do catálogo', () => {
  it('quem repetia outra tela responde 404', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    for (const id of [
      'agenda-status',
      'pacientes-indicacoes',
      'financeiro-resumo',
      'financeiro-formas',
      'tratamentos-faturamento',
      'geral-usuarios',
    ]) {
      const r = await api('GET', `/api/relatorios/${id}?de=2026-10-01&ate=2026-10-31`)
      expect([id, r.status]).toEqual([id, 404])
    }
  })
  it('Por profissional mostra as desmarcadas; Pacientes novos mostra quem indicou', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    const prof = await db.pessoa.create({
      data: { tipo: 'PROFISSIONAL', nome: 'Dra. Gama', nomeBusca: 'dra. gama' },
    })
    const { corpo: pac } = await api('POST', '/api/pacientes', {
      ...PACIENTE,
      comoConheceu: 'Indicado por',
      indicadoPor: 'Ciclano Fictício',
    })
    for (const desmarcada of [false, true])
      await db.agendamento.create({
        data: {
          data: new Date('2026-10-19T00:00:00Z'),
          inicio: desmarcada ? '09:00' : '10:00',
          fim: desmarcada ? '09:30' : '10:30',
          profissionalId: prof.id,
          pacienteId: pac.id,
          desmarcadoEm: desmarcada ? new Date() : null,
          criadoPorId: api.usuario.id,
        },
      })
    const r = await api('GET', '/api/relatorios/agenda-profissional?de=2026-10-19&ate=2026-10-19')
    expect(r.corpo.colunas).toContain('Desmarcadas')
    expect(r.corpo.linhas).toEqual([['Dra. Gama', 1, 0, 0, 1, '0%']])
    const hoje = new Date().toISOString().slice(0, 10)
    const n = await api('GET', `/api/relatorios/pacientes-novos?de=${hoje}&ate=${hoje}`)
    expect(n.corpo.colunas).toContain('Indicado por')
    expect(n.corpo.linhas[0]).toContain('Ciclano Fictício')
  })
})
