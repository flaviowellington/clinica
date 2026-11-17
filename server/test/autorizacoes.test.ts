// Plano de tratamento: o paciente autoriza (assina) pelo celular, sem depender do pagamento.
import { describe, expect, it } from 'vitest'
import { db } from '../src/db'
import sharp from 'sharp'
import { cliente, entrarComo, PACIENTE, urlBase, usarServidor, type Cliente } from './ajuda'

usarServidor()

const ASSINATURA = 'data:image/png;base64,iVBORw0KGgo='
const tokenDe = (r: { corpo: { link: string } }) => r.corpo.link.split('/autorizar/')[1]

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
  // Orçamento em aberto: nada aprovado nem pago.
  const o = await api('POST', '/api/orcamentos', {
    pacienteId: paciente.id,
    profissionalId: dentista.id,
    itens: ['16', '17'].map((dente) => ({
      procedimentoId: resina.id,
      dente,
      faces: 'O',
      observacao: 'Evite mastigar do lado por 2 horas',
    })),
  })
  expect(o.status).toBe(201)
  const itens = o.corpo.itens.map((i: { id: number }) => ({ origem: 'ORCAMENTO', id: i.id }))
  return { paciente, itens, orcamentoId: o.corpo.id as number }
}

const plano = async (api: Cliente, pacienteId: number) =>
  (await api('GET', `/api/pacientes/${pacienteId}/procedimentos`)).corpo as {
    observacao: string
    autorizacao: { id: number; assinadoEm: string | null } | null
  }[]

