// Regras do prontuário (shared/prontuario.ts): dentes, faces, agrupamento, anamnese,
// etapas do planejamento e modelos de documento.
import { describe, expect, it } from 'vitest'
import {
  DENTES_VALIDOS,
  ETAPAS_FIXAS,
  FACES,
  MODELO_ANAMNESE,
  MODELOS_DOCUMENTO,
  agruparProcedimentos,
  alertasDaAnamnese,
  comEtapasFixas,
  denteComFaces,
  etapasDaFicha,
  facesDoDente,
  faltandoObrigatorias,
  lerPerguntas,
  normalizarFaces,
  preencherModelo,
  type Pergunta,
} from '../../../shared/prontuario'

describe('DENTES_VALIDOS (FDI)', () => {
  it('52 dentes: 32 permanentes + 20 decíduos', () => expect(DENTES_VALIDOS.size).toBe(52))
  it.each(['11', '18', '28', '38', '48', '51', '55', '65', '75', '85'])('aceita %s', (d) =>
    expect(DENTES_VALIDOS.has(d)).toBe(true),
  )
  it.each(['00', '10', '19', '29', '56', '66', '86', '91', '1', '111', 'ab'])('recusa %s', (d) =>
    expect(DENTES_VALIDOS.has(d)).toBe(false),
  )
})

describe('facesDoDente: as 6 partes clicáveis, na ordem da tela', () => {
  it.each([
    // dente, [esquerda, centro, direita, cervical, baixo, cima]
    ['11', ['D', 'I', 'M', 'C', 'P', 'V']], // anterior superior direito
    ['16', ['D', 'O', 'M', 'C', 'P', 'V']], // molar superior direito
    ['21', ['M', 'I', 'D', 'C', 'P', 'V']], // anterior superior esquerdo
    ['26', ['M', 'O', 'D', 'C', 'P', 'V']], // molar superior esquerdo
    ['33', ['M', 'I', 'D', 'C', 'V', 'L']], // canino inferior esquerdo
    ['36', ['M', 'O', 'D', 'C', 'V', 'L']], // molar inferior esquerdo
    ['43', ['D', 'I', 'M', 'C', 'V', 'L']], // canino inferior direito
    ['46', ['D', 'O', 'M', 'C', 'V', 'L']], // molar inferior direito
    ['53', ['D', 'I', 'M', 'C', 'P', 'V']], // decíduo superior direito
    ['65', ['M', 'O', 'D', 'C', 'P', 'V']], // decíduo superior esquerdo
    ['73', ['M', 'I', 'D', 'C', 'V', 'L']], // decíduo inferior esquerdo
    ['84', ['D', 'O', 'M', 'C', 'V', 'L']], // decíduo inferior direito
  ])('%s → %j', (dente, faces) => expect(facesDoDente(dente)).toEqual(faces))

  it('todo dente válido tem 6 faces diferentes, todas conhecidas, com cervical', () => {
    for (const d of DENTES_VALIDOS) {
      const f = facesDoDente(d)
      expect(new Set(f).size).toBe(6)
      expect(f.every((x) => (FACES as readonly string[]).includes(x))).toBe(true)
      expect(f).toContain('C')
    }
  })
  it('superior tem palatina (nunca lingual); inferior tem lingual (nunca palatina)', () => {
    for (const d of DENTES_VALIDOS) {
      const sup = ['1', '2', '5', '6'].includes(d[0])
      expect(facesDoDente(d)).toContain(sup ? 'P' : 'L')
      expect(facesDoDente(d)).not.toContain(sup ? 'L' : 'P')
    }
  })
  it('anteriores (posição 1 a 3) têm incisal; posteriores, oclusal', () => {
    for (const d of DENTES_VALIDOS) expect(facesDoDente(d)[1]).toBe(Number(d[1]) <= 3 ? 'I' : 'O')
  })
})

describe('normalizarFaces e denteComFaces (R-069)', () => {
  it.each([
    ['om', 'MO'],
    ['OM', 'MO'],
    ['ddoo', 'DO'],
    ['cvp', 'VPC'],
    ['vplmdoic', 'VPLMDOIC'],
    ['xyz', ''],
    ['', ''],
  ])('"%s" → "%s"', (entrada, saida) => expect(normalizarFaces(entrada)).toBe(saida))
  it('null e undefined viram vazio', () => {
    expect(normalizarFaces(null)).toBe('')
    expect(normalizarFaces(undefined)).toBe('')
  })
  it('dente + faces', () => {
    expect(denteComFaces('16', 'MO')).toBe('16MO')
    expect(denteComFaces('16', null)).toBe('16')
    expect(denteComFaces('16', '')).toBe('16')
    expect(denteComFaces(null, 'MO')).toBe('')
  })
})

