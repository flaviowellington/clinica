// Regras da agenda usadas pelo front e pela API (rules/agenda.md).

/** Tamanho de cada intervalo da grade, em minutos (R-021). */
export const INTERVALO = 15

// ponytail: expediente fixo da clínica estudada (8:00–19:45, domingo fechado);
// virar configuração quando a clínica pedir horários diferentes por dia.
const PRIMEIRO = 8 * 60
const ULTIMO = 19 * 60 + 45

/** "08:00", "08:15", ... "19:45": os 48 horários de início (R-029). */
export const HORARIOS = Array.from({ length: (ULTIMO - PRIMEIRO) / INTERVALO + 1 }, (_, i) =>
  paraHora(PRIMEIRO + i * INTERVALO),
)

/** Domingo não tem expediente (R-083). Recebe aaaa-mm-dd. */
export const diaComExpediente = (data: string) => new Date(`${data}T12:00:00Z`).getUTCDay() !== 0

export function paraMinutos(hora: string) {
  const [h, m] = hora.split(':').map(Number)
  return h * 60 + m
}

export function paraHora(minutos: number) {
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`
}

/** Sem procedimentos, a consulta dura um intervalo (R-033). */
export const fimPadrao = (inicio: string) => paraHora(paraMinutos(inicio) + INTERVALO)

/** Os sete status do atendimento, na ordem do seletor (R-030), com cor (R-024). */
export const STATUS = {
  AGENDADO: { rotulo: 'Agendado', cor: '#64748b' },
  CONFIRMADO: { rotulo: 'Confirmado', cor: '#2563eb' },
  EM_ESPERA: { rotulo: 'Em espera', cor: '#d97706' },
  EM_ATENDIMENTO: { rotulo: 'Em atendimento', cor: '#7c3aed' },
  ATENDIDO: { rotulo: 'Atendido', cor: '#15803d' },
  ATRASADO: { rotulo: 'Atrasado', cor: '#ea580c' },
  FALTOU: { rotulo: 'Faltou', cor: '#dc2626' },
} as const
export type StatusAgenda = keyof typeof STATUS

/** Status que significam que o paciente já chegou: bloqueiam excluir (R-034). */
export const COM_CHECKIN: StatusAgenda[] = ['EM_ESPERA', 'EM_ATENDIMENTO', 'ATENDIDO']

/** Categorias da clínica estudada, com a cor do bloco na grade (E-002). */
export const CATEGORIAS = {
  Avaliação: '#0ea5e9',
  Cirurgia: '#dc2626',
  Consulta: '#0f766e',
  Ortopedia: '#a855f7',
  Periódico: '#f59e0b',
  Retorno: '#22c55e',
} as const
export type Categoria = keyof typeof CATEGORIAS

/** Canais de aviso ao paciente; tudo começa em "Não enviar" (R-027). */
export const CANAIS = {
  NAO_ENVIAR: '-- Não enviar --',
  WHATSAPP: 'WhatsApp',
  SMS: 'SMS',
  EMAIL: 'E-mail',
} as const
export type Canal = keyof typeof CANAIS

export const AVISO_MESMO_DIA =
  'Não dá para enviar alertas de consultas marcadas para hoje: o envio automático acontece às 7h da manhã.'

export interface DadosAgendamento {
  tipo?: string
  data?: string | null
  inicio?: string | null
  fim?: string | null
  profissionalId?: number | null
  pacienteId?: number | null
  titulo?: string | null
}

/** Erros por campo; objeto vazio = válido. */
export function validarAgendamento(d: DadosAgendamento): Record<string, string> {
  const erros: Record<string, string> = {}
  if (!d.data || !/^\d{4}-\d{2}-\d{2}$/.test(d.data) || isNaN(Date.parse(d.data)))
    erros.data = 'Informe a data.'
  else if (!diaComExpediente(d.data)) erros.data = 'A clínica não abre neste dia.'
  if (!d.inicio || !HORARIOS.includes(d.inicio)) erros.inicio = 'Escolha um horário.'
  if (d.fim && d.inicio && paraMinutos(d.fim) <= paraMinutos(d.inicio))
    erros.fim = 'O fim precisa ser depois do início.'
  if (!d.profissionalId) erros.profissionalId = 'Escolha o profissional.'
  if (d.tipo === 'COMPROMISSO') {
    if (!d.titulo?.trim()) erros.titulo = 'Informe o que é o compromisso.'
  } else if (!d.pacienteId) erros.pacienteId = 'Escolha o paciente.'
  return erros
}

/**
 * Grade do dia: agendamentos que se sobrepõem dividem a coluna do profissional, lado a lado.
 * Encaixe = começa enquanto outro do mesmo grupo ainda não terminou (o que entrou depois).
 */
export function ladoALado(itens: { id: number; inicio: string; fim: string }[]) {
  const res = new Map<number, { coluna: number; colunas: number; encaixe: boolean }>()
  const ordem = [...itens].sort((a, b) => a.inicio.localeCompare(b.inicio) || a.id - b.id)
  let grupo: typeof itens = []
  let faixas: string[] = [] // fim do último agendamento em cada coluna do grupo
  let fimGrupo = ''
  const fechar = () => {
    for (const x of grupo) res.get(x.id)!.colunas = faixas.length
    grupo = []
    faixas = []
  }
  for (const a of ordem) {
    if (grupo.length && a.inicio >= fimGrupo) fechar() // "hh:mm" ordena como texto
    let coluna = faixas.findIndex((f) => f <= a.inicio)
    if (coluna < 0) coluna = faixas.push(a.fim) - 1
    else faixas[coluna] = a.fim
    res.set(a.id, { coluna, colunas: 1, encaixe: grupo.some((b) => b.fim > a.inicio) })
    fimGrupo = grupo.length && fimGrupo > a.fim ? fimGrupo : a.fim
    grupo.push(a)
  }
  fechar()
  return res
}

/** Horários escolhidos no modal: do "inicio" ao "ultimo" (inclusive); "clicado" é o último ativo. */
export interface SelecaoHorario {
  inicio: string
  ultimo: string // vazio = só o início, esperando o segundo clique
  clicado: string
}

/**
 * Um clique na grade de horários:
 * - nada escolhido: começa ali e espera o segundo clique;
 * - segundo clique: faixa entre os dois, em qualquer ordem;
 * - com faixa pronta, clique fora dela aumenta até ali; dentro, recomeça ali;
 * - clicar de novo no último ativo limpa tudo;
 * - se a faixa passaria por horário ocupado, recomeça no clique.
 * "hh:mm" ordena como texto.
 */
export function clicarHorario(
  s: SelecaoHorario,
  h: string,
  ocupadoEntre: (a: string, b: string) => boolean,
): SelecaoHorario {
  const recomeca = { inicio: h, ultimo: '', clicado: h }
  if (!s.inicio) return recomeca
  if (h === s.clicado) return { inicio: '', ultimo: '', clicado: '' }
  const fim = s.ultimo || s.inicio
  let a: string, b: string
  if (!s.ultimo) [a, b] = h < s.inicio ? [h, s.inicio] : [s.inicio, h]
  else if (h < s.inicio) [a, b] = [h, fim]
  else if (h > fim) [a, b] = [s.inicio, h]
  else return recomeca // dentro da faixa
  return ocupadoEntre(a, b) ? recomeca : { inicio: a, ultimo: b, clicado: h }
}
