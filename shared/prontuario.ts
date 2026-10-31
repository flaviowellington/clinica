// Regras do prontuário usadas pelo front e pela API (rules/prontuario.md).
import { DENTES_DECIDUOS, DENTES_PERMANENTES } from './orcamentos'

export const DENTES_VALIDOS = new Set(
  [...DENTES_PERMANENTES.flat(), ...DENTES_DECIDUOS.flat()].map(String),
)

export const STATUS_CLINICO = {
  A_REALIZAR: 'A realizar',
  EXECUTADO: 'Executado',
  EXISTENTE: 'Existente',
} as const
export type StatusClinico = keyof typeof STATUS_CLINICO

/** Faces do dente na ordem de exibição (R-061, R-069). */
export const FACES = ['V', 'P', 'L', 'M', 'D', 'O', 'I', 'C'] as const

export const NOME_FACE: Record<(typeof FACES)[number], string> = {
  V: 'Vestibular',
  P: 'Palatina',
  L: 'Lingual',
  M: 'Mesial',
  D: 'Distal',
  O: 'Oclusal',
  I: 'Incisal',
  C: 'Cervical',
}

/**
 * As 6 porções clicáveis do dente no odontograma, nesta ordem de posição na tela:
 * borda esquerda, centro da oclusal, borda direita, cervical, vista de baixo, vista de cima.
 * Lado direito do paciente (quadrantes 1, 4, 5, 8) aparece à esquerda: lá a mesial fica à direita.
 */
export function facesDoDente(dente: string) {
  const q = Number(dente[0])
  const centro = Number(dente[1]) <= 3 ? 'I' : 'O'
  const [baixo, cima] = [1, 2, 5, 6].includes(q) ? ['P', 'V'] : ['V', 'L']
  const [esq, dir] = [1, 4, 5, 8].includes(q) ? ['D', 'M'] : ['M', 'D']
  return [esq, centro, dir, 'C', baixo, cima] as (typeof FACES)[number][]
}

/** Só letras de face válidas, sem repetir, na ordem de FACES: "om" → "MO". */
export const normalizarFaces = (texto: string | null | undefined) =>
  FACES.filter((f) => (texto ?? '').toUpperCase().includes(f)).join('')

/** "16" + "MO" → "16MO" (R-069). */
export const denteComFaces = (dente: string | null, faces: string | null) =>
  dente ? `${dente}${faces ?? ''}` : ''

/**
 * Junta os registros de um mesmo lançamento em vários dentes ou faces: mesmo procedimento,
 * situação, data, profissional, observações e orçamento. Mantém a ordem da lista.
 * ponytail: não há id de lote; dois lançamentos idênticos no mesmo dia viram um grupo só.
 */
export function agruparProcedimentos<
  T extends {
    origem: string
    nome: string
    status: string
    data: string
    profissional: { id: number }
    observacao: string | null
    observacaoPaciente: string | null
    orcamentoId: number | null
  },
>(itens: T[]) {
  const grupos = new Map<string, T[]>()
  for (const i of itens) {
    const k = JSON.stringify([
      i.origem,
      i.nome,
      i.status,
      i.data,
      i.profissional.id,
      i.observacao,
      i.observacaoPaciente,
      i.orcamentoId,
    ])
    grupos.set(k, [...(grupos.get(k) ?? []), i])
  }
  return [...grupos.values()]
}

export const LIMITE_OBSERVACAO = 1500

// ── Anamnese ────────────────────────────────────────────────────────────────
export const TIPOS_PERGUNTA = {
  DESCRITIVA: 'Descritiva',
  SIM_NAO: 'Sim/Não',
  OPCOES: 'Opções',
} as const
export type TipoPergunta = keyof typeof TIPOS_PERGUNTA

export interface Pergunta {
  texto: string
  tipo: TipoPergunta
  opcoes?: string[]
  obrigatoria?: boolean
  /** Resposta que vira alerta do paciente (R-059). */
  alerta?: boolean
  resposta?: string | null
  descricao?: string | null
}

