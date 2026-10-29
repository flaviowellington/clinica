// DTOs: o formato de cada corpo que a API recebe, validado com zod.
// O servidor lê todo corpo por aqui (server/src/dto.ts); a tela usa os mesmos campos
// (e-mail, celular) para mostrar o erro enquanto a pessoa digita.
// Regra que depende do banco (paciente existe, login em uso) continua na rota.
import { z } from 'zod'
import { MOTIVOS_INATIVACAO, cpfValido, dataValida } from './regras'
import { celularVazio } from './mascaras'
import { CANAIS, STATUS } from './agenda'
import { FORMAS, TIPOS_LANCAMENTO } from './financeiro'
import {
  DENTES_VALIDOS,
  ESPECIALIDADES_FICHA,
  LIMITE_OBSERVACAO,
  MODELOS_DOCUMENTO,
  STATUS_CLINICO,
  STATUS_DENTE_FICHA,
} from './prontuario'
import { ETAPAS } from './protetico'
import { PERFIS } from './permissoes'

// ── Campos base ─────────────────────────────────────────────────────────────

/** Chaves de um objeto de rótulos ({ AGENDADO: ..., ... }) como enum do zod. */
const chaves = <T extends object>(o: T) =>
  Object.keys(o) as [keyof T & string, ...(keyof T & string)[]]

/** Texto aparado (e cortado no limite); vazio ou que não é texto vira null. */
const limpo =
  (max = Infinity) =>
  (v: unknown) =>
    typeof v === 'string' ? v.trim().slice(0, max) || null : null

/** Texto livre opcional. */
export const texto = (max = 2000) => z.preprocess(limpo(max), z.string().nullable())

/** Texto obrigatório: sem ele, "mensagem" vai para o campo. */
export const textoObrigatorio = (mensagem: string, max = 2000) =>
  z.preprocess(limpo(max), z.string({ error: mensagem }))

const numeroPositivo = (v: unknown) => (Number(v) > 0 ? Math.trunc(Number(v)) : null)

/** Id opcional: o que não for número positivo vira null. */
export const idOpcional = z.preprocess(numeroPositivo, z.number().nullable())

export const idObrigatorio = (mensagem: string) =>
  z.preprocess((v) => numeroPositivo(v) ?? undefined, z.number({ error: mensagem }))

const ehDataIso = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v))

/** Data aaaa-mm-dd obrigatória. */
export const data = (mensagem = 'Data inválida.') =>
  z.preprocess(limpo(10), z.string({ error: mensagem }).refine(ehDataIso, mensagem))

/** Data aaaa-mm-dd opcional; vazio vira null, texto que não é data dá erro. */
export const dataOpcional = z.preprocess(
  (v) => (v === '' || v == null ? null : v),
  z.string({ error: 'Data inválida.' }).refine(ehDataIso, 'Data inválida.').nullable(),
)

/** Valor em centavos, inteiro e não negativo. */
export const centavos = (mensagem = 'Valor inválido.') =>
  z.number({ error: mensagem }).int(mensagem).min(0, mensagem)

/** Opção de uma lista; vazio vira null. */
const opcaoOpcional = <T extends readonly [string, ...string[]]>(lista: T, mensagem: string) =>
  z.preprocess(limpo(), z.enum(lista, { error: mensagem }).nullable())

const PARCELAS = z.preprocess((v) => Math.min(24, Math.max(1, Number(v) || 1)), z.number())

// ── E-mail, celular e CPF: o padrão do projeto ─────────────────────────────

export const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EMAIL_INVALIDO = 'E-mail inválido.'

/** E-mail opcional; preenchido, precisa ter usuario@dominio.algo. */
export const email = z.preprocess(
  limpo(254),
  z.string().regex(REGEX_EMAIL, EMAIL_INVALIDO).nullable(),
)

export const emailObrigatorio = (mensagem = EMAIL_INVALIDO) =>
  z.preprocess(limpo(254), z.string({ error: mensagem }).regex(REGEX_EMAIL, mensagem))

/** +55 com DDD e 8 ou 9 dígitos; outro DDI, até 15 dígitos no total; sem DDI, DDD e número. */
export const REGEX_CELULAR = /^(?:\+55\d{10,11}|\+(?!55)\d{8,15}|\d{10,11})$/

