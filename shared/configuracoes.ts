// Configurações da clínica: valores padrão e validação de cada assunto.
// O servidor guarda só o que a clínica mudou; o resto vem daqui.
import { MODELOS_DOCUMENTO, MODELO_ANAMNESE, lerPerguntas, type Pergunta } from './prontuario'
import { normalizar } from './regras'
import { CATEGORIAS } from './agenda'

export interface DadosClinica {
  nome: string
  cnpj: string
  endereco: string
  cidade: string
  telefone: string
  email: string
}
export interface Medicamento {
  nome: string
  posologia: string
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
  documentos: Object.fromEntries(
    Object.entries(MODELOS_DOCUMENTO).map(([id, m]) => [id, m.texto]),
  ) as Record<keyof typeof MODELOS_DOCUMENTO, string>,
  medicamentos: [] as Medicamento[],
  /** Categorias da agenda (nome → cor); a clínica pode criar outras. */
  categorias: { ...CATEGORIAS } as Record<string, string>,
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
  mensagens: {
    confirmacao:
      'Olá, {paciente}! Sua consulta na {clinica} está marcada para {data} às {horario}, com ' +
      '{profissional}. Para confirmar sua presença, acesse: {link}',
  } as Mensagens,
}
export type ChaveConfig = keyof typeof PADROES
export const CHAVES = Object.keys(PADROES) as ChaveConfig[]

const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

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
    case 'anamnese': {
      // O modelo guarda só as perguntas: as respostas são de cada paciente.
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
    case 'documentos': {
      const valor = { ...PADROES.documentos }
      for (const id of Object.keys(valor) as (keyof typeof valor)[]) {
        const t = txt(b?.[id], 20_000)
        if (!t) return { erro: `O modelo "${MODELOS_DOCUMENTO[id].titulo}" está vazio.` }
        valor[id] = t
      }
      return { valor }
    }
    case 'medicamentos': {
      if (!Array.isArray(bruto) || bruto.length > 500) return { erro: 'Lista inválida.' }
      const valor = (bruto as Record<string, unknown>[])
        .map((m) => ({ nome: txt(m?.nome, 120), posologia: txt(m?.posologia, 300) }))
        .filter((m) => m.nome)
      return { valor }
    }
    case 'especialidades': {
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
