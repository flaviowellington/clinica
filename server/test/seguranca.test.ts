// Bateria de ataques (OWASP Top 10 / ASVS) contra a API de teste. Cada teste afirma o
// comportamento SEGURO: falhar aqui é uma vulnerabilidade aberta, não um teste quebrado.
// Os testes de força bruta ficam no fim: depois deles o IP do teste fica bloqueado 15 min.
import { request } from 'node:http'
import type { AddressInfo } from 'node:net'
import { beforeAll, describe, expect, it } from 'vitest'
import { criarApp } from '../src/app'
import { cliente, entrarComo, PACIENTE, urlBase, usarServidor } from './ajuda'

usarServidor()
beforeAll(() => {
  process.env.SMTP_HOST = 'json'
})

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')

/** GET cru, sem o fetch normalizar "..", para testar travessia de pasta. */
const getCru = (caminho: string) =>
  new Promise<{ status: number; corpo: string }>((ok, erro) => {
    const u = new URL(urlBase())
    request({ host: u.hostname, port: u.port, path: caminho }, (r) => {
      let corpo = ''
      r.on('data', (c) => (corpo += c)).on('end', () => ok({ status: r.statusCode!, corpo }))
    })
      .on('error', erro)
      .end()
  })

describe('A05 configuração: cabeçalhos e CORS', () => {
  it('manda os cabeçalhos de proteção do navegador', async () => {
    const r = await fetch(urlBase() + '/api/saude')
    const h = r.headers
    expect(h.get('x-powered-by')).toBeNull()
    expect(h.get('x-content-type-options')).toBe('nosniff')
    expect(h.get('content-security-policy')).toMatch(/frame-ancestors 'self'/)
    expect(h.get('content-security-policy')).toMatch(/script-src 'self'/)
    expect(h.get('strict-transport-security')).toMatch(/max-age=\d+/)
  })

  it('não libera CORS para site estranho', async () => {
    const r = await fetch(urlBase() + '/api/eu', { headers: { origin: 'https://evil.example' } })
    expect(r.headers.get('access-control-allow-origin')).not.toBe('https://evil.example')
  })

  it('JSON malformado e corpo gigante não vazam erro interno', async () => {
    const malformado = await fetch(urlBase() + '/api/entrar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"login":',
    })
    expect(malformado.status).toBe(400)
    expect(await malformado.text()).not.toMatch(/at \w+ \(|node_modules|SyntaxError/)

    const gigante = await fetch(urlBase() + '/api/entrar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login: 'x'.repeat(300_000), senha: 'x' }),
    })
    expect(gigante.status).toBe(413)
  })

  it('travessia de pasta não lê arquivos do servidor', async () => {
    for (const p of [
      '/..%2f..%2fserver%2f.env',
      '/%2e%2e/%2e%2e/server/.env',
      '/assets/..%2f..%2f..%2fserver%2f.env',
      '/..\\..\\server\\.env',
    ]) {
      const r = await getCru(p)
      expect(r.corpo, p).not.toMatch(/JWT_SEGREDO|DATABASE_URL/)
    }
  })
})