describe('autorização do plano de tratamento', () => {
  it('orçamento em aberto vai para assinatura; o paciente assina pelo link sem login', async () => {
    const api = await entrarComo('PROFISSIONAL')
    const { paciente, itens, orcamentoId } = await base(api)

    // Antes: a realizar, com o detalhamento, sem pedido.
    expect(await plano(api, paciente.id)).toMatchObject([
      { observacao: 'Evite mastigar do lado por 2 horas', autorizacao: null },
      { observacao: 'Evite mastigar do lado por 2 horas', autorizacao: null },
    ])

    const r = await api('POST', '/api/autorizacoes', { pacienteId: paciente.id, itens })
    expect(r.status).toBe(201)
    const token = r.corpo.link.split('/autorizar/')[1]

    // Mesmo procedimento em dois dentes vira uma linha só; sem texto, vai o detalhamento.
    const publico = cliente()
    const pagina = await publico('GET', `/api/publico/autorizacao/${token}`)
    expect(pagina.corpo).toMatchObject({
      primeiroNome: 'Fulano',
      assinadoEm: null,
      conteudo: {
        itens: [
          {
            nome: 'Restauração em resina',
            dentes: ['16O', '17O'],
            observacaoPaciente: 'Evite mastigar do lado por 2 horas',
            // Valor dos dois dentes somado (o total do documento sai da soma dos itens).
            valorCentavos: 60000,
          },
        ],
      },
    })

    // Item já enviado não entra em outro pedido.
    const dobro = await api('POST', '/api/autorizacoes', { pacienteId: paciente.id, itens })
    expect(dobro.status).toBe(409)

    expect((await publico('POST', `/api/publico/autorizacao/${token}`, { nome: '' })).status).toBe(
      400,
    )
    const assinou = await publico('POST', `/api/publico/autorizacao/${token}`, {
      nome: 'Fulano de Teste',
      assinatura: ASSINATURA,
    })
    expect(assinou.status).toBe(200)
    expect(
      (
        await publico('POST', `/api/publico/autorizacao/${token}`, {
          nome: 'Outro',
          assinatura: ASSINATURA,
        })
      ).status,
    ).toBe(409)

    expect((await plano(api, paciente.id)).every((i) => i.autorizacao?.assinadoEm)).toBe(true)
    // Assinar não aprova nem cobra: o orçamento continua em aberto.
    const o = await db.orcamento.findUnique({ where: { id: orcamentoId } })
    expect(o?.status).toBe('ABERTO')
    expect(await db.contaFinanceira.count()).toBe(0)
    // Editar o orçamento perderia o vínculo com o que foi assinado.
    expect((await api('PUT', `/api/orcamentos/${orcamentoId}`, { itens: [] })).status).toBe(409)
  })

  it('cancelar invalida o link e devolve os procedimentos para "Para autorizar"', async () => {
    const api = await entrarComo('PROFISSIONAL')
    const { paciente, itens } = await base(api)
    const r = await api('POST', '/api/autorizacoes', { pacienteId: paciente.id, itens })
    const token = r.corpo.link.split('/autorizar/')[1]
    expect((await api('POST', `/api/autorizacoes/${r.corpo.id}/cancelar`)).status).toBe(200)
    expect((await cliente()('GET', `/api/publico/autorizacao/${token}`)).status).toBe(404)
    expect((await plano(api, paciente.id)).every((i) => !i.autorizacao)).toBe(true)
    expect((await api('GET', `/api/autorizacoes?pacienteId=${paciente.id}`)).corpo).toEqual([])
  })

  it('pedido já assinado pelo paciente não pode ser cancelado', async () => {
    const api = await entrarComo('PROFISSIONAL')
    const { paciente, itens } = await base(api)
    const r = await api('POST', '/api/autorizacoes', { pacienteId: paciente.id, itens })
    const token = r.corpo.link.split('/autorizar/')[1]
    await cliente()('POST', `/api/publico/autorizacao/${token}`, {
      nome: 'Fulano de Teste',
      assinatura: ASSINATURA,
    })
    expect((await api('POST', `/api/autorizacoes/${r.corpo.id}/cancelar`)).status).toBe(409)
    expect((await plano(api, paciente.id)).every((i) => i.autorizacao?.assinadoEm)).toBe(true)
  })

  it('procedimento já executado ainda pode ir para assinar', async () => {
    const api = await entrarComo('PROFISSIONAL')
    const { paciente, itens } = await base(api)
    expect((await api('POST', `/api/orcamentos/itens/${itens[0].id}/executar`)).status).toBe(200)
    const r = await api('POST', '/api/autorizacoes', { pacienteId: paciente.id, itens })
    expect(r.status).toBe(201)
  })

  it('o profissional logado recebe o aviso na hora em que o paciente assina', async () => {
    const api = await entrarComo('PROFISSIONAL')
    const { paciente, itens } = await base(api)
    const r = await api('POST', '/api/autorizacoes', {
      pacienteId: paciente.id,
      itens,
      plano: 'Restaurar 16 e 17 e voltar em 6 meses.',
    })
    const token = r.corpo.link.split('/autorizar/')[1]

    // A tela do profissional fica ouvindo /api/eventos (Server-Sent Events).
    const parar = new AbortController()
    const eventos = await fetch(urlBase() + '/api/eventos', {
      headers: { cookie: api.cookie },
      signal: parar.signal,
    })
    const leitor = eventos.body!.getReader()
    const chegou = (async () => {
      let texto = ''
      while (!texto.includes('"assinatura"')) {
        const { value, done } = await leitor.read()
        if (done) break
        texto += new TextDecoder().decode(value)
      }
      return texto
    })()

    const png = await sharp({
      create: { width: 40, height: 10, channels: 4, background: '#000' },
    })
      .png()
      .toBuffer()
    const assinou = await cliente()('POST', `/api/publico/autorizacao/${token}`, {
      nome: 'Fulano de Teste',
      assinatura: `data:image/png;base64,${png.toString('base64')}`,
    })
    expect(assinou.status).toBe(200)
    expect(await chegou).toContain('{"assunto":"assinatura"}')
    parar.abort()

    // O PDF sai com o plano escrito pelo profissional e a assinatura.
    const pdf = await cliente()('GET', `/api/publico/autorizacao/${token}/pdf`)
    expect(pdf.status).toBe(200)
    expect(pdf.tipo).toBe('application/pdf')
    expect(new TextDecoder().decode(pdf.corpo.slice(0, 5))).toBe('%PDF-')
    const pagina = await cliente()('GET', `/api/publico/autorizacao/${token}`)
    expect(pagina.corpo.conteudo.plano).toBe('Restaurar 16 e 17 e voltar em 6 meses.')
  })

  it('o texto escrito ao enviar vai no documento; dois pedidos em aberto viram um', async () => {
    const api = await entrarComo('PROFISSIONAL')
    const { paciente, itens } = await base(api)
    const um = await api('POST', '/api/autorizacoes', {
      pacienteId: paciente.id,
      plano: 'Primeira parte.',
      itens: [{ ...itens[0], texto: 'Anestesia local, cerca de 40 minutos.' }],
    })
    const dois = await api('POST', '/api/autorizacoes', {
      pacienteId: paciente.id,
      plano: 'Segunda parte.',
      itens: [itens[1]],
    })
    const token = (r: typeof um) => r.corpo.link.split('/autorizar/')[1]
    const ler = async (t: string) => await cliente()('GET', `/api/publico/autorizacao/${t}`)
    expect((await ler(token(um))).corpo.conteudo.itens[0].observacaoPaciente).toBe(
      'Anestesia local, cerca de 40 minutos.',
    )

    const junto = await api('POST', '/api/autorizacoes/juntar', {
      ids: [um.corpo.id, dois.corpo.id],
    })
    expect(junto.status).toBe(201)
    // Os links antigos param de valer; o novo tem os dois procedimentos e os dois planos.
    expect((await ler(token(um))).status).toBe(404)
    const novo = (await ler(token(junto))).corpo.conteudo
    expect(novo.plano).toBe('Primeira parte.\n\nSegunda parte.')
    expect(novo.itens.map((i: { observacaoPaciente: string }) => i.observacaoPaciente)).toEqual([
      'Anestesia local, cerca de 40 minutos.',
      'Evite mastigar do lado por 2 horas',
    ])
    const lista = (await api('GET', `/api/autorizacoes?pacienteId=${paciente.id}`)).corpo
    expect(lista.map((a: { id: number }) => a.id)).toEqual([junto.corpo.id])
    expect((await plano(api, paciente.id)).every((i) => i.autorizacao?.id === junto.corpo.id)).toBe(
      true,
    )
  })

  it('assinado, só a situação muda; o administrador altera confirmando e reenvia como retificação', async () => {
    const api = await entrarComo('PROFISSIONAL')
    const dentista = await db.pessoa.create({
      data: { tipo: 'PROFISSIONAL', nome: 'Dra. Muda', nomeBusca: 'dra. muda' },
    })
    const { corpo: paciente } = await api('POST', '/api/pacientes', PACIENTE)
    const novo = (dente: string) =>
      api('POST', `/api/pacientes/${paciente.id}/procedimentos`, {
        nome: 'Limpeza',
        profissionalId: dentista.id,
        status: 'A_REALIZAR',
        dente,
      })
    const [a, b] = [(await novo('11')).corpo, (await novo('12')).corpo]
    const r = await api('POST', '/api/autorizacoes', {
      pacienteId: paciente.id,
      itens: [a, b].map((c) => ({ origem: 'CLINICO', id: c.id })),
    })
    await cliente()('POST', `/api/publico/autorizacao/${tokenDe(r)}`, {
      nome: 'Fulano de Teste',
      assinatura: ASSINATURA,
    })
    const pedido = async () =>
      (await api('GET', `/api/autorizacoes?pacienteId=${paciente.id}`)).corpo.find(
        (x: { id: number }) => x.id === r.corpo.id,
      )
    expect((await pedido()).alteracoes).toEqual([])

    const mudar = {
      nome: 'Limpeza',
      profissionalId: dentista.id,
      status: 'A_REALIZAR',
      dente: '21',
    }
    const url = (id: number, retificar = false) =>
      `/api/prontuario/procedimentos/${id}${retificar ? '?retificar=1' : ''}`
    // Andamento muda; o resto e a exclusão, não.
    expect(
      (await api('PUT', url(a.id), { ...mudar, dente: '11', status: 'EXECUTADO' })).status,
    ).toBe(200)
    expect((await api('PUT', url(a.id), mudar)).status).toBe(409)
    expect((await api('DELETE', url(b.id))).status).toBe(409)
    // Confirmar não adianta para quem não é administrador.
    expect((await api('PUT', url(a.id, true), mudar)).status).toBe(403)
    // O administrador precisa confirmar.
    const adm = await entrarComo('ADMINISTRADOR')
    expect((await adm('PUT', url(a.id), mudar)).status).toBe(409)
    expect((await adm('PUT', url(a.id, true), { ...mudar, observacao: 'Sem dor.' })).status).toBe(
      200,
    )
    expect((await adm('DELETE', url(b.id, true))).status).toBe(200)
    const alterado = await pedido()
    expect(alterado.alteradoEm).toBeTruthy()
    const mudou = [
      'Incluído: Limpeza — 21',
      'Retirado: Limpeza — 11, 12',
      'Detalhamento alterado: Limpeza',
    ]
    expect(alterado.alteracoes).toEqual(mudou)

    // Retificação: documento novo com o que está hoje, marcado e com o que mudou.
    const ret = await api('POST', `/api/autorizacoes/${r.corpo.id}/retificar`)
    expect(ret.status).toBe(201)
    expect((await api('POST', `/api/autorizacoes/${r.corpo.id}/retificar`)).status).toBe(409)
    const doc = (await cliente()('GET', `/api/publico/autorizacao/${tokenDe(ret)}`)).corpo
    expect(doc.conteudo).toMatchObject({
      itens: [{ nome: 'Limpeza', dentes: ['21'], observacaoPaciente: 'Sem dor.' }],
      retificacao: { de: r.corpo.id, alteracoes: mudou },
    })
    expect(doc.conteudo.retificacao.assinadoEm).toBeTruthy()
    const lista = (await api('GET', `/api/autorizacoes?pacienteId=${paciente.id}`)).corpo
    const nova = lista.find((x: { id: number }) => x.id === ret.corpo.id)
    expect(nova).toMatchObject({ retificaId: r.corpo.id, assinadoEm: null })
    expect(nova.mensagem).toContain('retificação')
    // O assinado fica guardado como estava, apontando para a retificação.
    expect(await pedido()).toMatchObject({ alteracoes: [], retificadoPor: { id: ret.corpo.id } })
    const pdf = await cliente()('GET', `/api/publico/autorizacao/${tokenDe(ret)}/pdf`)
    expect(pdf.status).toBe(200)

    // Cancelar a retificação devolve o procedimento ao pedido assinado.
    expect((await api('POST', `/api/autorizacoes/${ret.corpo.id}/cancelar`)).status).toBe(200)
    const [proc] = await plano(api, paciente.id)
    expect(proc.autorizacao?.id).toBe(r.corpo.id)
    expect((await pedido()).retificadoPor).toBeNull()
  })

  it('recepção não cria pedido (é prontuário)', async () => {
    const dono = await entrarComo('PROFISSIONAL')
    const { paciente, itens } = await base(dono)
    const recepcao = await entrarComo('RECEPCAO')
    expect(
      (await recepcao('POST', '/api/autorizacoes', { pacienteId: paciente.id, itens })).status,
    ).toBe(403)
  })
})

