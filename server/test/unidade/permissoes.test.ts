// Permissões por perfil (shared/permissoes.ts) e o catálogo de relatórios (shared/relatorios.ts).
import { afterEach, describe, expect, it } from 'vitest'
import {
  ACOES,
  MATRIZ_PADRAO,
  MODULOS,
  PERFIS,
  definirMatriz,
  lerMatriz,
  pode,
  podeDarDesconto,
  podeNotaFiscal,
  type Acao,
  type Perfil,
} from '../../../shared/permissoes'
import { GRUPOS, acharRelatorio } from '../../../shared/relatorios'

const PERFIS_LISTA = Object.keys(PERFIS) as Perfil[]
const verDe = new Map(MODULOS.flatMap((m) => m.itens.map((i) => [i.acao, m.ver] as const)))

afterEach(() => definirMatriz({})) // volta ao padrão

describe('pode()', () => {
  it('Administrador pode tudo, sempre', () => {
    for (const a of ACOES) expect(pode(['ADMINISTRADOR'], a)).toBe(true)
  })
  it('Administrador pode tudo mesmo com a matriz zerada', () => {
    definirMatriz(Object.fromEntries(ACOES.map((a) => [a, []])) as never)
    for (const a of ACOES) expect(pode(['ADMINISTRADOR'], a)).toBe(true)
  })
  it('sem perfil, nada', () => {
    for (const a of ACOES) expect(pode([], a)).toBe(false)
  })
  it('cada perfil segue a matriz padrão e o "ver" do módulo', () => {
    for (const p of PERFIS_LISTA.filter((x) => x !== 'ADMINISTRADOR'))
      for (const a of ACOES) {
        const ver = verDe.get(a)
        const esperado = MATRIZ_PADRAO[a].includes(p) && (!ver || MATRIZ_PADRAO[ver].includes(p))
        expect(pode([p], a), `${p} → ${a}`).toBe(esperado)
      }
  })
  it('vários perfis: a permissão é a soma', () => {
    for (const a of ACOES)
      expect(pode(['RECEPCAO', 'FINANCEIRO'], a)).toBe(
        pode(['RECEPCAO'], a) || pode(['FINANCEIRO'], a),
      )
  })
  it('sem o "ver" do módulo, a ação de dentro não vale', () => {
    const item = MODULOS.flatMap((m) => m.itens.map((i) => ({ ...i, ver: m.ver }))).find(
      (i) => i.acao !== i.ver,
    )!
    definirMatriz({ [item.acao]: ['RECEPCAO'], [item.ver]: [] } as Partial<Record<Acao, Perfil[]>>)
    expect(pode(['RECEPCAO'], item.acao)).toBe(false)
    definirMatriz({ [item.acao]: ['RECEPCAO'], [item.ver]: ['RECEPCAO'] } as never)
    expect(pode(['RECEPCAO'], item.acao)).toBe(true)
  })
  it('definirMatriz: o que não vier fica no padrão', () => {
    // As que não dependem de paciente.ver ficam como estavam.
    const outras = ACOES.filter((a) => a !== 'paciente.ver' && verDe.get(a) !== 'paciente.ver')
    const antes = outras.map((a) => pode(['RECEPCAO'], a))
    definirMatriz({ 'paciente.ver': ['ADMINISTRADOR'] })
    expect(pode(['RECEPCAO'], 'paciente.ver')).toBe(false)
    expect(outras.map((a) => pode(['RECEPCAO'], a))).toEqual(antes)
  })
})

describe('lerMatriz (tela de permissões)', () => {
  it.each([null, undefined, 'x', 42])('recusa %s', (v) => expect(lerMatriz(v)).toBeNull())
  it('recusa ação com valor que não é lista', () => {
    expect(lerMatriz({ 'paciente.ver': 'RECEPCAO' })).toBeNull()
  })
  it('limpa perfis desconhecidos e repetidos', () => {
    const m = lerMatriz({ 'paciente.ver': ['RECEPCAO', 'HACKER', 'RECEPCAO', 7] })!
    expect(m['paciente.ver']).toEqual(['RECEPCAO'])
  })
  it('ignora ações desconhecidas e completa com o padrão', () => {
    const m = lerMatriz({ 'acao.inventada': ['RECEPCAO'] })!
    expect(m).not.toHaveProperty('acao.inventada')
    expect(m).toEqual(MATRIZ_PADRAO)
  })
  it('objeto vazio = matriz padrão', () => expect(lerMatriz({})).toEqual(MATRIZ_PADRAO))
})

describe('estrutura da matriz', () => {
  it('toda ação da tela existe na matriz, e todo "ver" também', () => {
    for (const m of MODULOS) {
      expect(ACOES).toContain(m.ver)
      for (const i of m.itens) expect(ACOES).toContain(i.acao)
    }
  })
  it('a matriz padrão só tem perfis conhecidos', () => {
    for (const a of ACOES) for (const p of MATRIZ_PADRAO[a]) expect(PERFIS_LISTA).toContain(p)
  })
  it('todo item da tela tem rótulo', () => {
    for (const m of MODULOS) for (const i of m.itens) expect(i.rotulo.trim()).not.toBe('')
  })
})

describe('regras especiais', () => {
  it('nota fiscal: pela ficha ou pelo financeiro', () => {
    expect(podeNotaFiscal(['ADMINISTRADOR'])).toBe(true)
    expect(podeNotaFiscal([])).toBe(false)
    for (const p of PERFIS_LISTA)
      expect(podeNotaFiscal([p])).toBe(
        pode([p], 'paciente.notaFiscal') || pode([p], 'financeiro.notaFiscal'),
      )
  })
  it('desconto: por usuário escolhido; administrador sempre', () => {
    expect(podeDarDesconto({ id: 5, perfis: ['RECEPCAO'] }, [5])).toBe(true)
    expect(podeDarDesconto({ id: 5, perfis: ['RECEPCAO'] }, [])).toBe(false)
    expect(podeDarDesconto({ id: 5, perfis: ['FINANCEIRO'] }, [6])).toBe(false)
    expect(podeDarDesconto({ id: 1, perfis: ['ADMINISTRADOR'] }, [])).toBe(true)
  })
})

describe('catálogo de relatórios', () => {
  const todos = GRUPOS.flatMap((g) => g.itens)
  it('ids sem repetir', () => expect(new Set(todos.map((r) => r.id)).size).toBe(todos.length))
  it('a permissão de cada grupo é uma ação conhecida', () => {
    for (const g of GRUPOS) expect(ACOES).toContain(g.permissao)
  })
  it('acharRelatorio traz o grupo e a permissão', () => {
    const g = GRUPOS[0]
    const r = acharRelatorio(g.itens[0].id)
    expect(r).toMatchObject({ id: g.itens[0].id, grupo: g.titulo, permissao: g.permissao })
  })
  it('todo relatório é achado pelo id', () => {
    for (const r of todos) expect(acharRelatorio(r.id)?.titulo).toBe(r.titulo)
  })
  it('id desconhecido → null', () => expect(acharRelatorio('nao-existe')).toBeNull())
})
