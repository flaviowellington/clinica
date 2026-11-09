// Módulo Mensagens: escolher o paciente e mandar texto livre, confirmação ou pedido de assinatura,
// por e-mail ou WhatsApp (WhatsApp pronto, mas sem a API ligada ainda).
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../src/db'
import { cliente, entrarComo, PACIENTE, usarServidor } from './ajuda'
import { tokenConfirmacao } from '../src/confirmacoes'

usarServidor()

beforeAll(() => {
  process.env.SMTP_HOST = 'json'
  process.env.EMAIL_REMETENTE = 'clinica@example.com'
})
afterEach(() => {
  delete process.env.WHATSAPP_TOKEN
  delete process.env.WHATSAPP_NUMERO_ID
})

async function base(api: Awaited<ReturnType<typeof entrarComo>>) {
  const prof = await db.pessoa.create({
    data: { tipo: 'PROFISSIONAL', nome: 'Dra. Teste', nomeBusca: 'dra. teste' },
  })
  const { corpo: pac } = await api('POST', '/api/pacientes', {
    ...PACIENTE,
    email: 'fulano@example.com',
    celular: '(11) 99999-0000',
  })
  const { corpo: c } = await api('POST', '/api/agenda', {
    tipo: 'CONSULTA',
    data: '2099-01-10',
    inicio: '09:00',
    profissionalId: prof.id,
    pacienteId: pac.id,
  })
  const a = await db.autorizacao.create({
    data: {
      pacienteId: pac.id,
      token: 'token-de-teste',
      criadoPorId: api.usuario.id,
      conteudo: { paciente: pac.nome, termo: 'x', itens: [{ nome: 'Limpeza' }] },
    },
  })
  return { pac, c, a }
}

