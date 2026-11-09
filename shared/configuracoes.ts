// Configurações da clínica: valores padrão e validação de cada assunto.
// O servidor guarda só o que a clínica mudou; o resto vem daqui.
import {
  ESPECIALIDADES_FICHA,
  MODELOS_DOCUMENTO,
  MODELO_ANAMNESE,
  lerPerguntas,
  type Pergunta,
} from './prontuario'
import { normalizar } from './regras'
import { CATEGORIAS, lerHorariosSemana } from './agenda'

export interface DadosClinica {
  nome: string
  cnpj: string
  endereco: string
  cidade: string
  telefone: string
  email: string
}
/** Modelo extra de anamnese, além do padrão da clínica. */
export interface ModeloAnamnese {
  nome: string
  perguntas: Pergunta[]
}
/** Documento de texto fixo da clínica (orientações, termos): vai pronto para o prontuário. */
export interface DocumentoPadrao {
  nome: string
  texto: string
}
/** Laboratório de prótese e a tabela de trabalhos que ele faz, com o valor cobrado. */
export interface Laboratorio {
  nome: string
  contato: string
  trabalhos: { nome: string; valorCentavos: number }[]
}
export interface Mensagens {
  confirmacao: string
}

export const VARIAVEIS_MENSAGEM = ['paciente', 'clinica', 'data', 'horario', 'profissional', 'link']

export const PADROES = {
  clinica: {
    nome: 'Clínica',
    cnpj: '',
    endereco: '',
    cidade: '',
    telefone: '',
    email: '',
  } as DadosClinica,
  anamnese: MODELO_ANAMNESE as Pergunta[],
  modelosAnamnese: [] as ModeloAnamnese[],
  documentos: Object.fromEntries(
    Object.entries(MODELOS_DOCUMENTO).map(([id, m]) => [id, m.texto]),
  ) as Record<keyof typeof MODELOS_DOCUMENTO, string>,
  documentosPadrao: [] as DocumentoPadrao[],
  laboratorios: [] as Laboratorio[],
  /** Categorias da agenda (nome → cor); a clínica pode criar outras. */
  categorias: { ...CATEGORIAS } as Record<string, string>,
  /** Horários da semana em que a clínica não atende ninguém ("d-hh:mm"). */
  horariosFechados: [] as string[],
  especialidades: [
    'Clínica geral',
    'Cirurgia',
    'Dentística',
    'Endodontia',
    'Implantodontia',
    'Odontopediatria',
    'Ortodontia',
    'Periodontia',
    'Prótese',
  ],
  /** Tipos de ficha de especialidade (R-068); a clínica pode criar outros. */
  especialidadesFicha: [...ESPECIALIDADES_FICHA] as string[],
  mensagens: {
    confirmacao:
      'Olá, {paciente}! Sua consulta na {clinica} está marcada para {data} às {horario}, com ' +
      '{profissional}. Para confirmar sua presença, acesse: {link}',
  } as Mensagens,
}
export type ChaveConfig = keyof typeof PADROES
export const CHAVES = Object.keys(PADROES) as ChaveConfig[]

const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** Perguntas de um modelo de anamnese: guarda só as perguntas, as respostas são de cada paciente. */
function validarPerguntasModelo(
  bruto: unknown,
): { valor: Pergunta[]; erro?: undefined } | { erro: string; valor?: undefined } {
  const perguntas = lerPerguntas(bruto)
  if (!perguntas) return { erro: 'Confira as perguntas: cada uma precisa de texto e tipo.' }
  if (perguntas.some((p) => p.tipo === 'OPCOES' && !(p.opcoes ?? []).filter(Boolean).length))
    return { erro: 'Pergunta do tipo Opções precisa de pelo menos uma opção.' }
  return {
    valor: perguntas.map(({ resposta: _r, descricao: _d, ...p }) => ({
      ...p,
      ...(p.opcoes && { opcoes: p.opcoes.map((o) => o.trim()).filter(Boolean) }),
    })),
  }
}