/** Tira máscara (espaços, parênteses, traço) e confere o número com REGEX_CELULAR. */
export const celularValido = (v: string) =>
  REGEX_CELULAR.test((v.trim().startsWith('+') ? '+' : '') + v.replace(/\D/g, ''))

const CELULAR_INVALIDO = 'Celular inválido.'
/** Só o "+55 " da máscara conta como vazio. */
const limpoCelular = (v: unknown) =>
  typeof v === 'string' && !celularVazio(v) ? v.trim().slice(0, 30) : null

/** Celular opcional, com a máscara do sistema (+55 (00) 00000-0000) ou sem ela. */
export const celular = z.preprocess(
  limpoCelular,
  z.string().refine(celularValido, CELULAR_INVALIDO).nullable(),
)

export const celularObrigatorio = (mensagem = CELULAR_INVALIDO) =>
  z.preprocess(limpoCelular, z.string({ error: mensagem }).refine(celularValido, mensagem))

/** CPF opcional; grava só os dígitos. */
export const cpf = z.preprocess(
  (v) => (typeof v === 'string' ? v.replace(/\D/g, '') || null : null),
  z.string().refine(cpfValido, 'CPF inválido.').nullable(),
)

// ── Erros ───────────────────────────────────────────────────────────────────

/** Erros no formato da API: { campo: mensagem }, a primeira de cada campo. */
export function errosPorCampo(e: z.ZodError) {
  const erros: Record<string, string> = {}
  for (const i of e.issues) erros[String(i.path[0] ?? '')] ??= i.message
  return erros
}

/** Mensagem de erro do valor, ou '' quando está certo (para os campos da tela). */
export const erroDe = (schema: z.ZodType, valor: unknown) =>
  schema.safeParse(valor).error?.issues[0]?.message ?? ''

// ── Login e usuários ────────────────────────────────────────────────────────

const qualquerTexto = z.preprocess((v) => (typeof v === 'string' ? v : ''), z.string())

export const EntrarDto = z.object({
  login: qualquerTexto.transform((v) => v.trim()),
  senha: qualquerTexto,
})

export const SENHA_MINIMA = 8
const senha = (mensagem = `A senha precisa de ${SENHA_MINIMA} caracteres ou mais.`) =>
  qualquerTexto.pipe(z.string().min(SENHA_MINIMA, mensagem))

/** Perfis conhecidos, sem repetir; o que não existe é ignorado. */
const perfis = z.preprocess(
  (v) =>
    Array.isArray(v) ? [...new Set(v.filter((p) => typeof p === 'string' && p in PERFIS))] : [],
  z.array(z.enum(chaves(PERFIS))).min(1, 'Escolha pelo menos um perfil.'),
)

const LOGIN_INVALIDO = 'Use de 3 a 40 letras, números, ponto, hífen ou sublinhado.'
export const UsuarioNovoDto = z.object({
  nome: textoObrigatorio('Informe o nome.', 150),
  login: z.preprocess(
    (v) => limpo()(v)?.toLowerCase(),
    z.string({ error: LOGIN_INVALIDO }).regex(/^[a-z0-9._-]{3,40}$/, LOGIN_INVALIDO),
  ),
  senha: senha(),
  perfis,
  pessoaId: idOpcional,
})

/** Na edição o profissional pode vir como "pessoa: { id }" (o que a lista devolve) ou "pessoaId". */
export const UsuarioEdicaoDto = z.preprocess(
  (b) => {
    const o = (b ?? {}) as { pessoa?: { id?: unknown }; pessoaId?: unknown }
    return { ...o, pessoaId: o.pessoa?.id ?? o.pessoaId }
  },
  z.object({
    nome: textoObrigatorio('Informe o nome.', 150),
    perfis,
    ativo: z.boolean().catch(true),
    pessoaId: idOpcional,
  }),
)

export const SenhaDto = z.object({ senha: senha() })

export const MinhaSenhaDto = z.object({
  atual: qualquerTexto,
  nova: senha(`A nova senha precisa de ${SENHA_MINIMA} caracteres ou mais.`),
})

// ── Pacientes ───────────────────────────────────────────────────────────────

