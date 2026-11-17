import { describe, expect, it, vi } from 'vitest'
import { cliente, criarUsuario, entrarComo, PACIENTE, usarServidor } from './ajuda'

usarServidor()

describe('logs (Configurações → Logs)', () => {
  it('registra login errado, alteração e ficha aberta; só o administrador vê', async () => {
    const u = await criarUsuario(['RECEPCAO'])
    await cliente()('POST', '/api/entrar', { login: u.login, senha: 'errada' })
    const recepcao = await entrarComo('RECEPCAO')
    const { corpo: p } = await recepcao('POST', '/api/pacientes', PACIENTE)
    await recepcao('GET', `/api/pacientes/${p.id}`)

    expect((await recepcao('GET', '/api/logs')).status).toBe(403)

    const adm = await entrarComo('ADMINISTRADOR')
    // A gravação é depois da resposta: espera chegar.
    const itens = await vi.waitFor(async () => {
      const { corpo } = await adm('GET', '/api/logs')
      expect(corpo.itens.some((l: { caminho: string }) => l.caminho === '/api/pacientes')).toBe(
        true,
      )
      return corpo.itens as { metodo: string; caminho: string; status: number; detalhe: string }[]
    })
    expect(itens).toContainEqual(
      expect.objectContaining({ caminho: '/api/entrar', status: 401, detalhe: u.login }),
    )
    expect(itens).toContainEqual(expect.objectContaining({ metodo: 'POST', status: 201 }))
    expect(itens).toContainEqual(
      expect.objectContaining({ metodo: 'ABRIU', detalhe: PACIENTE.nome }),
    )
    // Busca pelo paciente da ficha aberta e pelo login tentado.
    const pelaFicha = (await adm('GET', `/api/logs?busca=${encodeURIComponent('fulano de')}`)).corpo
      .itens
    expect(pelaFicha.map((l: { metodo: string }) => l.metodo)).toEqual(['ABRIU'])
    const peloLogin = (await adm('GET', `/api/logs?busca=${u.login}`)).corpo.itens
    expect(peloLogin).toContainEqual(expect.objectContaining({ caminho: '/api/entrar' }))
    expect(peloLogin).not.toContainEqual(expect.objectContaining({ metodo: 'ABRIU' }))
    // Páginas: o total soma as duas tabelas e cada página traz só o seu pedaço.
    const pag = (await adm('GET', '/api/logs?porPagina=10&pagina=1')).corpo
    expect(pag.total).toBeGreaterThanOrEqual(itens.length)
    expect(pag.itens.length).toBeLessThanOrEqual(10)
    // Nada do que foi enviado (dados do paciente, senha) vai para o log.
    expect(JSON.stringify(itens)).not.toContain('1990-01-01')
    expect(JSON.stringify(itens)).not.toContain('errada')
  })
})