describe('A07 autenticação e sessão', () => {
  const protegidas = [
    '/api/eu',
    '/api/pacientes',
    '/api/prontuario/arquivos/1/conteudo',
    '/api/financeiro/contas',
    '/api/logs',
    '/api/usuarios',
    '/api/eventos',
  ]

  it('sem login, toda rota protegida responde 401', async () => {
    for (const p of protegidas) expect((await cliente()('GET', p)).status, p).toBe(401)
  })

  it('recusa JWT com alg "none" e JWT assinado com outro segredo', async () => {
    const adm = await entrarComo('ADMINISTRADOR')
    const sub = String(adm.usuario.id)
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub })}.`
    const [h, , s] = adm.cookie.replace('sessao=', '').split('.')
    const trocado = `${h}.${b64({ sub, exp: 9999999999 })}.${s}`
    for (const t of [none, trocado])
      expect((await cliente(`sessao=${t}`)('GET', '/api/eu')).status).toBe(401)
  })

  it('cookie de sessão é HttpOnly e SameSite=Strict', async () => {
    const adm = await entrarComo('ADMINISTRADOR')
    const r = await cliente()('POST', '/api/entrar', {
      login: adm.usuario.login,
      senha: 'senha-de-teste',
    })
    expect(r.cookie).toMatch(/HttpOnly/i)
    expect(r.cookie).toMatch(/SameSite=Strict/i)
  })

  it('depois de sair, o token antigo não vale mais', async () => {
    const eu = await entrarComo('RECEPCAO')
    await eu('POST', '/api/sair')
    expect((await eu('GET', '/api/eu')).status).toBe(401)
  })

  it('trocar a senha derruba as outras sessões abertas', async () => {
    const eu = await entrarComo('RECEPCAO')
    const outraAba = cliente(eu.cookie)
    const r = await eu('POST', '/api/eu/senha', { atual: 'senha-de-teste', nova: 'nova-senha-123' })
    expect(r.status).toBe(200)
    expect((await outraAba('GET', '/api/eu')).status).toBe(401)
    // Quem trocou recebe um cookie novo e continua dentro.
    expect((await cliente(r.cookie.split(';')[0])('GET', '/api/eu')).status).toBe(200)
  })

  it('administrador trocando a senha de alguém derruba as sessões dessa pessoa', async () => {
    const adm = await entrarComo('ADMINISTRADOR')
    const rec = await entrarComo('RECEPCAO')
    const r = await adm('POST', `/api/usuarios/${rec.usuario.id}/senha`, { senha: 'outra-senha-1' })
    expect(r.status).toBe(200)
    expect((await rec('GET', '/api/eu')).status).toBe(401)
    expect((await adm('GET', '/api/eu')).status).toBe(200)
  })
})

describe('proxy confiável (PROXY_CONFIAVEL)', () => {
  /** Sobe outra API com o proxy ligado e tenta 11 logins errados de um IP. */
  async function chutarAtras(proxy: string | undefined) {
    const antes = process.env.PROXY_CONFIAVEL
    if (proxy) process.env.PROXY_CONFIAVEL = proxy
    else delete process.env.PROXY_CONFIAVEL
    const s = criarApp().listen(0)
    process.env.PROXY_CONFIAVEL = antes
    await new Promise((ok) => s.once('listening', ok))
    const url = `http://localhost:${(s.address() as AddressInfo).port}/api/entrar`
    const entrar = (ip: string) =>
      fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
        body: JSON.stringify({ login: 'ninguem', senha: 'chute' }),
      }).then((r) => r.status)
    for (let i = 0; i < 11; i++) await entrar('203.0.113.7')
    const atacante = await entrar('203.0.113.7')
    const outro = await entrar('198.51.100.9')
    await new Promise((ok) => s.close(ok))
    return { atacante, outro }
  }

  it('atrás do proxy, o atacante bloqueado não bloqueia os outros IPs', async () => {
    expect(await chutarAtras('1')).toEqual({ atacante: 429, outro: 401 })
  })

  it('sem proxy configurado, X-Forwarded-For é ignorado (não dá para fingir outro IP)', async () => {
    expect(await chutarAtras(undefined)).toEqual({ atacante: 429, outro: 429 })
  })
})

describe('A01 controle de acesso', () => {
  it('perfil sem permissão não lê logs nem usuários', async () => {
    const rec = await entrarComo('RECEPCAO')
    expect((await rec('GET', '/api/logs')).status).toBe(403)
    expect((await rec('PUT', '/api/usuarios/1', { perfis: ['ADMINISTRADOR'] })).status).toBe(403)
  })

  it('atribuição em massa: mandar "perfis" nas preferências não vira administrador', async () => {
    const rec = await entrarComo('RECEPCAO')
    await rec('PUT', '/api/eu/preferencias', { perfis: ['ADMINISTRADOR'], ativo: true })
    expect((await rec('GET', '/api/eu')).corpo.perfis).toEqual(['RECEPCAO'])
    expect((await rec('GET', '/api/logs')).status).toBe(403)
  })

  it('links públicos não abrem com token inventado ou assinatura forjada', async () => {
    const c = cliente()
    for (const p of [
      '/api/publico/autorizacao/AAAAAAAAAAAAAAAAAAAAAAAA',
      '/api/publico/confirmacao/1.AAAAAAAAAAAAAAAAAAAAAAAA',
      '/api/publico/confirmacao/1',
      "/api/publico/confirmacao/1'%20OR%20'1'='1",
    ])
      expect((await c('GET', p)).status, p).toBe(404)
  })

  it('integração n8n sem token ou com token errado é recusada', async () => {
    process.env.INTEGRACAO_TOKEN = 'token-certo-de-teste-bem-comprido'
    const c = cliente()
    expect((await c('GET', '/api/integracao/retornos/pendentes')).status).toBe(401)
    const errado = await fetch(urlBase() + '/api/integracao/retornos/pendentes', {
      headers: { authorization: 'Bearer token-errado' },
    })
    expect(errado.status).toBe(401)
    delete process.env.INTEGRACAO_TOKEN
  })
})