export const PacienteDto = z.object({
  nome: z.preprocess(
    limpo(),
    z.string({ error: 'Informe o nome.' }).max(150, 'O nome pode ter até 150 caracteres.'),
  ),
  nascimento: z.preprocess(
    limpo(10),
    z
      .string({ error: 'Informe uma data de nascimento válida.' })
      .refine((v) => dataValida(v), 'Informe uma data de nascimento válida.'),
  ),
  apelido: texto(100),
  cpf,
  rg: texto(20),
  sexo: texto(30),
  estadoCivil: texto(30),
  observacoes: texto(5000),
  email,
  celular,
  telefone: texto(30),
  comoConheceu: texto(60),
  indicadoPor: texto(150),
  comoConheceuOutro: texto(150),
  nomeMae: texto(150),
  nomePai: texto(150),
  responsavelNome: texto(150),
  responsavelCpf: cpf,
  responsavelParentesco: texto(60),
})
export type PacienteEntrada = z.input<typeof PacienteDto>

export const InativarPacienteDto = z
  .object({
    motivo: z.enum(chaves(MOTIVOS_INATIVACAO), { error: 'Escolha o motivo.' }),
    descricao: texto(500),
  })
  .refine((d) => d.motivo !== 'OUTROS' || d.descricao, {
    message: 'Descreva o motivo.',
    path: ['descricao'],
  })

// ── Agenda e confirmação ────────────────────────────────────────────────────

const canal = z.enum(chaves(CANAIS)).catch('NAO_ENVIAR')

/** Formato do agendamento; data, horário e expediente são conferidos em validarAgendamento. */
export const AgendamentoDto = z.object({
  tipo: z.enum(['CONSULTA', 'COMPROMISSO']).catch('CONSULTA'),
  data: texto(10),
  inicio: texto(5),
  fim: texto(5),
  profissionalId: idOpcional,
  pacienteId: idOpcional,
  titulo: texto(200),
  categoria: texto(60),
  observacoes: texto(LIMITE_OBSERVACAO),
  primeiraConsulta: z.boolean().catch(false),
  confirmacao: canal,
  alerta: canal,
})

export const CategoriaAgendaDto = z.object({ nome: texto(60), cor: texto(20) })

export const StatusAgendaDto = z.object({
  status: z.enum(chaves(STATUS), { error: 'Status inválido.' }),
})

export const HorarioAgendaDto = z.object({
  data: texto(10),
  inicio: texto(5),
  profissionalId: idOpcional,
})

export const DesmarcarDto = z.object({ motivo: texto(500) })

export const EnviarConfirmacaoDto = z.object({
  canal: z.enum(['EMAIL', 'WHATSAPP', 'SMS']).catch('EMAIL'),
})

// ── Configurações ───────────────────────────────────────────────────────────

export const EmailTesteDto = z.object({ para: emailObrigatorio('Informe um e-mail válido.') })

export const ProcedimentoTabelaDto = z.object({
  nome: textoObrigatorio('Informe o nome do procedimento.', 200),
  valorCentavos: centavos('Informe o valor.'),
  especialidade: texto(80),
  ativo: z.boolean().catch(true),
})

// ── Profissionais e conta corrente ───────────────────────────

