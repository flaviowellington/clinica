// Configurações (shared/configuracoes.ts), importação (shared/importacao.ts),
// arcadas do documento (shared/arcadas.ts) e etapas do protético (shared/protetico.ts).
import { describe, expect, it } from 'vitest'
import { CHAVES, PADROES, validarConfig } from '../../../shared/configuracoes'
import {
  CAMPOS_IMPORTACAO,
  TITULOS_IMPORTACAO,
  sugerirColunas,
  type TipoImportacao,
} from '../../../shared/importacao'
import { normalizar } from '../../../shared/regras'
import { ARCADAS, dentesDoPlano, marcadosNa } from '../../../shared/arcadas'
import { DENTES_VALIDOS } from '../../../shared/prontuario'
import { ETAPAS, ORDEM_ETAPAS } from '../../../shared/protetico'

const erro = (r: ReturnType<typeof validarConfig>) => r.erro
const valor = <T>(r: ReturnType<typeof validarConfig>) => r.valor as T

describe('validarConfig: os padrões da clínica são válidos', () => {
  it.each(CHAVES)('%s', (chave) => {
    expect(erro(validarConfig(chave, PADROES[chave]))).toBeUndefined()
  })
})

describe('validarConfig: dados da clínica', () => {
  it('nome obrigatório', () => {
    expect(erro(validarConfig('clinica', { nome: '   ' }))).toBe('Informe o nome da clínica.')
    expect(erro(validarConfig('clinica', null))).toBe('Informe o nome da clínica.')
  })
  it('apara, corta e descarta campos desconhecidos', () => {
    const v = valor<Record<string, string>>(
      validarConfig('clinica', { nome: `  ${'x'.repeat(200)}`, cidade: ' SP ', hack: 1 }),
    )
    expect(v.nome).toHaveLength(120)
    expect(v.cidade).toBe('SP')
    expect(v).not.toHaveProperty('hack')
  })
})

describe('validarConfig: emitentes da nota fiscal', () => {
  const pj = { perfil: 'Clínica', tipo: 'PJ', razaoSocial: 'Clínica Ltda' }
  it.each([
    ['não é lista', { perfis: 'x' }, 'Lista de perfis inválida.'],
    ['perfil sem nome', { perfis: [{ ...pj, perfil: ' ' }] }, 'Dê um nome ao perfil.'],
    [
      'perfil repetido',
      { perfis: [pj, { ...pj, perfil: 'CLÍNICA' }] },
      'Já existe o perfil "CLÍNICA".',
    ],
    [
      'PJ sem razão social',
      { perfis: [{ ...pj, razaoSocial: '' }] },
      'Clínica: informe a razão social.',
    ],
    [
      'PF sem nome',
      { perfis: [{ ...pj, tipo: 'PF', razaoSocial: '' }] },
      'Clínica: informe o nome.',
    ],
    [
      'CNPJ inválido',
      { perfis: [{ ...pj, documento: '11.222.333/0001-82' }] },
      'Clínica: CNPJ inválido.',
    ],
    [
      'CPF inválido no PF',
      { perfis: [{ ...pj, tipo: 'PF', documento: '111.111.111-11' }] },
      'Clínica: CPF inválido.',
    ],
    ['CEP curto', { perfis: [{ ...pj, cep: '1234' }] }, 'Clínica: CEP inválido.'],
  ])('%s', (_, bruto, msg) => expect(erro(validarConfig('emitentes', bruto))).toBe(msg))

  it('limpa documento, CEP e UF; PF não guarda inscrição estadual', () => {
    const v = valor<{ ativo: number; perfis: Record<string, string>[] }>(
      validarConfig('emitentes', {
        ativo: 1,
        perfis: [
          { ...pj, documento: '11.222.333/0001-81', cep: '01310-100', uf: 'sp', regime: 'SIMPLES' },
          {
            perfil: 'Dentista',
            tipo: 'PF',
            razaoSocial: 'Fulano',
            documento: '529.982.247-25',
            inscricaoEstadual: '123',
            regime: 'INVENTADO',
          },
        ],
      }),
    )
    expect(v.ativo).toBe(1)
    expect(v.perfis[0]).toMatchObject({
      documento: '11222333000181',
      cep: '01310100',
      uf: 'SP',
      regime: 'SIMPLES',
    })
    expect(v.perfis[1]).toMatchObject({
      documento: '52998224725',
      inscricaoEstadual: '',
      regime: '',
    })
  })
  it('tipo desconhecido vira PJ; ativo fora da lista vira 0', () => {
    const v = valor<{ ativo: number; perfis: { tipo: string }[] }>(
      validarConfig('emitentes', { ativo: 9, perfis: [{ ...pj, tipo: 'XX' }] }),
    )
    expect(v.ativo).toBe(0)
    expect(v.perfis[0].tipo).toBe('PJ')
  })
})