describe('agruparProcedimentos: um lançamento em vários dentes vira um cartão', () => {
  const base = {
    origem: 'clinico',
    nome: 'Restauração',
    status: 'A_REALIZAR',
    data: '2026-11-17',
    profissional: { id: 1 },
    observacao: null,
    orcamentoId: null,
  }
  it('mesmo lançamento em 3 dentes → 1 grupo com 3', () => {
    const g = agruparProcedimentos([
      { ...base, dente: '11' },
      { ...base, dente: '12' },
      { ...base, dente: '13' },
    ])
    expect(g).toHaveLength(1)
    expect(g[0].map((i) => i.dente)).toEqual(['11', '12', '13'])
  })
  it.each([
    ['nome', { nome: 'Outro' }],
    ['situação', { status: 'EXECUTADO' }],
    ['data', { data: '2026-11-18' }],
    ['profissional', { profissional: { id: 2 } }],
    ['observação', { observacao: 'x' }],
    ['orçamento', { orcamentoId: 7 }],
    ['origem', { origem: 'orcamento' }],
  ])('%s diferente separa o grupo', (_, mudanca) => {
    expect(agruparProcedimentos([base, { ...base, ...mudanca }])).toHaveLength(2)
  })
  it('mantém a ordem da primeira aparição', () => {
    const a = { ...base, nome: 'A' }
    const b = { ...base, nome: 'B' }
    const g = agruparProcedimentos([a, b, a])
    expect(g.map((x) => x[0].nome)).toEqual(['A', 'B'])
    expect(g[0]).toHaveLength(2)
  })
  it('lista vazia → nenhum grupo', () => expect(agruparProcedimentos([])).toEqual([]))
})

describe('anamnese: obrigatórias e alertas (R-059, R-074)', () => {
  const responder = (r: Record<number, string>): Pergunta[] =>
    MODELO_ANAMNESE.map((p, i) => ({ ...p, resposta: r[i] ?? null }))

  it('o modelo da clínica tem 2 obrigatórias (índices 0 e 2)', () => {
    expect(faltandoObrigatorias(MODELO_ANAMNESE)).toEqual([0, 2])
  })
  it('respondidas, não falta nada', () => {
    expect(faltandoObrigatorias(responder({ 0: 'Não', 2: 'Não' }))).toEqual([])
  })
  it('resposta só com espaços conta como vazia', () => {
    expect(faltandoObrigatorias(responder({ 0: '   ', 2: 'Não' }))).toEqual([0])
  })
  it('Sim/Não com alerta: só "Sim" vira alerta', () => {
    const alertas = alertasDaAnamnese(responder({ 1: 'Sim', 2: 'Não', 3: 'Sim' }))
    expect(alertas.map((p) => p.texto)).toEqual(['Toma algum medicamento? Qual?', 'Tem diabetes?'])
  })
  it('pergunta sem alerta respondida "Sim" não vira alerta', () => {
    // "Fuma?" (índice 9) não é alerta.
    expect(alertasDaAnamnese(responder({ 9: 'Sim' }))).toEqual([])
  })
  it('descritiva com alerta: qualquer resposta vira alerta', () => {
    const p: Pergunta[] = [
      { texto: 'Alergias?', tipo: 'DESCRITIVA', alerta: true, resposta: 'Látex' },
      { texto: 'Outra', tipo: 'DESCRITIVA', alerta: true, resposta: '  ' },
    ]
    expect(alertasDaAnamnese(p).map((x) => x.resposta)).toEqual(['Látex'])
  })
})

describe('lerPerguntas: limpa o que veio do navegador', () => {
  it.each([
    ['não é lista', 'x'],
    ['lista vazia', []],
    ['mais de 100', Array.from({ length: 101 }, () => ({ texto: 'a', tipo: 'SIM_NAO' }))],
    ['sem texto', [{ tipo: 'SIM_NAO' }]],
    ['texto só com espaços', [{ texto: '   ', tipo: 'SIM_NAO' }]],
    ['tipo desconhecido', [{ texto: 'a', tipo: 'NUMERO' }]],
    ['item nulo', [null]],
  ])('recusa: %s', (_, bruto) => expect(lerPerguntas(bruto)).toBeNull())

  it('apara o texto, limita a 300 e só aceita booleanos verdadeiros', () => {
    const [p] = lerPerguntas([
      { texto: `  ${'a'.repeat(400)}  `, tipo: 'SIM_NAO', obrigatoria: 'true', alerta: true },
    ])!
    expect(p.texto).toHaveLength(300)
    expect(p.obrigatoria).toBe(false)
    expect(p.alerta).toBe(true)
  })
  it('descarta campos desconhecidos e converte opções em texto', () => {
    const [p] = lerPerguntas([{ texto: 'Q', tipo: 'OPCOES', opcoes: [1, 'b'], hack: 'x' }])!
    expect(p).not.toHaveProperty('hack')
    expect(p.opcoes).toEqual(['1', 'b'])
  })
  it('resposta e descrição que não são texto viram null', () => {
    const [p] = lerPerguntas([{ texto: 'Q', tipo: 'DESCRITIVA', resposta: 5, descricao: {} }])!
    expect(p.resposta).toBeNull()
    expect(p.descricao).toBeNull()
  })
  it('o modelo da clínica passa limpo', () => {
    expect(lerPerguntas(MODELO_ANAMNESE)).toHaveLength(MODELO_ANAMNESE.length)
  })
})