export const ProfissionalDto = z.object({
  nome: textoObrigatorio('Informe o nome.', 150),
  cro: texto(40),
  especialidade: texto(80),
  email,
  celular,
  corAgenda: z.preprocess(
    limpo(),
    z
      .string()
      .regex(/^#[0-9a-f]{6}$/i, 'Cor inválida.')
      .nullable(),
  ),
})

export const AtivoDto = z.object({ ativo: z.boolean().catch(false) })

const VALOR_POSITIVO = 'Informe um valor maior que zero.'
const valorPositivo = z
  .number({ error: VALOR_POSITIVO })
  .int(VALOR_POSITIVO)
  .positive(VALOR_POSITIVO)

export const LancamentoDto = z.object({
  data: data('Informe a data.'),
  tipo: z.enum(chaves(TIPOS_LANCAMENTO), { error: 'Escolha o tipo.' }),
  valorCentavos: valorPositivo,
  descricao: textoObrigatorio('Informe a descrição.', 300),
  categoria: texto(100),
  forma: texto(40),
  pacienteId: idOpcional,
})

// ── Contas a pagar e receber, bancos ────────────────────────────────────────

export const ContaFinanceiraDto = z.object({
  tipo: z.enum(['PAGAR', 'RECEBER']).catch('RECEBER'),
  valorCentavos: valorPositivo,
  vencimento: data('Informe o vencimento.'),
  descricao: textoObrigatorio('Informe a descrição.', 300),
  categoria: texto(100),
  forma: opcaoOpcional(FORMAS, 'Forma inválida.'),
  parcelas: PARCELAS,
  pacienteId: idOpcional,
  detalhes: texto(1000),
})

export const BaixarContaDto = z.object({ data: dataOpcional, forma: texto(40) })

export const ConciliarDto = z.object({ contaBancariaId: idOpcional })

export const ContaBancariaDto = z.object({
  nome: textoObrigatorio('Informe o nome da conta.', 100),
  banco: texto(100),
  agencia: texto(20),
  numero: texto(30),
  saldoInicialCentavos: z.number().int().catch(0),
})

// ── Retornos e orçamentos ───────────────────────────────────────────────────

export const RetornoDto = z.object({
  pacienteId: idObrigatorio('Escolha o paciente.'),
  profissionalId: idObrigatorio('Escolha o profissional.'),
  data: data('Informe a data do retorno.'),
  motivo: texto(500),
})

export const OrcamentoDto = z.object({
  pacienteId: idOpcional,
  profissionalId: idOpcional,
  itens: z.preprocess(
    (v) => (Array.isArray(v) ? v : []),
    z
      .array(
        z.object({
          procedimentoId: z.preprocess((v) => numeroPositivo(v) ?? 0, z.number()),
          // Sem valor (ou inválido), vale o da tabela (R-012).
          valorCentavos: centavos().nullable().catch(null),
          dente: texto(40),
        }),
      )
      .min(1, 'Adicione pelo menos um procedimento.'),
  ),
  descontoCentavos: z
    .number()
    .int()
    .catch(0)
    .transform((v) => Math.max(0, v)),
  forma: opcaoOpcional(FORMAS, 'Forma de pagamento inválida.'),
  parcelas: PARCELAS,
  primeiroVencimento: dataOpcional.catch(null),
  observacoes: texto(LIMITE_OBSERVACAO),
})

export const ReprovarOrcamentoDto = z.object({ motivo: texto(500) })

export const DesaprovarOrcamentoDto = z.object({ senha: qualquerTexto })

export const CancelarOrcamentoDto = z.object({
  ciente: z.literal(true, { error: 'Confirme que está ciente de que a ação é irreversível.' }),
})

// ── Prontuário ──────────────────────────────────────────────────────────────

const ATE_LIMITE = `Use até ${LIMITE_OBSERVACAO} caracteres.`
const observacao = z.preprocess(limpo(), z.string().max(LIMITE_OBSERVACAO, ATE_LIMITE).nullable())

export const NotaDto = z.object({
  texto: z.preprocess(
    limpo(),
    z
      .string({ error: 'Escreva a nota.' })
      .max(LIMITE_OBSERVACAO, `A nota passa de ${LIMITE_OBSERVACAO} caracteres.`),
  ),
})

/** As perguntas são conferidas em lerPerguntas (shared/prontuario). */
export const AnamneseDto = z.object({
  perguntas: z.unknown(),
  respondente: z.enum(['PACIENTE', 'PROFISSIONAL']).catch('PROFISSIONAL'),
  observacoes: texto(LIMITE_OBSERVACAO),
})

export const ProcedimentoClinicoDto = z.object({
  procedimentoId: idOpcional,
  nome: texto(200),
  profissionalId: idObrigatorio('Escolha o profissional.'),
  status: z.enum(chaves(STATUS_CLINICO), { error: 'Escolha o status.' }),
  // R-061: o dente é opcional; as faces só valem com dente.
  dente: z.preprocess(
    limpo(),
    z
      .string()
      .refine((d) => DENTES_VALIDOS.has(d), 'Dente inválido (numeração FDI).')
      .nullable(),
  ),
  faces: texto(20),
  data: dataOpcional,
  // R-078: duas observações de até 1500 caracteres.
  observacao,
  observacaoPaciente: observacao,
})

export const FichaEspecialidadeDto = z.object({
  especialidade: z.enum(ESPECIALIDADES_FICHA, { error: 'Escolha a especialidade.' }),
  profissionalId: idObrigatorio('Escolha o profissional.'),
  observacoes: texto(LIMITE_OBSERVACAO),
})

const statusDente = z.enum(STATUS_DENTE_FICHA, { error: 'Status inválido.' })

export const ItemFichaDto = z.object({
  // R-068: o procedimento da ficha exige dente.
  dente: z.preprocess(
    limpo(),
    z
      .string({ error: 'Informe o dente (numeração FDI).' })
      .refine((d) => DENTES_VALIDOS.has(d), 'Informe o dente (numeração FDI).'),
  ),
  procedimento: textoObrigatorio('Informe o procedimento.', 200),
  status: z.preprocess((v) => limpo()(v) ?? STATUS_DENTE_FICHA[0], statusDente),
  observacao: texto(LIMITE_OBSERVACAO),
})

/** Sem status, fica o que já estava. */
export const StatusItemFichaDto = z.object({
  status: z.preprocess(limpo(), statusDente.nullable()),
})

export const ArquivoDto = z.object({
  rotacao: z
    .union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)], {
      error: 'Rotação inválida.',
    })
    .optional(),
  espelhado: z.boolean().optional().catch(undefined),
})