describe('A03 injeção', () => {
  it('SQL injection na busca de pacientes não vaza nem atrasa', async () => {
    const rec = await entrarComo('RECEPCAO')
    await rec('POST', '/api/pacientes', PACIENTE)
    for (const busca of [
      "' OR '1'='1",
      "123' OR 1=1--",
      "%' ; SELECT pg_sleep(3) --",
      '123); SELECT pg_sleep(3); --',
    ]) {
      const t = Date.now()
      const r = await rec('GET', `/api/pacientes?busca=${encodeURIComponent(busca)}`)
      expect(Date.now() - t, busca).toBeLessThan(2500)
      expect(r.status, busca).toBe(200)
      expect(r.corpo.total, busca).toBe(0)
    }
  })

  it('poluição de protótipo pelo JSON não contamina o servidor', async () => {
    const rec = await entrarComo('RECEPCAO')
    await fetch(urlBase() + '/api/pacientes', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: rec.cookie },
      body: `{"nome":"Fulano","nascimento":"1990-01-01","__proto__":{"poluido":true},"constructor":{"prototype":{"poluido":true}}}`,
    })
    expect(({} as Record<string, unknown>).poluido).toBeUndefined()
  })

  it('upload: HTML/SVG/script disfarçado de imagem é recusado (XSS armazenado)', async () => {
    const dentista = await entrarComo('ADMINISTRADOR')
    const p = await dentista('POST', '/api/pacientes', PACIENTE)
    const html = new TextEncoder().encode('<html><script>alert(document.cookie)</script></html>')
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>',
    )
    const url = `/api/pacientes/${p.corpo.id}/arquivos?categoria=DOCUMENTO&nome=x.html`
    for (const [corpo, tipo] of [
      [html, 'image/png'],
      [html, 'text/html'],
      [svg, 'image/svg+xml'],
      [html, 'application/pdf'],
    ] as const)
      expect((await dentista('POST', url, corpo, tipo)).status, tipo).toBe(400)
  })
})

describe('DoS de aplicação', () => {
  it('um usuário não consegue abrir conexões de tempo real sem limite', async () => {
    const eu = await entrarComo('RECEPCAO')
    const abortar = new AbortController()
    const status = await Promise.all(
      Array.from({ length: 30 }, () =>
        fetch(urlBase() + '/api/eventos', {
          headers: { cookie: eu.cookie },
          signal: abortar.signal,
        })
          .then((r) => r.status)
          .catch(() => 0),
      ),
    )
    abortar.abort()
    expect(status.filter((s) => s === 200).length).toBeLessThanOrEqual(10)
  })
})

// ── Força bruta (por último: bloqueia o IP do teste) ────────────────────────
describe('A07 força bruta', () => {
  it('"esqueci a senha" não deixa disparar e-mails sem limite', async () => {
    const c = cliente()
    const status: number[] = []
    for (let i = 0; i < 15; i++)
      status.push((await c('POST', '/api/senha/codigo', { email: 'alvo@exemplo.com' })).status)
    expect(status).toContain(429)
  })

  it('login bloqueia depois de 10 erros, mesmo trocando X-Forwarded-For', async () => {
    const status: number[] = []
    for (let i = 0; i < 12; i++) {
      const r = await fetch(urlBase() + '/api/entrar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${i}` },
        body: JSON.stringify({ login: 'admin', senha: `chute${i}` }),
      })
      status.push(r.status)
    }
    expect(status.slice(-2)).toEqual([429, 429])
  })
})