describe('mensagens', () => {
  it('lista as consultas futuras e os pedidos de assinatura em aberto do paciente', async () => {
    const api = await entrarComo('RECEPCAO')
    const { pac, c, a } = await base(api)
    const r = await api('GET', `/api/mensagens/paciente/${pac.id}`)
    expect(r.status).toBe(200)
    expect(r.corpo).toMatchObject({
      paciente: { id: pac.id, email: 'fulano@example.com' },
      consultas: [{ id: c.id, inicio: '09:00', confirmadoEm: null }],
      autorizacoes: [{ id: a.id, titulo: 'Procedimentos: Limpeza', planejamento: false }],
    })
  })

  it('manda texto livre por e-mail e registra', async () => {
    const api = await entrarComo('RECEPCAO')
    const { pac } = await base(api)
    const r = await api('POST', `/api/mensagens/paciente/${pac.id}`, {
      canal: 'EMAIL',
      assunto: 'Aviso',
      texto: 'Olá, tudo bem?',
    })
    expect(r.status).toBe(200)
    expect(await db.mensagem.findFirst()).toMatchObject({
      tipo: 'TEXTO',
      canal: 'EMAIL',
      destino: 'fulano@example.com',
      texto: 'Olá, tudo bem?',
      status: 'ENVIADA',
    })
    expect(
      (await api('POST', `/api/mensagens/paciente/${pac.id}`, { canal: 'EMAIL', texto: '' }))
        .status,
    ).toBe(400)
  })

  it('devolve o histórico do que foi enviado ao paciente, do mais novo ao mais antigo', async () => {
    const api = await entrarComo('RECEPCAO')
    const { pac } = await base(api)
    await api('POST', `/api/mensagens/paciente/${pac.id}`, { canal: 'EMAIL', texto: 'Primeira' })
    await api('POST', `/api/mensagens/paciente/${pac.id}`, { canal: 'EMAIL', texto: 'Segunda' })
    await db.mensagem.create({
      data: { canal: 'EMAIL', tipo: 'TEXTO', destino: 'outro@example.com', status: 'ENVIADA' },
    })
    const r = await api('GET', `/api/mensagens/paciente/${pac.id}`)
    expect(r.corpo.historico).toMatchObject([
      { texto: 'Segunda', canal: 'EMAIL', status: 'ENVIADA' },
      { texto: 'Primeira' },
    ])
  })

  it('pedido de assinatura sai por e-mail pelo módulo', async () => {
    const api = await entrarComo('RECEPCAO')
    const { a } = await base(api)
    expect((await api('POST', `/api/autorizacoes/${a.id}/enviar`, { canal: 'EMAIL' })).status).toBe(
      200,
    )
    expect(await db.mensagem.findFirst()).toMatchObject({ tipo: 'AUTORIZACAO', canal: 'EMAIL' })
  })

  it('pedido assinado aparece no módulo e sai com o link do PDF assinado', async () => {
    const api = await entrarComo('RECEPCAO')
    const { pac, a } = await base(api)
    await db.autorizacao.update({
      where: { id: a.id },
      data: { assinadoEm: new Date(), assinanteNome: 'Fulano' },
    })
    const r = await api('GET', `/api/mensagens/paciente/${pac.id}`)
    expect(r.corpo.autorizacoes).toMatchObject([{ id: a.id, assinadoEm: expect.any(String) }])
    expect((await api('POST', `/api/autorizacoes/${a.id}/enviar`, { canal: 'EMAIL' })).status).toBe(
      200,
    )
    expect(await db.mensagem.findFirst()).toMatchObject({ tipo: 'AUTORIZACAO_ASSINADA' })
    // Sem a API do WhatsApp, o texto pronto já leva o link do PDF.
    const w = await api('POST', `/api/autorizacoes/${a.id}/enviar`, { canal: 'WHATSAPP' })
    expect(decodeURIComponent(w.corpo.whatsappWeb)).toContain(
      '/api/publico/autorizacao/token-de-teste/pdf',
    )
  })

  it('WhatsApp sem API: 501 com o link do WhatsApp Web já com o texto', async () => {
    const api = await entrarComo('RECEPCAO')
    const { pac, c, a } = await base(api)
    const caminhos = [
      [`/api/mensagens/paciente/${pac.id}`, { canal: 'WHATSAPP', texto: 'Oi' }],
      [`/api/confirmacoes/${c.id}/enviar`, { canal: 'WHATSAPP' }],
      [`/api/autorizacoes/${a.id}/enviar`, { canal: 'WHATSAPP' }],
    ] as const
    for (const [caminho, corpo] of caminhos) {
      const r = await api('POST', caminho, corpo)
      expect(r.status).toBe(501)
      expect(r.corpo.whatsappWeb).toMatch(/^https:\/\/wa\.me\/5511999990000\?text=/)
    }
    expect(await db.mensagem.count()).toBe(0)
  })

  it('WhatsApp com API ligada chama a Meta e registra', async () => {
    process.env.WHATSAPP_TOKEN = 't'
    process.env.WHATSAPP_NUMERO_ID = '123'
    const original = globalThis.fetch
    const chamadas: string[] = []
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (String(url).startsWith('https://graph.facebook.com')) {
        chamadas.push(String(init?.body))
        return new Response('{}', { status: 200 })
      }
      return original(url, init)
    }) as typeof fetch
    try {
      const api = await entrarComo('RECEPCAO')
      const { pac } = await base(api)
      const r = await api('POST', `/api/mensagens/paciente/${pac.id}`, {
        canal: 'WHATSAPP',
        texto: 'Oi',
      })
      expect(r.status).toBe(200)
      expect(JSON.parse(chamadas[0])).toMatchObject({ to: '5511999990000', text: { body: 'Oi' } })
      expect(await db.mensagem.findFirst()).toMatchObject({ canal: 'WHATSAPP', status: 'ENVIADA' })
    } finally {
      globalThis.fetch = original
    }
  })

  it('o link do e-mail confirma com um clique e a consulta já aparece Confirmada na agenda', async () => {
    const api = await entrarComo('RECEPCAO')
    const { c } = await base(api)
    await api('POST', `/api/confirmacoes/${c.id}/enviar`, { canal: 'EMAIL' })
    expect(
      (await cliente()('POST', `/api/publico/confirmacao/${tokenConfirmacao(c.id)}`)).status,
    ).toBe(200)
    const agenda = await api('GET', '/api/agenda?de=2099-01-10')
    expect(JSON.stringify(agenda.corpo)).toContain('"CONFIRMADO"')
  })
})