export const LIMITE_DOCUMENTO = 20_000

export const DocumentoDto = z.object({
  modelo: z.enum(chaves(MODELOS_DOCUMENTO), { error: 'Escolha o modelo.' }),
  texto: z.preprocess(
    limpo(),
    z
      .string({ error: 'O documento está vazio.' })
      .max(LIMITE_DOCUMENTO, 'O documento está grande demais.'),
  ),
  profissionalId: idOpcional,
})

const DOCUMENTO_INVALIDO = 'O documento está vazio ou grande demais.'
export const TextoDocumentoDto = z.object({
  texto: z.preprocess(
    limpo(),
    z.string({ error: DOCUMENTO_INVALIDO }).max(LIMITE_DOCUMENTO, DOCUMENTO_INVALIDO),
  ),
})

// ── Protético ───────────────────────────────────────────────────────────────

export const TrabalhoProteticoDto = z.object({
  pacienteId: idObrigatorio('Escolha o paciente.'),
  profissionalId: idObrigatorio('Escolha o profissional.'),
  laboratorio: textoObrigatorio('Informe o laboratório.', 120),
  laboratorioContato: texto(120),
  trabalho: textoObrigatorio('Descreva o trabalho.', 200),
  dentes: texto(60),
  cor: texto(40),
  valorCentavos: centavos().default(0),
  observacoes: texto(1500),
  prazo: dataOpcional,
  enviadoEm: dataOpcional,
  retornoEm: dataOpcional,
  instaladoEm: dataOpcional,
})

export const EtapaDto = z.object({ etapa: z.enum(chaves(ETAPAS), { error: 'Etapa inválida.' }) })

// ── Integração (n8n) e importação ───────────────────────────────────────────

export const EventoRetornoDto = z.object({
  tipo: z.enum(['ENVIADO', 'FALHOU', 'RESPOSTA'], {
    error: 'tipo deve ser ENVIADO, FALHOU ou RESPOSTA.',
  }),
  situacao: z
    .enum(['CONFIRMADO', 'DESMARCADO'], { error: 'situacao deve ser CONFIRMADO ou DESMARCADO.' })
    .optional(),
  canal: z.enum(['WHATSAPP', 'EMAIL', 'SMS']).catch('WHATSAPP'),
  texto: texto(2000),
  erro: texto(2000),
})

export const LOTE_IMPORTACAO = 500

export const ImportacaoDto = z.object({
  linhas: z
    .array(z.record(z.string(), z.unknown()).catch({}), {
      error: `Envie de 1 a ${LOTE_IMPORTACAO} linhas por vez.`,
    })
    .max(LOTE_IMPORTACAO, `Envie de 1 a ${LOTE_IMPORTACAO} linhas por vez.`),
  primeiraLinha: z.preprocess((v) => numeroPositivo(v) ?? 1, z.number()),
  arquivo: texto(200),
})