describe('validarConfig: anamnese e modelos', () => {
  it('pergunta de opções sem opção', () => {
    expect(erro(validarConfig('anamnese', [{ texto: 'Q', tipo: 'OPCOES', opcoes: [''] }]))).toBe(
      'Pergunta do tipo Opções precisa de pelo menos uma opção.',
    )
  })
  it('guarda só as perguntas, sem as respostas', () => {
    const [p] = valor<Record<string, unknown>[]>(
      validarConfig('anamnese', [{ texto: 'Q', tipo: 'SIM_NAO', resposta: 'Sim', descricao: 'x' }]),
    )
    expect(p).not.toHaveProperty('resposta')
    expect(p).not.toHaveProperty('descricao')
  })
  it('opções são aparadas e as vazias saem', () => {
    const [p] = valor<{ opcoes: string[] }[]>(
      validarConfig('anamnese', [{ texto: 'Q', tipo: 'OPCOES', opcoes: [' a ', '', 'b'] }]),
    )
    expect(p.opcoes).toEqual(['a', 'b'])
  })
  it('modelos: nome obrigatório, sem repetir, e o erro diz qual modelo', () => {
    const perguntas = [{ texto: 'Q', tipo: 'SIM_NAO' }]
    expect(erro(validarConfig('modelosAnamnese', [{ nome: '', perguntas }]))).toBe(
      'Informe o nome do modelo.',
    )
    expect(
      erro(
        validarConfig('modelosAnamnese', [
          { nome: 'Orto', perguntas },
          { nome: 'orto', perguntas },
        ]),
      ),
    ).toBe('Já existe o modelo "orto".')
    expect(erro(validarConfig('modelosAnamnese', [{ nome: 'Orto', perguntas: [] }]))).toMatch(
      /^Orto: /,
    )
  })
})

describe('validarConfig: documentos, laboratórios e listas', () => {
  it('modelo de documento vazio', () => {
    expect(erro(validarConfig('documentos', { ...PADROES.documentos, atestado: ' ' }))).toBe(
      'O modelo "Atestado" está vazio.',
    )
  })
  it('documentos padrão: nome, texto e sem repetir', () => {
    expect(erro(validarConfig('documentosPadrao', [{ nome: '', texto: 't' }]))).toBe(
      'Informe o nome do documento.',
    )
    expect(erro(validarConfig('documentosPadrao', [{ nome: 'A', texto: '' }]))).toBe(
      'O documento "A" está vazio.',
    )
    expect(
      erro(
        validarConfig('documentosPadrao', [
          { nome: 'A', texto: 't' },
          { nome: 'á', texto: 't' },
        ]),
      ),
    ).toBe('Já existe o documento "á".')
  })
  it('laboratório: trabalho repetido e valor inválido', () => {
    const lab = (trabalhos: unknown) => [{ nome: 'Lab', trabalhos }]
    expect(erro(validarConfig('laboratorios', lab('x')))).toBe('Lab: lista de trabalhos inválida.')
    expect(
      erro(
        validarConfig(
          'laboratorios',
          lab([
            { nome: 'Coroa', valorCentavos: 1 },
            { nome: 'coroa', valorCentavos: 2 },
          ]),
        ),
      ),
    ).toBe('Lab: "coroa" aparece duas vezes.')
    for (const v of [-1, 1.5, '100', 100_000_001])
      expect(erro(validarConfig('laboratorios', lab([{ nome: 'Coroa', valorCentavos: v }])))).toBe(
        'Lab: valor inválido em "Coroa".',
      )
  })
  it('especialidades: tira vazias e repetidas (sem diferenciar acento e maiúscula)', () => {
    expect(valor(validarConfig('especialidades', ['Orto', 'orto', ' Endo ', '', 'ÓRTO']))).toEqual([
      'Orto',
      'Endo',
    ])
  })
  it('categorias da agenda: cor #rrggbb em minúsculas', () => {
    expect(valor(validarConfig('categorias', { Consulta: '#ABCDEF' }))).toEqual({
      Consulta: '#abcdef',
    })
    expect(erro(validarConfig('categorias', { Consulta: 'azul' }))).toBe(
      'Cor inválida em "Consulta".',
    )
    expect(erro(validarConfig('categorias', {}))).toBe('Lista de categorias inválida.')
  })
  it('desconto: só ids positivos, sem repetir', () => {
    expect(valor(validarConfig('desconto', [3, 3, -1, 0, 2.5, 'x', 7]))).toEqual([3, 7])
    expect(erro(validarConfig('desconto', 'x'))).toBe('Lista de usuários inválida.')
  })
  it('mensagem de confirmação precisa do {link}', () => {
    expect(erro(validarConfig('mensagens', { confirmacao: 'Olá' }))).toMatch(/\{link\}/)
    expect(erro(validarConfig('mensagens', { confirmacao: '' }))).toBe(
      'Escreva o texto da confirmação.',
    )
  })
  it('horários fechados fora da grade', () => {
    expect(erro(validarConfig('horariosFechados', ['1-07:00']))).toBe(
      'Horário fora da grade da agenda.',
    )
  })
  it('permissões inválidas', () => {
    expect(erro(validarConfig('permissoes', 'x'))).toBe('Permissões inválidas.')
  })
})