describe('etapas do planejamento (blocos fixos)', () => {
  const nomes = (e: { nome: string }[]) => e.map((x) => x.nome)

  it('Endodontia nasce com os blocos fixos em volta das etapas dela', () => {
    expect(nomes(etapasDaFicha('Endodontia'))).toEqual([
      'Avaliação',
      'Planejamento',
      'Aprovação do caso',
      'Acesso e Preparo',
      'Obturação',
      'Restauração',
      'Finalização',
    ])
  })
  it('especialidade da clínica (fora da lista) usa "Tratamento" no meio', () => {
    expect(nomes(etapasDaFicha('Clínica geral'))).toEqual([
      'Avaliação',
      'Planejamento',
      'Aprovação do caso',
      'Tratamento',
      'Finalização',
    ])
  })
  it('todas nascem sem data e não executadas, com id', () => {
    for (const e of etapasDaFicha('Implantes')) {
      expect(e.data).toBeNull()
      expect(e.executado).toBe(false)
      expect(e.id).toBeTruthy()
    }
  })
  it('os 4 blocos fixos aparecem uma vez cada', () => {
    const tipos = etapasDaFicha('Ortodontia').flatMap((e) => (e.tipo ? [e.tipo] : []))
    expect(tipos.sort()).toEqual(Object.keys(ETAPAS_FIXAS).sort())
  })
  it('a ordem que veio é mantida quando todos os blocos estão lá', () => {
    const fixas = Object.keys(ETAPAS_FIXAS).map((tipo) => ({
      id: tipo,
      nome: tipo,
      tipo: tipo as keyof typeof ETAPAS_FIXAS,
    }))
    const ordem = [fixas[3], { id: 'x', nome: 'Meio' }, fixas[0], fixas[1], fixas[2]]
    expect(comEtapasFixas(ordem).map((e) => e.id)).toEqual(ordem.map((e) => e.id))
  })
  it('tipo repetido: o segundo vira etapa comum e o bloco não duplica', () => {
    const r = comEtapasFixas([
      { id: 'a', nome: 'Av 1', tipo: 'AVALIACAO' },
      { id: 'b', nome: 'Av 2', tipo: 'AVALIACAO' },
    ])
    expect(r.filter((e) => e.tipo === 'AVALIACAO').map((e) => e.id)).toEqual(['a'])
    expect(r.find((e) => e.id === 'b')?.tipo).toBeUndefined()
  })
  it('ficha antiga: etapa com o mesmo nome (maiúsculas e espaços não importam) vira o bloco', () => {
    const r = comEtapasFixas([{ id: 'v', nome: '  AVALIAÇÃO ' }])
    expect(r.find((e) => e.id === 'v')?.tipo).toBe('AVALIACAO')
    expect(r.filter((e) => e.tipo === 'AVALIACAO')).toHaveLength(1)
  })
  it('bloco que faltou volta de "antigas" com a data e o executado', () => {
    const antiga = {
      id: 'p1',
      nome: 'Plano antigo',
      data: '2026-01-01',
      executado: true,
      tipo: 'PLANEJAMENTO' as const,
    }
    const r = comEtapasFixas([{ id: 'm', nome: 'Meio' }], [antiga])
    expect(nomes(r)).toEqual([
      'Avaliação',
      'Plano antigo',
      'Aprovação do caso',
      'Meio',
      'Finalização',
    ])
    expect(r[1]).toMatchObject({ data: '2026-01-01', executado: true, tipo: 'PLANEJAMENTO' })
  })
  it('lista vazia ganha os 4 blocos na ordem padrão', () => {
    expect(nomes(comEtapasFixas([]))).toEqual(Object.values(ETAPAS_FIXAS))
  })
  it('sem id, ganha um', () => {
    expect(comEtapasFixas([{ nome: 'Sem id' }]).every((e) => e.id)).toBe(true)
  })
})

describe('preencherModelo (documentos)', () => {
  it('troca as variáveis e apara o valor', () => {
    expect(preencherModelo('Olá {paciente}!', { paciente: '  Ana  ' })).toBe('Olá Ana!')
  })
  it('variável sem valor vira linha para preencher à mão', () => {
    expect(preencherModelo('{a} e {b}', { a: '', b: null })).toBe('________ e ________')
  })
  it('texto sem variáveis fica igual', () => {
    expect(preencherModelo('Sem nada', {})).toBe('Sem nada')
  })
  it('todo modelo da clínica, preenchido, não sobra {chave}', () => {
    for (const m of Object.values(MODELOS_DOCUMENTO)) {
      const saida = preencherModelo(m.texto, {})
      expect(saida).not.toMatch(/\{\w+\}/)
    }
  })
  it('as variáveis próprias de cada modelo aparecem no texto', () => {
    for (const m of Object.values(MODELOS_DOCUMENTO))
      for (const v of m.variaveis) expect(m.texto).toContain(`{${v}}`)
  })
})