describe('planejamento (ficha de especialidade) para o paciente assinar', () => {
  async function planejamento(api: Cliente) {
    const dentista = await db.pessoa.create({
      data: { tipo: 'PROFISSIONAL', nome: 'Dra. Plano', nomeBusca: 'dra. plano' },
    })
    const { corpo: paciente } = await api('POST', '/api/pacientes', PACIENTE)
    const f = (
      await api('POST', `/api/pacientes/${paciente.id}/fichas`, {
        especialidade: 'Implantes',
        profissionalId: dentista.id,
      })
    ).corpo
    const url = `/api/prontuario/fichas/${f.id}`
    // Datas previstas das etapas.
    const etapas = f.etapas.map((e: { nome: string }, i: number) => ({
      ...e,
      data: `2026-12-${i + 10}`,
    }))
    await api('PATCH', url, { etapas })
    await api('POST', `${url}/itens/lote`, {
      procedimentos: ['Implante'],
      dentes: [
        { dente: '36', faces: '' },
        { dente: '46', faces: '' },
      ],
      data: '2026-12-15',
      observacao: 'Interna',
    })
    const ficha = async () =>
      (await api('GET', `/api/pacientes/${paciente.id}/fichas`)).corpo.find(
        (x: { id: number }) => x.id === f.id,
      )
    return { paciente, f: await ficha(), url, ficha }
  }

  it('o documento traz etapas com datas e comentários; assinado, só muda o andamento', async () => {
    const api = await entrarComo('PROFISSIONAL')
    const { paciente, f, url, ficha } = await planejamento(api)
    expect(f.aprovacao).toMatchObject({ situacao: 'NAO_ENVIADO' })
    const cirurgia = f.etapas.find((e: { nome: string }) => e.nome === 'Cirurgia')
    // Planejamento não tem preço: o valor vem da tabela pelo nome (por dente).
    await db.procedimento.create({
      data: { nome: 'Implante', nomeBusca: 'implante', valorCentavos: 250000 },
    })

    const r = await api('POST', '/api/autorizacoes/ficha', {
      fichaId: f.id,
      plano: 'Dois implantes inferiores.',
      procedimentos: { Implante: 'Sob anestesia local.' },
      etapas: { [cirurgia.id]: 'Venha em jejum de 2 horas.' },
    })
    expect(r.status).toBe(201)
    const pagina = (await cliente()('GET', `/api/publico/autorizacao/${tokenDe(r)}`)).corpo
    expect(pagina.conteudo).toMatchObject({
      especialidade: 'Implantes',
      plano: 'Dois implantes inferiores.',
      itens: [
        {
          nome: 'Implante',
          dentes: ['36', '46'],
          data: '2026-12-15',
          observacaoPaciente: 'Sob anestesia local.',
          valorCentavos: 500000,
        },
      ],
    })
    expect(pagina.conteudo.etapas).toHaveLength(f.etapas.length)
    expect(
      pagina.conteudo.etapas.find((e: { nome: string }) => e.nome === 'Cirurgia'),
    ).toMatchObject({ data: cirurgia.data, comentario: 'Venha em jejum de 2 horas.' })
    expect(JSON.stringify(pagina)).not.toContain('Interna')
    const pdf = await cliente()('GET', `/api/publico/autorizacao/${tokenDe(r)}/pdf`)
    expect(pdf.status).toBe(200)

    // Um pedido por vez; os procedimentos enviados não saem nem mudam de dente.
    expect((await api('POST', '/api/autorizacoes/ficha', { fichaId: f.id })).status).toBe(409)
    const aguardando = await ficha()
    expect(aguardando.aprovacao.situacao).toBe('AGUARDANDO')
    const item = aguardando.itens[0]
    expect((await api('DELETE', `/api/prontuario/fichas/itens/${item.id}`)).status).toBe(409)
    expect(
      (await api('PATCH', `/api/prontuario/fichas/itens/${item.id}`, { dente: '37' })).status,
    ).toBe(409)
    const andamento = await api('PATCH', `/api/prontuario/fichas/itens/${item.id}`, {
      status: 'Em tratamento',
    })
    expect(andamento.corpo.status).toBe('Em tratamento')

    // Os pedidos do planejamento ficam nele, não em "Evolução clínica".
    expect((await api('GET', `/api/autorizacoes?pacienteId=${paciente.id}`)).corpo).toEqual([])
    expect(
      (await api('GET', `/api/autorizacoes?pacienteId=${paciente.id}&fichaId=${f.id}`)).corpo,
    ).toHaveLength(1)

    await cliente()('POST', `/api/publico/autorizacao/${tokenDe(r)}`, {
      nome: 'Fulano de Teste',
      assinatura: ASSINATURA,
    })
    const assinada = await ficha()
    expect(assinada.aprovacao.situacao).toBe('APROVADO')
    const aprov = assinada.etapas.find((e: { tipo?: string }) => e.tipo === 'APROVACAO')
    expect(aprov.executado).toBe(true)
    expect(assinada.etapas.every((e: { travada: boolean }) => e.travada)).toBe(true)

    // Etapa assinada: nome e data ficam; executado muda.
    const mexida = assinada.etapas.map((e: { id: string }) =>
      e.id === cirurgia.id ? { ...e, nome: 'Outra', data: '2027-01-01', executado: true } : e,
    )
    const salvo = await api('PATCH', url, { etapas: mexida })
    expect(salvo.status).toBe(200)
    expect(salvo.corpo.etapas.find((e: { id: string }) => e.id === cirurgia.id)).toMatchObject({
      nome: 'Cirurgia',
      data: cirurgia.data,
      executado: true,
    })
    const semCirurgia = assinada.etapas.filter((e: { id: string }) => e.id !== cirurgia.id)
    expect((await api('PATCH', url, { etapas: semCirurgia })).status).toBe(409)

    // Dá para acrescentar e mandar assinar de novo: o documento novo traz o plano inteiro.
    const lote = { procedimentos: ['Coroa sobre implante'], dentes: [{ dente: '36', faces: '' }] }
    await api('POST', `${url}/itens/lote`, lote)
    await api('PATCH', url, { etapas: [...salvo.corpo.etapas, { nome: 'Moldagem', data: null }] })
    const alterada = await ficha()
    expect(alterada.aprovacao.situacao).toBe('ALTERADO')
    expect(alterada.aprovacao.alteracoes).toEqual([
      'Etapa incluída: Moldagem',
      'Incluído: Coroa sobre implante — 36',
    ])
    const nova = alterada.itens.find((i: { procedimento: string }) => i.procedimento !== 'Implante')
    expect((await api('DELETE', `/api/prontuario/fichas/itens/${nova.id}`)).status).toBe(200)
    await api('POST', `${url}/itens/lote`, lote)
    const deNovo = await api('POST', '/api/autorizacoes/ficha', { fichaId: f.id })
    expect(deNovo.status).toBe(201)
    const doc = (await cliente()('GET', `/api/publico/autorizacao/${tokenDe(deNovo)}`)).corpo
      .conteudo
    expect(doc.itens.map((i: { nome: string }) => i.nome).sort()).toEqual([
      'Coroa sobre implante',
      'Implante',
    ])

    // Cancelar devolve só os procedimentos novos; os já assinados continuam travados.
    expect((await api('POST', `/api/autorizacoes/${deNovo.corpo.id}/cancelar`)).status).toBe(200)
    const depois = await ficha()
    expect(depois.aprovacao.situacao).toBe('ALTERADO')
    expect(
      depois.itens.map((i: { procedimento: string; autorizacao: unknown }) => [
        i.procedimento,
        !!i.autorizacao,
      ]),
    ).toEqual([
      ['Implante', true],
      ['Implante', true],
      ['Coroa sobre implante', false],
    ])
  })

  it('planejamento assinado: só o administrador muda, confirmando; o novo envio é retificação', async () => {
    const api = await entrarComo('PROFISSIONAL')
    const { url, f, ficha } = await planejamento(api)
    const cirurgia = f.etapas.find((e: { nome: string }) => e.nome === 'Cirurgia')
    const r = await api('POST', '/api/autorizacoes/ficha', { fichaId: f.id })
    const assinar = (token: string) =>
      cliente()('POST', `/api/publico/autorizacao/${token}`, {
        nome: 'Fulano de Teste',
        assinatura: ASSINATURA,
      })
    await assinar(tokenDe(r))
    const assinada = await ficha()
    const item = `/api/prontuario/fichas/itens/${assinada.itens[0].id}`

    expect((await api('PATCH', `${item}?retificar=1`, { dente: '37' })).status).toBe(403)
    const adm = await entrarComo('ADMINISTRADOR')
    expect((await adm('PATCH', item, { dente: '37' })).status).toBe(409)
    expect((await adm('PATCH', `${item}?retificar=1`, { dente: '37' })).status).toBe(200)
    const mexida = assinada.etapas.map((e: { id: string }) =>
      e.id === cirurgia.id ? { ...e, data: '2027-01-01' } : e,
    )
    const salvo = await adm('PATCH', `${url}?retificar=1`, { etapas: mexida })
    expect(salvo.status).toBe(200)
    expect(salvo.corpo.etapas.find((e: { id: string }) => e.id === cirurgia.id).data).toBe(
      '2027-01-01',
    )
    const alterada = await ficha()
    expect(alterada.aprovacao).toMatchObject({ situacao: 'ALTERADO', retificacao: true })
    expect(alterada.aprovacao.alteracoes).toEqual([
      'Etapa alterada: Cirurgia (previsto para 01/01/2027)',
      'Incluído: Implante — 37 (previsto para 15/12/2026)',
      'Retirado: Implante — 36 (previsto para 15/12/2026)',
    ])

    const nova = await api('POST', '/api/autorizacoes/ficha', { fichaId: f.id })
    expect(nova.status).toBe(201)
    const doc = (await cliente()('GET', `/api/publico/autorizacao/${tokenDe(nova)}`)).corpo
    expect(doc.conteudo.retificacao).toMatchObject({ de: r.corpo.id })
    expect(doc.conteudo.itens[0].dentes).toEqual(['37', '46'])
    await assinar(tokenDe(nova))
    expect((await ficha()).aprovacao).toMatchObject({ situacao: 'APROVADO', retificacao: false })
  })

  it('planejamento sem procedimento não vai para assinar', async () => {
    const api = await entrarComo('PROFISSIONAL')
    const dentista = await db.pessoa.create({
      data: { tipo: 'PROFISSIONAL', nome: 'Dra. Vazia', nomeBusca: 'dra. vazia' },
    })
    const { corpo: paciente } = await api('POST', '/api/pacientes', PACIENTE)
    const f = await api('POST', `/api/pacientes/${paciente.id}/fichas`, {
      especialidade: 'Endodontia',
      profissionalId: dentista.id,
    })
    expect((await api('POST', '/api/autorizacoes/ficha', { fichaId: f.corpo.id })).status).toBe(400)
  })
})