/** Confere o valor enviado; devolve o valor limpo ou a mensagem de erro. */
export function validarConfig(
  chave: ChaveConfig,
  bruto: unknown,
): { valor: unknown; erro?: undefined } | { erro: string; valor?: undefined } {
  const b = bruto as Record<string, unknown>
  switch (chave) {
    case 'clinica': {
      const nome = txt(b?.nome, 120)
      if (!nome) return { erro: 'Informe o nome da clínica.' }
      return {
        valor: {
          nome,
          cnpj: txt(b.cnpj, 20),
          endereco: txt(b.endereco, 200),
          cidade: txt(b.cidade, 80),
          telefone: txt(b.telefone, 30),
          email: txt(b.email, 120),
        },
      }
    }
    case 'anamnese':
      return validarPerguntasModelo(bruto)
    case 'modelosAnamnese': {
      if (!Array.isArray(bruto) || bruto.length > 50) return { erro: 'Lista de modelos inválida.' }
      const vistos = new Set<string>()
      const valor: ModeloAnamnese[] = []
      for (const m of bruto as Record<string, unknown>[]) {
        const nome = txt(m?.nome, 80)
        if (!nome) return { erro: 'Informe o nome do modelo.' }
        if (vistos.has(normalizar(nome))) return { erro: `Já existe o modelo "${nome}".` }
        vistos.add(normalizar(nome))
        const v = validarPerguntasModelo(m.perguntas)
        if (v.erro !== undefined) return { erro: `${nome}: ${v.erro}` }
        valor.push({ nome, perguntas: v.valor })
      }
      return { valor }
    }
    case 'documentos': {
      const valor = { ...PADROES.documentos }
      for (const id of Object.keys(valor) as (keyof typeof valor)[]) {
        const t = txt(b?.[id], 20_000)
        if (!t) return { erro: `O modelo "${MODELOS_DOCUMENTO[id].titulo}" está vazio.` }
        valor[id] = t
      }
      return { valor }
    }
    case 'documentosPadrao': {
      if (!Array.isArray(bruto) || bruto.length > 100)
        return { erro: 'Lista de documentos inválida.' }
      const vistos = new Set<string>()
      const valor: DocumentoPadrao[] = []
      for (const d of bruto as Record<string, unknown>[]) {
        const nome = txt(d?.nome, 120)
        const texto = txt(d?.texto, 20_000)
        if (!nome) return { erro: 'Informe o nome do documento.' }
        if (!texto) return { erro: `O documento "${nome}" está vazio.` }
        if (vistos.has(normalizar(nome))) return { erro: `Já existe o documento "${nome}".` }
        vistos.add(normalizar(nome))
        valor.push({ nome, texto })
      }
      return { valor }
    }
    case 'laboratorios': {
      if (!Array.isArray(bruto) || bruto.length > 100)
        return { erro: 'Lista de laboratórios inválida.' }
      const vistos = new Set<string>()
      const valor: Laboratorio[] = []
      for (const l of bruto as Record<string, unknown>[]) {
        const nome = txt(l?.nome, 120)
        if (!nome) return { erro: 'Informe o nome do laboratório.' }
        if (vistos.has(normalizar(nome))) return { erro: `Já existe o laboratório "${nome}".` }
        vistos.add(normalizar(nome))
        if (!Array.isArray(l.trabalhos) || l.trabalhos.length > 200)
          return { erro: `${nome}: lista de trabalhos inválida.` }
        const feitos = new Set<string>()
        const trabalhos: Laboratorio['trabalhos'] = []
        for (const t of l.trabalhos as Record<string, unknown>[]) {
          const n = txt(t?.nome, 200)
          const v = t?.valorCentavos
          if (!n) return { erro: `${nome}: informe o nome do trabalho.` }
          if (feitos.has(normalizar(n))) return { erro: `${nome}: "${n}" aparece duas vezes.` }
          if (!Number.isInteger(v) || (v as number) < 0 || (v as number) > 100_000_000)
            return { erro: `${nome}: valor inválido em "${n}".` }
          feitos.add(normalizar(n))
          trabalhos.push({ nome: n, valorCentavos: v as number })
        }
        valor.push({ nome, contato: txt(l.contato, 120), trabalhos })
      }
      return { valor }
    }
    case 'horariosFechados': {
      const valor = lerHorariosSemana(bruto)
      return valor ? { valor } : { erro: 'Horário fora da grade da agenda.' }
    }
    case 'especialidades':
    case 'especialidadesFicha': {
      if (!Array.isArray(bruto) || bruto.length > 100) return { erro: 'Lista inválida.' }
      const vistos = new Set<string>()
      const valor = bruto
        .map((e) => txt(e, 80))
        .filter((e) => e && !vistos.has(normalizar(e)) && vistos.add(normalizar(e)))
      return { valor }
    }
    case 'categorias': {
      const pares = Object.entries(b ?? {})
      if (!pares.length || pares.length > 60) return { erro: 'Lista de categorias inválida.' }
      const vistos = new Set<string>()
      const valor: Record<string, string> = {}
      for (const [n, c] of pares) {
        const nome = txt(n, 40)
        const cor = typeof c === 'string' ? c.trim().toLowerCase() : ''
        if (!nome) return { erro: 'Informe o nome da categoria.' }
        if (!/^#[0-9a-f]{6}$/.test(cor)) return { erro: `Cor inválida em "${nome}".` }
        if (vistos.has(normalizar(nome))) return { erro: `Já existe a categoria "${nome}".` }
        vistos.add(normalizar(nome))
        valor[nome] = cor
      }
      return { valor }
    }
    case 'mensagens': {
      const confirmacao = txt(b?.confirmacao, 1000)
      if (!confirmacao) return { erro: 'Escreva o texto da confirmação.' }
      if (!confirmacao.includes('{link}'))
        return { erro: 'A mensagem precisa ter {link}, para o paciente confirmar.' }
      return { valor: { confirmacao } }
    }
  }
}
