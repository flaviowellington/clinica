// RBAC: a porta de entrada (login) e a troca de perfil. A matriz perfil × rota está em
// permissoes.manual.ts (npm run test:permissoes); aqui fica o que tem que rodar sempre.
import jwt from 'jsonwebtoken'
import { describe, expect, it } from 'vitest'
import { db } from '../src/db'
import { COOKIE } from '../src/auth'
import { cliente, entrarComo, usarServidor } from './ajuda'

usarServidor()

// Todo prefixo montado com exigirLogin em app.ts. Rota nova protegida entra aqui.
const PROTEGIDAS = [
  '/api/eu',
  '/api/pacientes',
  '/api/prontuario',
  '/api/lixeira',
  '/api/agenda',
  '/api/profissionais',
  '/api/financeiro',
  '/api/retornos',
  '/api/procedimentos',
  '/api/orcamentos',
  '/api/autorizacoes',
  '/api/relatorios',
  '/api/usuarios',
  '/api/configuracoes',
  '/api/protetico',
  '/api/confirmacoes',
  '/api/mensagens',
  '/api/painel',
  '/api/importacao',
  '/api/logs',
]
const comToken = (token: string) => cliente(`${COOKIE}=${token}`)

/**
 * Confere que nenhum prefixo protegido deixa passar esse cliente. O login é exigido no prefixo,
 * antes da rota, então um GET e uma escrita bastam (e cabem no limite de pedidos por minuto).
 */
async function tudoFechado(api: ReturnType<typeof cliente>) {
  expect.soft((await api('GET', '/api/eventos')).status, 'GET /api/eventos').toBe(401)
  for (const p of PROTEGIDAS) {
    expect.soft((await api('GET', p)).status, `GET ${p}`).toBe(401)
    expect.soft((await api('POST', `${p}/1`, {})).status, `POST ${p}/1`).toBe(401)
  }
}

describe('RBAC: sem sessão válida, nada protegido responde', () => {
  it('sem cookie', () => tudoFechado(cliente()))

  it('token assinado com outro segredo', () =>
    tudoFechado(comToken(jwt.sign({ sub: '1' }, 'x'.repeat(40)))))

  it('token vencido', async () => {
    const u = await entrarComo('ADMINISTRADOR')
    const vencido = jwt.sign({ sub: String(u.usuario.id) }, process.env.JWT_SEGREDO!, {
      expiresIn: -1,
    })
    await tudoFechado(comToken(vencido))
  })

  it('token de usuário que não existe mais', async () => {
    const u = await entrarComo('ADMINISTRADOR')
    await db.usuario.delete({ where: { id: u.usuario.id } })
    expect((await u('GET', '/api/eu')).status).toBe(401)
  })

  it('usuário inativado perde o acesso na hora, com a sessão aberta', async () => {
    const u = await entrarComo('ADMINISTRADOR')
    expect([401, 403]).not.toContain((await u('GET', '/api/painel')).status)
    await db.usuario.update({ where: { id: u.usuario.id }, data: { ativo: false } })
    await tudoFechado(u)
  })

  it('usuário inativado não entra de novo', async () => {
    const u = await entrarComo('RECEPCAO')
    await db.usuario.update({ where: { id: u.usuario.id }, data: { ativo: false } })
    const r = await cliente()('POST', '/api/entrar', {
      login: u.usuario.login,
      senha: 'senha-de-teste',
    })
    expect(r.status).toBe(401)
    expect(r.cookie).toBe('')
  })

  it('sair apaga o cookie', async () => {
    const u = await entrarComo('RECEPCAO')
    const r = await u('POST', '/api/sair')
    expect(r.cookie).toMatch(new RegExp(`^${COOKIE}=;`))
  })
})

describe('RBAC: perfis', () => {
  it('trocar o perfil vale no próximo pedido, sem novo login', async () => {
    const u = await entrarComo('RECEPCAO')
    expect((await u('GET', '/api/painel')).status).toBe(403)
    await db.usuario.update({ where: { id: u.usuario.id }, data: { perfis: ['ADMINISTRADOR'] } })
    expect([401, 403]).not.toContain((await u('GET', '/api/painel')).status)
    await db.usuario.update({ where: { id: u.usuario.id }, data: { perfis: ['RECEPCAO'] } })
    expect((await u('GET', '/api/painel')).status).toBe(403)
  })

  it('usuário sem nenhum perfil só vê os próprios dados', async () => {
    const u = await entrarComo()
    expect((await u('GET', '/api/eu')).status).toBe(200)
    for (const url of ['/api/pacientes', '/api/agenda?data=2026-11-06', '/api/protetico'])
      expect.soft((await u('GET', url)).status, url).toBe(403)
  })

  it('o 403 não vaza dados', async () => {
    const r = await (await entrarComo('RECEPCAO'))('GET', '/api/usuarios')
    expect(r.status).toBe(403)
    expect(Object.keys(r.corpo)).toEqual(['erro'])
  })

  it('ninguém se dá perfil de administrador pelo /eu', async () => {
    const u = await entrarComo('RECEPCAO')
    await u('PUT', '/api/eu/preferencias', { perfis: ['ADMINISTRADOR'] })
    const depois = await db.usuario.findUniqueOrThrow({ where: { id: u.usuario.id } })
    expect(depois.perfis).toEqual(['RECEPCAO'])
  })
})

describe('RBAC: o que é público continua público', () => {
  it.each([
    ['GET', '/api/saude'],
    ['GET', '/api/publico/confirmacao/token-que-nao-existe'],
    ['GET', '/api/publico/autorizacao/token-que-nao-existe'],
  ])('%s %s não pede login', async (m, url) => {
    expect((await cliente()(m, url)).status).not.toBe(401)
  })
})