describe('importação: sugestão de colunas', () => {
  it('acha as colunas pelo cabeçalho, sem acento nem maiúscula', () => {
    const m = sugerirColunas('pacientes', [
      'Nome do paciente',
      'Data de Nascimento',
      'CPF',
      'Celular',
      'E-mail',
    ])
    expect(m).toMatchObject({ nome: 0, nascimento: 1, cpf: 2, celular: 3, email: 4, rg: null })
  })
  it('cada coluna serve a um campo só', () => {
    const m = sugerirColunas('profissionais', ['telefone', 'celular'])
    expect(m.celular).toBe(0)
    const usadas = Object.values(m).filter((v) => v !== null)
    expect(new Set(usadas).size).toBe(usadas.length)
  })
  it('planilha sem cabeçalho conhecido → tudo null', () => {
    const m = sugerirColunas('agendamentos', ['coluna a', 'coluna b'])
    expect(Object.values(m).every((v) => v === null)).toBe(true)
  })
  it.each(Object.keys(CAMPOS_IMPORTACAO) as TipoImportacao[])(
    '%s: sinônimos já normalizados, campo obrigatório existe e tem título',
    (tipo) => {
      const campos = Object.values(CAMPOS_IMPORTACAO[tipo]) as {
        sinonimos: string[]
        obrigatorio?: boolean
      }[]
      for (const c of campos) for (const s of c.sinonimos) expect(normalizar(s)).toBe(s)
      expect(campos.some((c) => c.obrigatorio)).toBe(true)
      expect(TITULOS_IMPORTACAO[tipo]).toBeTruthy()
    },
  )
})

describe('arcadas do documento de assinatura', () => {
  it('todo dente do desenho é FDI válido e a caixa cabe na imagem', () => {
    for (const a of Object.values(ARCADAS))
      for (const [n, [x, y, l, h]] of Object.entries(a.dentes)) {
        expect(DENTES_VALIDOS.has(n)).toBe(true)
        expect(x >= 0 && y >= 0 && x + l <= a.largura && y + h <= a.altura, n).toBe(true)
      }
  })
  it('permanente sem os sisos (28 dentes); decídua completa (20)', () => {
    expect(Object.keys(ARCADAS.permanente.dentes)).toHaveLength(28)
    for (const s of ['18', '28', '38', '48'])
      expect(ARCADAS.permanente.dentes).not.toHaveProperty(s)
    expect(Object.keys(ARCADAS.decidua.dentes)).toHaveLength(20)
  })
  it('dentesDoPlano: tira as faces e não repete', () => {
    expect([...dentesDoPlano([{ dentes: ['16MO', '16', '21V'] }, { dentes: [] }])]).toEqual([
      '16',
      '21',
    ])
  })
  it('siso do plano não aparece no desenho', () => {
    expect(marcadosNa('permanente', new Set(['18', '11']))).toHaveLength(1)
  })
  it('plano vazio → nada marcado', () => {
    expect(marcadosNa('decidua', new Set())).toEqual([])
  })
})

describe('Controle Protético: as quatro colunas na ordem', () => {
  it('ordem do quadro', () => {
    expect(ORDEM_ETAPAS).toEqual(['PRE_ENVIO', 'EM_LABORATORIO', 'AGENDAMENTO', 'INSTALADO'])
    expect(Object.values(ETAPAS)).toEqual([
      'Pré-envio',
      'Em laboratório',
      'Agendar instalação',
      'Instalado',
    ])
  })
})
