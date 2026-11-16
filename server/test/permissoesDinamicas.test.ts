// Permissões dinâmicas: o administrador muda a matriz em Configurações → Permissões.
import { afterEach, describe, expect, it } from 'vitest'
import { entrarComo, usarServidor } from './ajuda'
import { definirMatriz, MATRIZ_PADRAO, pode } from '../../shared/permissoes'

usarServidor()
afterEach(() => definirMatriz({}))

describe('permissões dinâmicas', () => {
  it('sem o "ver" do módulo, a ação de dentro não vale; o administrador pode tudo', () => {
    definirMatriz({ 'relatorio.ver': [], 'relatorio.agenda': ['FINANCEIRO'] })
    expect(pode(['FINANCEIRO'], 'relatorio.agenda')).toBe(false)
    definirMatriz({ 'relatorio.ver': ['FINANCEIRO'], 'relatorio.agenda': ['FINANCEIRO'] })
    expect(pode(['FINANCEIRO'], 'relatorio.agenda')).toBe(true)
    definirMatriz({ 'usuario.gerenciar': [] })
    expect(pode(['ADMINISTRADOR'], 'usuario.gerenciar')).toBe(true)
  })

  it('gravar a matriz muda o acesso na hora e chega no /eu', async () => {
    const admin = await entrarComo('ADMINISTRADOR')
    const recepcao = await entrarComo('RECEPCAO')
    expect((await recepcao('GET', '/api/painel')).status).toBe(403)

    const nova = { ...MATRIZ_PADRAO, 'painel.ver': ['ADMINISTRADOR', 'RECEPCAO', 'X'] }
    expect((await recepcao('PUT', '/api/configuracoes/permissoes', nova)).status).toBe(403)
    const r = await admin('PUT', '/api/configuracoes/permissoes', nova)
    expect(r.status).toBe(200)
    expect(r.corpo['painel.ver']).toEqual(['ADMINISTRADOR', 'RECEPCAO'])

    expect((await recepcao('GET', '/api/painel')).status).not.toBe(403)
    expect((await recepcao('GET', '/api/eu')).corpo.permissoes['painel.ver']).toContain('RECEPCAO')
  })
})