/** Modelo da clínica. ponytail: fixo no código; tela de configuração quando a clínica pedir. */
export const MODELO_ANAMNESE: Pergunta[] = [
  { texto: 'Está em tratamento médico?', tipo: 'SIM_NAO', obrigatoria: true },
  { texto: 'Toma algum medicamento? Qual?', tipo: 'SIM_NAO', alerta: true },
  {
    texto: 'Tem alergia a algum medicamento ou material?',
    tipo: 'SIM_NAO',
    obrigatoria: true,
    alerta: true,
  },
  { texto: 'Tem diabetes?', tipo: 'SIM_NAO', alerta: true },
  { texto: 'Tem pressão alta?', tipo: 'SIM_NAO', alerta: true },
  { texto: 'Tem problema cardíaco?', tipo: 'SIM_NAO', alerta: true },
  { texto: 'Tem ou teve hepatite, HIV ou outra doença infecciosa?', tipo: 'SIM_NAO', alerta: true },
  { texto: 'Tem problema de coagulação ou sangramento?', tipo: 'SIM_NAO', alerta: true },
  { texto: 'Está grávida ou amamentando?', tipo: 'SIM_NAO', alerta: true },
  { texto: 'Fuma?', tipo: 'SIM_NAO' },
  { texto: 'Já teve reação à anestesia dental?', tipo: 'SIM_NAO', alerta: true },
  {
    texto: 'Com que frequência escova os dentes?',
    tipo: 'OPCOES',
    opcoes: ['1 vez ao dia', '2 vezes ao dia', '3 vezes ou mais'],
  },
  { texto: 'Qual o motivo da consulta?', tipo: 'DESCRITIVA' },
]

const vazia = (p: Pergunta) => !(p.resposta ?? '').trim()

/** Índices das perguntas obrigatórias sem resposta (R-074). */
export const faltandoObrigatorias = (perguntas: Pergunta[]) =>
  perguntas.flatMap((p, i) => (p.obrigatoria && vazia(p) ? [i] : []))

/** Resposta marcada como Alerta: "Sim" no Sim/Não, ou qualquer resposta nos outros tipos (R-059). */
export const alertasDaAnamnese = (perguntas: Pergunta[]) =>
  perguntas.filter((p) => p.alerta && !vazia(p) && (p.tipo !== 'SIM_NAO' || p.resposta === 'Sim'))

/** Limpa o que veio do navegador: só os campos conhecidos, textos com tamanho limitado. */
export function lerPerguntas(bruto: unknown): Pergunta[] | null {
  if (!Array.isArray(bruto) || !bruto.length || bruto.length > 100) return null
  const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : null)
  const lidas: Pergunta[] = []
  for (const b of bruto as Record<string, unknown>[]) {
    const texto = txt(b?.texto, 300)?.trim()
    if (!texto || !(String(b.tipo) in TIPOS_PERGUNTA)) return null
    const opcoes = Array.isArray(b.opcoes)
      ? b.opcoes.map((o) => String(o).slice(0, 100))
      : undefined
    lidas.push({
      texto,
      tipo: b.tipo as TipoPergunta,
      ...(opcoes && { opcoes }),
      obrigatoria: b.obrigatoria === true,
      alerta: b.alerta === true,
      resposta: txt(b.resposta, LIMITE_OBSERVACAO),
      descricao: txt(b.descricao, LIMITE_OBSERVACAO),
    })
  }
  return lidas
}

// ── Fichas de especialidade (R-068) ─────────────────────────────────────────
export const ESPECIALIDADES_FICHA = [
  'Alinhadores',
  'Endodontia',
  'Implantes',
  'Ortodontia',
  'Ortopédica',
  'Periodontia',
  'Toxina Botulínica Estética',
  'Toxina Botulínica Terapêutica',
] as const

export const STATUS_DENTE_FICHA = [
  'Em avaliação',
  'Em tratamento',
  'Executado',
  'Suspenso',
  'Finalizado',
] as const

// ── Documentos (R-062) ──────────────────────────────────────────────────────
export const MODELOS_DOCUMENTO = {
  atestado: {
    titulo: 'Atestado',
    variaveis: ['horario', 'dias'] as const,
    texto:
      'Atesto, para os devidos fins, que {paciente}, CPF {cpf}, esteve sob meus cuidados ' +
      'profissionais no dia {data}, às {horario}, devendo permanecer afastado(a) de suas ' +
      'atividades por {dias}.\n\n{cidade}, {data}.\n\n\n{profissional}\n{cro}',
  },
  comparecimento: {
    titulo: 'Declaração de comparecimento',
    variaveis: ['horario'] as const,
    texto:
      'Declaro, para os devidos fins, que {paciente}, CPF {cpf}, compareceu a esta clínica ' +
      'no dia {data}, às {horario}, para atendimento odontológico.\n\n{cidade}, {data}.\n\n\n' +
      '{profissional}\n{cro}',
  },
  receita: {
    titulo: 'Receita',
    variaveis: [] as const,
    texto:
      'Paciente: {paciente}\n\nUso interno:\n\n1. \n\n\n{cidade}, {data}.\n\n\n{profissional}\n{cro}',
  },
} as const
export type ModeloDocumento = keyof typeof MODELOS_DOCUMENTO

/** Troca {nome} pelo valor; variável sem valor vira uma linha para preencher à mão. */
export const preencherModelo = (
  texto: string,
  valores: Record<string, string | null | undefined>,
) => texto.replace(/\{(\w+)\}/g, (_, nome: string) => valores[nome]?.trim() || '________')
