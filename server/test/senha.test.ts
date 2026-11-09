// Esqueci a senha: o código vai por e-mail e troca a senha.
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '../src/db'
import { cliente, criarUsuario, usarServidor } from './ajuda'
import { enviarEmail } from '../src/mensagens'

// O e-mail não sai: guardamos a mensagem para ler o código.
vi.mock('../src/mensagens', async (original) => ({
  ...(await original<typeof import('../src/mensagens')>()),
  enviarEmail: vi.fn(async () => {}),
}))

usarServidor()
beforeAll(() => {
  process.env.SMTP_HOST = 'json'
})

const enviado = vi.mocked(enviarEmail)

/** Pede o código e devolve o que foi no e-mail. */
async function pedirCodigo(email: string) {
  enviado.mockClear()
  const r = await cliente()('POST', '/api/senha/codigo', { email })
  expect(r.status).toBe(200)
  await vi.waitFor(() => expect(enviado).toHaveBeenCalled())
  const m = enviado.mock.calls[0][0]
  expect(m.para).toBe(email.toLowerCase())
  return m.texto.match(/\b\d{6}\b/)![0]
}

describe('esqueci a senha', () => {
  it('código certo troca a senha e já entra; o código só vale uma vez', async () => {
    const u = await criarUsuario(['RECEPCAO'])
    await db.usuario.update({ where: { id: u.id }, data: { email: 'maria@example.com' } })
    const codigo = await pedirCodigo('Maria@Example.com')

    const errado = codigo === '000000' ? '111111' : '000000'
    const corpo = { email: 'maria@example.com', senha: 'senha-nova-123' }
    expect(
      (await cliente()('POST', '/api/senha/redefinir', { ...corpo, codigo: errado })).status,
    ).toBe(400)

    const r = await cliente()('POST', '/api/senha/redefinir', { ...corpo, codigo })
    expect(r.status).toBe(200)
    expect(r.cookie).toContain('sessao=')
    const entrar = await cliente()('POST', '/api/entrar', {
      login: u.login,
      senha: 'senha-nova-123',
    })
    expect(entrar.status).toBe(200)
    expect((await cliente()('POST', '/api/senha/redefinir', { ...corpo, codigo })).status).toBe(400)
  })

  it('e-mail sem conta responde igual e não envia nada', async () => {
    enviado.mockClear()
    const r = await cliente()('POST', '/api/senha/codigo', { email: 'ninguem@example.com' })
    expect(r.status).toBe(200)
    await new Promise((ok) => setTimeout(ok, 100))
    expect(enviado).not.toHaveBeenCalled()
  })

  it('código vencido ou com tentativas demais não vale', async () => {
    const u = await criarUsuario(['FINANCEIRO'])
    await db.usuario.update({ where: { id: u.id }, data: { email: 'joao@example.com' } })
    const codigo = await pedirCodigo('joao@example.com')
    const corpo = { email: 'joao@example.com', senha: 'senha-nova-123', codigo }

    await db.usuario.update({ where: { id: u.id }, data: { codigoTentativas: 5 } })
    expect((await cliente()('POST', '/api/senha/redefinir', corpo)).status).toBe(400)

    await db.usuario.update({
      where: { id: u.id },
      data: { codigoTentativas: 0, codigoExpira: new Date(Date.now() - 1000) },
    })
    expect((await cliente()('POST', '/api/senha/redefinir', corpo)).status).toBe(400)
  })
})
