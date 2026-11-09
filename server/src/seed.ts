// Dados de desenvolvimento, todos FICTÍCIOS. Nunca coloque dados reais de pacientes aqui.
// Pode rodar várias vezes: atualiza os usuários e só cria o que ainda não existe.
import { db } from './db'
import { gerarHash } from './auth'
import { deflateSync, crc32 } from 'node:zlib'
import { normalizar } from '../../shared/regras'
import { randomBytes } from 'node:crypto'
import {
  MODELO_ANAMNESE,
  MODELOS_DOCUMENTO,
  denteComFaces,
  etapasDaFicha,
  preencherModelo,
} from '../../shared/prontuario'
import { TERMO } from './autorizacoes'
import type {
  MotivoInativacao,
  Perfil,
  Prisma,
  StatusAgenda,
  StatusClinico,
} from './generated/prisma/client'

if (process.env.NODE_ENV === 'production') throw new Error('O seed não roda em produção.')
const senha = process.env.SEED_SENHA_ADMIN
if (!senha) throw new Error('Defina SEED_SENHA_ADMIN em server/.env')
const senhaHash = await gerarHash(senha)

const data = (iso: string) => new Date(`${iso}T00:00:00Z`)
/** Todas as datas do seed partem de hoje (fuso local): dias(-3) = 3 dias atrás, dias(5) = daqui a 5. */
const hoje = data(new Date().toLocaleDateString('sv'))
const dias = (n: number) => new Date(hoje.getTime() + n * 86_400_000)

type Cor = readonly number[]
/**
 * Desenho bem simples (fundo + elipses) que vira PNG: gera as imagens fictícias de fotos e
 * exames sem precisar de arquivo de imagem. A cor da elipse pode depender de d (0 no centro,
 * 1 na borda), o que dá um sombreado; "dentro" recorta o desenho (ex.: só dentro da boca);
 * "forma" acima de 2 deixa a elipse mais quadrada (bom para dentes).
 */
function tela(largura: number, altura: number, fundo: (x: number, y: number) => Cor) {
  const px = Buffer.alloc(largura * altura * 3)
  const pintar = (x: number, y: number, cor: Cor) => px.set(cor, (y * largura + x) * 3)
  for (let y = 0; y < altura; y++) for (let x = 0; x < largura; x++) pintar(x, y, fundo(x, y))
  return {
    elipse(
      cx: number,
      cy: number,
      rx: number,
      ry: number,
      cor: Cor | ((d: number) => Cor),
      o: { graus?: number; forma?: number; dentro?: (x: number, y: number) => boolean } = {},
    ) {
      const { graus = 0, forma = 2, dentro } = o
      const [sen, cos] = [Math.sin((graus * Math.PI) / 180), Math.cos((graus * Math.PI) / 180)]
      const r = Math.ceil(Math.hypot(rx, ry))
      for (let y = Math.max(0, Math.round(cy - r)); y < Math.min(altura, cy + r); y++)
        for (let x = Math.max(0, Math.round(cx - r)); x < Math.min(largura, cx + r); x++) {
          const [u, v] = [(x - cx) * cos + (y - cy) * sen, (y - cy) * cos - (x - cx) * sen]
          const d = Math.abs(u / rx) ** forma + Math.abs(v / ry) ** forma
          if (d <= 1 && (!dentro || dentro(x, y)))
            pintar(x, y, typeof cor === 'function' ? cor(d) : cor)
        }
    },
    png: () => png(largura, altura, px),
  }
}
const naElipse = (cx: number, cy: number, rx: number, ry: number) => (x: number, y: number) =>
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1
/** Mistura duas cores: t = 0 é a primeira, t = 1 a segunda. */
const misturar = (a: Cor, b: Cor, t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
const cinza = (v: number) => [v, v, v].map((c) => Math.max(0, Math.min(255, Math.round(c))))

function png(largura: number, altura: number, px: Buffer) {
  const pedaco = (tipo: string, dados: Buffer) => {
    const tam = Buffer.alloc(4)
    tam.writeUInt32BE(dados.length)
    const corpo = Buffer.concat([Buffer.from(tipo, 'latin1'), dados])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(corpo))
    return Buffer.concat([tam, corpo, crc])
  }
  const cab = Buffer.alloc(13)
  cab.writeUInt32BE(largura, 0)
  cab.writeUInt32BE(altura, 4)
  cab.set([8, 2, 0, 0, 0], 8) // 8 bits, RGB
  const linhas = Array.from({ length: altura }, (_, y) =>
    Buffer.concat([Buffer.from([0]), px.subarray(y * largura * 3, (y + 1) * largura * 3)]),
  )
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pedaco('IHDR', cab),
    pedaco('IDAT', deflateSync(Buffer.concat(linhas))),
    pedaco('IEND', Buffer.alloc(0)),
  ])
}
const pngLiso = (largura: number, altura: number, cor: Cor) =>
  tela(largura, altura, () => cor).png()

/** PDF de uma página com as linhas de texto (Helvetica, acentos em latin1). */
function pdfTexto(linhas: string[]) {
  const escapar = (l: string) => l.replace(/[\\()]/g, '\\$&')
  const conteudo = `BT /F1 12 Tf 60 790 Td 18 TL ${linhas.map((l) => `(${escapar(l)}) '`).join(' ')} ET`
  const objetos = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>',
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>',
    `<</Length ${conteudo.length}>>stream\n${conteudo}\nendstream`,
  ]
  let pdf = '%PDF-1.4\n'
  const posicoes = objetos.map((o, i) => {
    const pos = pdf.length
    pdf += `${i + 1} 0 obj${o}endobj\n`
    return pos
  })
  const xref = pdf.length
  pdf +=
    `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n` +
    posicoes.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('') +
    `trailer<</Size ${objetos.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(pdf, 'latin1')
}

// ── Imagens fictícias, desenhadas uma vez e repetidas em todos os pacientes ──
const dente = (claro: number, escuro: number) => (d: number) => cinza(claro - (claro - escuro) * d)
const esmalte = (d: number) => misturar([250, 248, 240], [205, 195, 175], d)

function panoramica() {
  const t = tela(640, 320, (x, y) => cinza(70 - Math.hypot((x - 320) / 3.2, (y - 160) / 1.6) * 0.5))
  t.elipse(320, 165, 300, 150, dente(95, 60)) // osso
  const plano = (x: number) => 165 - 0.00055 * (x - 320) ** 2 // curva de Spee (sorriso)
  for (let i = 0; i < 16; i++) {
    const x = 80 + i * 32
    const meio = Math.abs(i - 7.5)
    const largura = meio > 4.5 ? 15 : meio > 2.5 ? 13 : 11
    const graus = Math.atan(-0.0006 * (x - 320)) * (180 / Math.PI)
    for (const lado of [-1, 1]) {
      if (lado === 1 && i === 13) continue // dente ausente (36)
      const y = plano(x)
      t.elipse(x, y + lado * 70, largura * 0.55, 44, dente(165, 115), { graus }) // raiz
      t.elipse(x, y + lado * 24, largura, 23, dente(230, 160), { graus, forma: 2.6 }) // coroa
      if ((i === 4 || i === 12) && lado === -1) t.elipse(x, y - 14, 7, 8, cinza(252)) // restauração
    }
  }
  return t.png()
}

function periapical() {
  const t = tela(260, 340, (x, y) => cinza(55 + 25 * Math.sin(x / 40) * Math.cos(y / 60)))
  for (const [x, tratado] of [
    [60, false],
    [130, true],
    [200, false],
  ] as const) {
    t.elipse(x, 215, 19, 110, dente(175, 125)) // raiz
    t.elipse(x, 92, 33, 58, dente(235, 170), { forma: 3 }) // coroa
    t.elipse(x, 112, 9, 32, cinza(115)) // câmara pulpar
    t.elipse(x, 225, 3, 92, cinza(tratado ? 252 : 115)) // canal (branco quando tratado)
  }
  return t.png()
}

function sorriso() {
  const t = tela(520, 340, (x, y) =>
    misturar([232, 186, 155], [190, 140, 115], Math.hypot(x - 260, y - 170) / 300),
  )
  t.elipse(260, 185, 205, 100, (d) => misturar([200, 90, 100], [160, 65, 75], d)) // lábios
  t.elipse(260, 185, 175, 62, [70, 22, 30]) // boca
  const dentro = naElipse(260, 185, 175, 62)
  const larguras = [30, 24, 24, 21, 19, 18]
  let [sup, inf] = [0, 0]
  for (const [i, l] of larguras.entries()) {
    for (const lado of [-1, 1]) {
      const li = l * 0.72
      t.elipse(260 + lado * (inf + li / 2), 228, li / 2 - 0.5, 22, esmalte, { forma: 3, dentro })
      t.elipse(260 + lado * (sup + l / 2), 165 + i, l / 2 - 0.5, 34 - i * 2.5, esmalte, {
        forma: 3,
        dentro,
      })
    }
    sup += l
    inf += l * 0.72
  }
  t.elipse(260, 128, 175, 30, (d) => misturar([230, 135, 145], [205, 110, 120], d), { dentro }) // gengiva
  return t.png()
}

function oclusal() {
  const t = tela(440, 360, (x, y) =>
    misturar([60, 35, 40], [20, 12, 14], Math.hypot(x - 220, y - 180) / 260),
  )
  t.elipse(220, 210, 180, 180, (d) => misturar([225, 130, 135], [185, 95, 105], d)) // palato
  for (let i = 0; i < 14; i++) {
    const a = -1.3 + i * 0.2
    const [dx, dy] = [150 * Math.cos(a), 220 * Math.sin(a)] // tangente do arco
    const meio = Math.abs(i - 6.5)
    const ry = meio > 4 ? 21 : meio > 2 ? 16 : meio > 1 ? 13 : 9
    const [x, y] = [220 + 150 * Math.sin(a), 315 - 220 * Math.cos(a)]
    const graus = (Math.atan2(dy, dx) * 180) / Math.PI
    t.elipse(x, y, Math.hypot(dx, dy) * 0.1, ry, esmalte, { graus, forma: 2.5 })
    if (i === 1) t.elipse(x, y, 8, 9, [160, 160, 168], { graus }) // amálgama
  }
  return t.png()
}

const IMAGENS_FICTICIAS = [
  { categoria: 'FOTO', pasta: 'Inicial', nome: 'sorriso-frontal.png', dados: sorriso() },
  { categoria: 'FOTO', pasta: 'Inicial', nome: 'oclusal-superior.png', dados: oclusal() },
  {
    categoria: 'FOTO',
    pasta: 'Pós-tratamento',
    nome: 'sorriso-frontal-final.png',
    dados: sorriso(),
  },
  { categoria: 'EXAME', pasta: 'Radiografias', nome: 'panoramica.png', dados: panoramica() },
  { categoria: 'EXAME', pasta: 'Radiografias', nome: 'periapical-11-21.png', dados: periapical() },
  {
    categoria: 'EXAME',
    pasta: null,
    nome: 'laudo-radiografico-ficticio.pdf',
    dados: pdfTexto([
      'LAUDO RADIOGRÁFICO (EXEMPLO FICTÍCIO)',
      '',
      'Exame: radiografia panorâmica',
      'Clínica de radiologia fictícia',
      '',
      'Dentição permanente. Ausência do dente 36.',
      'Restaurações radiopacas nos dentes 14 e 25.',
      'Tratamento endodôntico no dente 11, sem lesão periapical.',
      'Nível ósseo dentro da normalidade.',
      '',
      'Documento gerado pelo seed de desenvolvimento. Não é um exame real.',
    ]),
  },
] as const

/** CPF com dígitos verificadores corretos, a partir de 9 dígitos quaisquer. */
function cpfFicticio(base: string) {
  const d = base.split('').map(Number)
  for (const tam of [9, 10]) {
    const soma = d.slice(0, tam).reduce((s, n, i) => s + n * (tam + 1 - i), 0)
    d.push(((soma * 10) % 11) % 10)
  }
  return d.join('')
}

// ── Profissionais (pessoa do tipo PROFISSIONAL) ─────────────────────────────
const profissionais = [
  {
    login: 'dentista1',
    nome: 'Dra. Fictícia Andrade',
    especialidade: 'Ortodontia',
    corAgenda: '#f97316',
    cro: 'CRO-XX 10001',
  },
  {
    login: 'dentista2',
    nome: 'Dr. Fictício Barros',
    especialidade: 'Endodontia',
    corAgenda: '#3b82f6',
    cro: 'CRO-XX 10002',
  },
  {
    login: 'dentista3',
    nome: 'Dra. Fictícia Campos',
    especialidade: 'Dentística',
    corAgenda: '#a855f7',
    cro: 'CRO-XX 10003',
  },
  {
    login: 'dentista4',
    nome: 'Dr. Fictício Duarte',
    especialidade: 'Implantodontia',
    corAgenda: '#22c55e',
    cro: 'CRO-XX 10004',
  },
  {
    login: 'dentista5',
    nome: 'Dra. Fictícia Esteves',
    especialidade: 'Odontopediatria',
    corAgenda: '#ec4899',
    cro: 'CRO-XX 10005',
  },
  {
    login: 'dentista6',
    nome: 'Dr. Fictício Freitas',
    especialidade: 'Periodontia',
    corAgenda: '#14b8a6',
    cro: 'CRO-XX 10006',
  },
]
const pessoaDe: Record<string, number> = {}
for (const { login, ...p } of profissionais) {
  const existente = await db.pessoa.findFirst({ where: { tipo: 'PROFISSIONAL', nome: p.nome } })
  const dados = { ...p, nomeBusca: normalizar(p.nome), email: `${login}@example.com` }
  pessoaDe[login] = (
    existente
      ? await db.pessoa.update({ where: { id: existente.id }, data: dados })
      : await db.pessoa.create({ data: { tipo: 'PROFISSIONAL', ...dados } })
  ).id
}

// ── Usuários: um por perfil, um com dois perfis (a permissão soma) e um inativo ──
// Todos com e-mail fictício login@example.com (é para onde iria o código de "esqueci a senha").
type UsuarioSeed = {
  login: string
  nome: string
  perfis: Perfil[]
  pessoaId?: number
  ativo?: boolean
}
const usuarios: UsuarioSeed[] = [
  { login: 'admin', nome: 'Administrador', perfis: ['ADMINISTRADOR'] },
  ...profissionais.map((p) => ({
    login: p.login,
    nome: p.nome,
    perfis: ['PROFISSIONAL'] as Perfil[],
    pessoaId: pessoaDe[p.login],
  })),
  { login: 'recepcao1', nome: 'Recepção Fictícia Um', perfis: ['RECEPCAO'] },
  { login: 'recepcao2', nome: 'Recepção Fictícia Dois', perfis: ['RECEPCAO'] },
  { login: 'financeiro', nome: 'Financeiro Fictício', perfis: ['FINANCEIRO'] },
  { login: 'gestor', nome: 'Gestor Fictício', perfis: ['ADMINISTRADOR', 'FINANCEIRO'] },
  // Saiu da clínica: aparece na tela de Usuários, mas não entra.
  { login: 'ex.recepcao', nome: 'Ex-Recepção Fictícia', perfis: ['RECEPCAO'], ativo: false },
]
for (const { ativo = true, ...u } of usuarios) {
  const dados = { ...u, email: `${u.login}@example.com`, senhaHash, ativo }
  await db.usuario.upsert({ where: { login: u.login }, update: dados, create: dados })
}
const adminId = (await db.usuario.findUniqueOrThrow({ where: { login: 'admin' } })).id

// ── Pacientes ───────────────────────────────────────────────────────────────
type NovoPaciente = Omit<Prisma.PessoaUncheckedCreateInput, 'tipo' | 'nomeBusca'>

const origens = ['Google', 'Instagram', 'Facebook', 'Indicado por', 'Placa', 'Outros']
const pacientes: NovoPaciente[] = []

// 24 pacientes simples: vários "Silva" (busca com % e paginação) e nomes com acento.
const primeiros = ['Ana', 'João', 'José', 'Maria', 'Conceição', 'Luís', 'Márcia', 'Antônio']
const sobrenomes = ['Silva', 'Souza Silva', 'Oliveira']
primeiros.forEach((p, i) =>
  sobrenomes.forEach((s, j) => {
    const n = i * sobrenomes.length + j
    const origem = origens[n % origens.length]
    const fem = /a$|ção$/.test(p)
    pacientes.push({
      nome: `${p} ${fem ? 'Fictícia' : 'Fictício'} ${s}`,
      nascimento: data(`${1950 + n * 2}-${String((n % 12) + 1).padStart(2, '0')}-15`),
      celular: `+55 11 90000-${1000 + n}`,
      email: n % 3 === 0 ? null : `paciente${n}@example.com`,
      sexo: fem ? 'Feminino' : 'Masculino',
      comoConheceu: origem,
      indicadoPor: origem === 'Indicado por' ? 'Paciente Fictício Indicador' : null,
    })
  }),
)

// Cadastro completo, com todos os campos.
pacientes.push({
  nome: 'Paciente Fictício Completo',
  apelido: 'Completo',
  nascimento: data('1980-06-20'),
  cpf: cpfFicticio('123456789'),
  rg: '12.345.678-9',
  sexo: 'Masculino',
  estadoCivil: 'Casado(a)',
  celular: '+55 11 90000-9999',
  telefone: '+55 11 3000-0000',
  email: 'completo@example.com',
  comoConheceu: 'Instagram',
  nomeMae: 'Mãe Fictícia Completa',
  nomePai: 'Pai Fictício Completo',
  observacoes: 'Paciente de exemplo com todos os campos preenchidos.',
})

// Menor de idade, com responsável legal.
const anoMenor = new Date().getFullYear() - 12
pacientes.push({
  nome: 'Criança Fictícia Menor',
  nascimento: data(`${anoMenor}-03-10`),
  sexo: 'Feminino',
  nomeMae: 'Mãe Fictícia Responsável',
  responsavelNome: 'Mãe Fictícia Responsável',
  responsavelParentesco: 'Mãe',
  responsavelCpf: cpfFicticio('987654321'),
  celular: '+55 11 90000-8888',
})

// Inativos (continuam acessíveis, mas não recebem consultas).
const inativos: [string, MotivoInativacao, string | null][] = [
  ['Paciente Fictício Inativo', 'DESISTENCIA_TRATAMENTO', null],
  ['Paciente Fictícia Mudou', 'OUTROS', 'Mudou de cidade'],
]
for (const [nome, motivo, descricao] of inativos)
  pacientes.push({
    nome,
    nascimento: data('1975-09-01'),
    ativo: false,
    motivoInativacao: motivo,
    motivoInativacaoDescricao: descricao,
  })

// Na lixeira (exclusão lógica), para testar a restauração.
for (const nome of ['Paciente Fictício Excluído', 'Paciente Fictícia Duplicada'])
  pacientes.push({
    nome,
    nascimento: data('1990-12-12'),
    excluidoEm: new Date(),
    excluidoPorId: adminId,
  })

let criados = 0
for (const p of pacientes) {
  const nome = p.nome as string
  if (await db.pessoa.findFirst({ where: { tipo: 'PACIENTE', nome } })) continue
  await db.pessoa.create({
    data: {
      ...p,
      tipo: 'PACIENTE',
      nomeBusca: normalizar(nome),
      criadoPorId: adminId,
      alteradoPorId: adminId,
    },
  })
  criados++
}

// ── Agenda: hoje + 60 dias bem cheios, com encaixes (sobrepostos) e compromissos ──
// Gera só para quem ainda não tem nada de hoje em diante (profissional novo ganha agenda).
let consultas = 0
const agora = new Date()
const hojeIso = hoje.toISOString().slice(0, 10)
const dentistas = Object.values(pessoaDe)
const gerar: number[] = []
for (const [prof, id] of dentistas.entries())
  if (!(await db.agendamento.count({ where: { profissionalId: id, data: { gte: hoje } } })))
    gerar.push(prof)
if (gerar.length) {
  const ativos = await db.pessoa.findMany({
    where: { tipo: 'PACIENTE', ativo: true, excluidoEm: null },
    orderBy: { id: 'asc' },
  })
  const recepcaoId = (await db.usuario.findUniqueOrThrow({ where: { login: 'recepcao1' } })).id
  // Sorteio com semente fixa: a agenda gerada é sempre a mesma.
  let semente = 20261028
  const sorte = () => (semente = (semente * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
  const um = <T>(xs: readonly T[]) => xs[Math.floor(sorte() * xs.length)]
  const hhmm = (min: number) =>
    `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
  const minAgora = agora.getHours() * 60 + agora.getMinutes()
  const categorias = [
    'Consulta',
    'Consulta',
    'Retorno',
    'Avaliação',
    'Periódico',
    'Ortopedia',
    'Cirurgia',
  ]
  const observacoes = [
    'Paciente ansioso, explicar o procedimento.',
    'Trazer exames.',
    'Prefere ser chamado pelo apelido.',
    'Alergia a dipirona (fictício).',
  ]
  const linhas: Prisma.AgendamentoUncheckedCreateInput[] = []

  const consulta = (
    dia: Date,
    n: number,
    prof: number,
    ini: number,
    fim: number,
    encaixe = false,
  ) => {
    const categoria = um(categorias)
    let status: StatusAgenda = sorte() < 0.35 ? 'CONFIRMADO' : 'AGENDADO'
    let chegou: number | null = null
    if (n === 0) {
      // Hoje o status acompanha o relógio: já passou, está acontecendo ou está para começar.
      if (fim <= minAgora) status = 'ATENDIDO'
      else if (ini <= minAgora) status = sorte() < 0.8 ? 'EM_ATENDIMENTO' : 'ATRASADO'
      else if (ini - minAgora <= 45) status = sorte() < 0.6 ? 'EM_ESPERA' : 'CONFIRMADO'
      if (status === 'ATENDIDO' || status === 'EM_ATENDIMENTO' || status === 'EM_ESPERA')
        chegou = Math.max(7 * 60, Math.min(ini, minAgora) - 5 - Math.floor(sorte() * 15))
    }
    const checkin = chegou === null ? null : new Date(`${hojeIso}T${hhmm(chegou)}:00`)
    const desmarcada = n > 0 && sorte() < 0.04
    linhas.push({
      data: dia,
      inicio: hhmm(ini),
      fim: hhmm(fim),
      profissionalId: dentistas[prof],
      pacienteId: um(ativos).id,
      categoria,
      primeiraConsulta: categoria === 'Avaliação' && sorte() < 0.6,
      observacoes: encaixe
        ? 'Encaixe: paciente com dor, pediu para ser visto no dia.'
        : sorte() < 0.1
          ? um(observacoes)
          : null,
      status,
      checkinEm: checkin,
      esperaInicio: checkin,
      confirmacao: sorte() < 0.5 ? 'WHATSAPP' : 'NAO_ENVIAR',
      confirmadoEm: status === 'CONFIRMADO' ? agora : null,
      confirmadoPor: status === 'CONFIRMADO' ? um(['Paciente', 'Recepção Fictícia Um']) : null,
      desmarcadoEm: desmarcada ? agora : null,
      desmarcadoPorId: desmarcada ? recepcaoId : null,
      motivoDesmarcacao: desmarcada
        ? um(['Paciente pediu para remarcar', 'Viagem', 'Doente'])
        : null,
      criadoPorId: sorte() < 0.5 ? adminId : recepcaoId,
    })
  }

  for (let n = 0; n <= 60; n++) {
    const dia = dias(n)
    const semana = dia.getUTCDay()
    if (semana === 0) continue // domingo fechado

    // Compromissos do dia: reunião toda quarta no almoço, curso numa sexta, manutenção.
    const compromissos: { titulo: string; prof: number; ini: number; fim: number }[] = []
    if (semana === 3)
      compromissos.push({ titulo: 'Reunião semanal da equipe', prof: 0, ini: 720, fim: 780 })
    if (semana === 5 && n > 7 && n < 15)
      for (const prof of dentistas.keys())
        compromissos.push({ titulo: 'Curso de atualização', prof, ini: 840, fim: 1080 })
    if (n === 3)
      compromissos.push({ titulo: 'Manutenção do equipamento', prof: 1, ini: 900, fim: 990 })
    for (const c of compromissos.filter((c) => gerar.includes(c.prof)))
      linhas.push({
        tipo: 'COMPROMISSO',
        titulo: c.titulo,
        data: dia,
        inicio: hhmm(c.ini),
        fim: hhmm(c.fim),
        profissionalId: dentistas[c.prof],
        criadoPorId: adminId,
      })

    /** Almoço, compromisso, ou o horário que o e2e marca (Dra. Andrade, segunda 10:00). */
    const bloqueado = (prof: number, ini: number, fim: number) =>
      (ini < 780 && fim > 720) ||
      (prof === 0 && semana === 1 && ini < 630 && fim > 600) ||
      compromissos.some((c) => c.prof === prof && ini < c.fim && fim > c.ini)

    const ocupacao = n < 7 ? 0.85 : n < 21 ? 0.65 : n < 40 ? 0.4 : 0.2 // perto enche mais
    const fimDia = semana === 6 ? 720 : 1140 // sábado só de manhã
    for (const prof of gerar) {
      const blocos: [number, number][] = []
      for (let t = 480; t < fimDia;) {
        const fim = Math.min(t + um([15, 30, 30, 30, 45, 60]), fimDia)
        if (!bloqueado(prof, t, fim) && sorte() < ocupacao) {
          consulta(dia, n, prof, t, fim)
          blocos.push([t, fim])
        }
        t = fim
      }
      // Encaixes: começam no meio de outra consulta; às vezes ficam três lado a lado.
      const qtd = n === 0 ? 3 : n < 14 ? Math.floor(sorte() * 3) : sorte() < 0.3 ? 1 : 0
      const longos = blocos.filter(([a, b]) => b - a >= 30 && !bloqueado(prof, a, b + 30))
      for (let k = 0; k < qtd && longos.length; k++) {
        const ini = um(longos)[0] + 15
        consulta(dia, n, prof, ini, ini + um([15, 30]), true)
        if (sorte() < 0.25) consulta(dia, n, prof, ini, ini + 15, true)
      }
    }
  }
  await db.agendamento.createMany({ data: linhas })
  consultas = linhas.filter((l) => l.tipo !== 'COMPROMISSO').length
}

console.log(`Seed pronto: ${criados} pacientes novos (${pacientes.length} no total do seed).`)
console.log(`Agenda: ${consultas} consultas fictícias criadas.`)

// ── Conta corrente: lançamentos fictícios nos últimos 7 dias ─────────────────
if (!(await db.lancamento.count())) {
  const alguns = await db.pessoa.findMany({
    where: { tipo: 'PACIENTE', ativo: true, excluidoEm: null },
    take: 6,
  })
  const formas = ['Pix', 'Cartão de crédito', 'Dinheiro', 'Cartão de débito']
  for (let i = 0; i < alguns.length; i++) {
    const data = dias(-i)
    const valor = (3 + i) * 15000
    await db.lancamento.create({
      data: {
        data,
        tipo: 'VENDA',
        valorCentavos: valor,
        descricao: 'Tratamento aprovado',
        pacienteId: alguns[i].id,
        criadoPorId: adminId,
      },
    })
    await db.lancamento.create({
      data: {
        data,
        tipo: 'ENTRADA',
        valorCentavos: valor / 3,
        descricao: 'Parcela 1',
        forma: formas[i % formas.length],
        pacienteId: alguns[i].id,
        criadoPorId: adminId,
      },
    })
  }
  await db.lancamento.create({
    data: {
      data: hoje,
      tipo: 'SAIDA',
      valorCentavos: 23990,
      descricao: 'Material de consumo',
      forma: 'Boleto',
      criadoPorId: adminId,
    },
  })
  console.log('Conta corrente: lançamentos fictícios criados.')
}

// ── Tabela de procedimentos (valores e custos fictícios) ─────────────────────
// [nome, especialidade, valor final, custo para a clínica]
const TABELA: [string, string, number, number][] = [
  ['Consulta de avaliação', 'Clínica geral', 15000, 1500],
  ['Limpeza (profilaxia)', 'Periodontia', 18000, 3500],
  ['Raspagem por quadrante', 'Periodontia', 22000, 4500],
  ['Restauração em resina (1 face)', 'Dentística', 25000, 6000],
  ['Restauração em resina (2 faces)', 'Dentística', 32000, 8000],
  ['Clareamento em consultório', 'Dentística', 90000, 28000],
  ['Tratamento de canal (unirradicular)', 'Endodontia', 85000, 18000],
  ['Tratamento de canal (multirradicular)', 'Endodontia', 130000, 30000],
  ['Extração simples', 'Cirurgia bucomaxilofacial', 25000, 5000],
  ['Extração de siso', 'Cirurgia bucomaxilofacial', 60000, 14000],
  ['Coroa de porcelana', 'Prótese', 180000, 75000],
  ['Implante unitário', 'Implantodontia', 350000, 160000],
  ['Aparelho ortodôntico fixo (instalação)', 'Ortodontia', 120000, 45000],
  ['Manutenção ortodôntica mensal', 'Ortodontia', 25000, 4000],
  ['Aplicação de flúor', 'Odontopediatria', 8000, 1200],
  ['Selante por dente', 'Odontopediatria', 9000, 1800],
]
if (!(await db.procedimento.count())) {
  await db.procedimento.createMany({
    data: TABELA.map(([nome, especialidade, valorCentavos, custoCentavos]) => ({
      nome,
      nomeBusca: normalizar(nome),
      especialidade,
      valorCentavos,
      custoCentavos,
    })),
  })
  console.log('Tabela de procedimentos criada.')
}
// Bancos de antes do custo: preenche o custo da tabela e dos itens que ainda estão zerados.
for (const [nome, , , custoCentavos] of TABELA) {
  const { count } = await db.procedimento.updateMany({
    where: { nome, custoCentavos: 0 },
    data: { custoCentavos },
  })
  if (count)
    await db.itemOrcamento.updateMany({
      where: { procedimento: { nome }, custoCentavos: 0 },
      data: { custoCentavos },
    })
}

// ── Orçamentos, contas, retornos e conta bancária fictícios ─────────────────
if (!(await db.orcamento.count())) {
  const pacs = await db.pessoa.findMany({
    where: { tipo: 'PACIENTE', ativo: true, excluidoEm: null },
    take: 4,
    orderBy: { id: 'asc' },
  })
  const procs = await db.procedimento.findMany({ orderBy: { id: 'asc' } })
  const dentistas = Object.values(pessoaDe)
  const item = (p: (typeof procs)[number], dente: string | null = null) => ({
    procedimentoId: p.id,
    nome: p.nome,
    dente,
    valorCentavos: p.valorCentavos,
    custoCentavos: p.custoCentavos,
  })

  // Em aberto.
  await db.orcamento.create({
    data: {
      pacienteId: pacs[0].id,
      profissionalId: dentistas[0],
      criadoPorId: adminId,
      forma: 'Pix',
      itens: { create: [item(procs[3], '16'), item(procs[1])] },
    },
  })

  // Aprovado em 3x: uma parcela paga e um procedimento já feito.
  const totalAprovado = procs[6].valorCentavos + procs[10].valorCentavos
  const aprovado = await db.orcamento.create({
    data: {
      pacienteId: pacs[1].id,
      profissionalId: dentistas[1],
      criadoPorId: adminId,
      status: 'APROVADO',
      aprovadoEm: dias(-20),
      aprovadoPorId: adminId,
      forma: 'Boleto',
      parcelas: 3,
      primeiroVencimento: dias(-10),
      itens: {
        create: [
          { ...item(procs[6], '36'), executadoEm: dias(-5), executadoPorId: adminId },
          item(procs[10], '36'),
        ],
      },
    },
  })
  await db.lancamento.create({
    data: {
      data: dias(-20),
      tipo: 'VENDA',
      valorCentavos: totalAprovado,
      descricao: `Orçamento nº ${aprovado.id} aprovado`,
      categoria: 'Receita de tratamentos',
      pacienteId: pacs[1].id,
      orcamentoId: aprovado.id,
      criadoPorId: adminId,
    },
  })
  const terco = Math.floor(totalAprovado / 3)
  for (let i = 0; i < 3; i++) {
    const valor = i === 0 ? totalAprovado - terco * 2 : terco
    const venc = dias(-10 + i * 30)
    const descricao = `Orçamento nº ${aprovado.id} – parcela ${i + 1}/3`
    const paga =
      i === 0
        ? await db.lancamento.create({
            data: {
              data: venc,
              tipo: 'ENTRADA',
              valorCentavos: valor,
              descricao,
              forma: 'Boleto',
              categoria: 'Receita de tratamentos',
              pacienteId: pacs[1].id,
              orcamentoId: aprovado.id,
              criadoPorId: adminId,
            },
          })
        : null
    await db.contaFinanceira.create({
      data: {
        tipo: 'RECEBER',
        descricao,
        valorCentavos: valor,
        vencimento: venc,
        forma: 'Boleto',
        categoria: 'Receita de tratamentos',
        pacienteId: pacs[1].id,
        orcamentoId: aprovado.id,
        parcela: i + 1,
        totalParcelas: 3,
        status: paga ? 'PAGA' : 'ABERTA',
        pagoEm: paga ? venc : null,
        lancamentoId: paga?.id,
        criadoPorId: adminId,
      },
    })
  }

  // Outro em aberto.
  await db.orcamento.create({
    data: {
      pacienteId: pacs[2].id,
      profissionalId: dentistas[2],
      criadoPorId: adminId,
      observacoes: 'Paciente vai pensar',
      itens: { create: [item(procs[11], '46')] },
    },
  })

  // Contas a pagar e um cheque a receber.
  const pagar: [string, number, number, string, string][] = [
    ['Aluguel', 450000, 5, 'Aluguel e condomínio', 'Imobiliária Fictícia'],
    ['Material de consumo', 68000, -3, 'Material odontológico', 'Dental Fictícia'],
    ['Laboratório: coroa', 42000, 12, 'Laboratório de prótese', 'Laboratório Fictício'],
    ['Internet', 15000, 8, 'Água, luz, telefone e internet', 'Provedor Fictício'],
  ]
  for (const [descricao, valorCentavos, d, categoria, detalhes] of pagar)
    await db.contaFinanceira.create({
      data: {
        tipo: 'PAGAR',
        descricao,
        valorCentavos,
        vencimento: dias(d),
        categoria,
        detalhes,
        forma: 'Boleto',
        criadoPorId: adminId,
      },
    })
  await db.contaFinanceira.create({
    data: {
      tipo: 'RECEBER',
      descricao: 'Tratamento: cheque pré-datado',
      valorCentavos: 50000,
      vencimento: dias(15),
      forma: 'Cheque',
      categoria: 'Receita de tratamentos',
      detalhes: 'Banco 000, cheque 000123 (fictício)',
      pacienteId: pacs[3].id,
      criadoPorId: adminId,
    },
  })

  // Retornos e uma conta bancária.
  for (const [i, d] of [20, 45, 60].entries())
    await db.alertaRetorno.create({
      data: {
        pacienteId: pacs[i].id,
        profissionalId: dentistas[i],
        data: dias(d),
        motivo: 'Revisão semestral',
        criadoPorId: adminId,
      },
    })
  await db.contaBancaria.create({
    data: {
      nome: 'Conta da clínica',
      banco: 'Banco Fictício',
      agencia: '0001',
      numero: '12345-6',
      saldoInicialCentavos: 500000,
    },
  })
  console.log('Orçamentos, contas, retornos e conta bancária fictícios criados.')
}

// ── Orçamentos aprovados nos últimos 6 meses (Controle Financeiro e gráficos) ─
if ((await db.orcamento.count({ where: { status: 'APROVADO' } })) < 10) {
  let semente = 20261104
  const sorte = () => (semente = (semente * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
  const um = <T>(xs: readonly T[]) => xs[Math.floor(sorte() * xs.length)]
  const pacs = await db.pessoa.findMany({
    where: { tipo: 'PACIENTE', ativo: true, excluidoEm: null },
    take: 40,
    orderBy: { id: 'asc' },
  })
  const procs = await db.procedimento.findMany({ where: { ativo: true } })
  const formas = ['Pix', 'Pix', 'Cartão de crédito', 'Cartão de débito', 'Dinheiro', 'Boleto']
  let n = 0
  for (let d = -170; d <= 0; d += 1 + Math.floor(sorte() * 5)) {
    const aprovadoEm = dias(d)
    if (aprovadoEm.getUTCDay() === 0) continue
    const escolhidos = Array.from({ length: 1 + Math.floor(sorte() * 3) }, () => um(procs))
    const itens = escolhidos.map((p) => ({
      procedimentoId: p.id,
      nome: p.nome,
      valorCentavos: p.valorCentavos,
      custoCentavos: p.custoCentavos,
    }))
    const subtotal = itens.reduce((s, i) => s + i.valorCentavos, 0)
    const descontoCentavos = sorte() < 0.3 ? Math.round((subtotal * um([5, 10, 15])) / 100) : 0
    const total = subtotal - descontoCentavos
    const pacienteId = um(pacs).id
    const o = await db.orcamento.create({
      data: {
        pacienteId,
        profissionalId: um(dentistas),
        criadoPorId: adminId,
        status: 'APROVADO',
        aprovadoEm: new Date(aprovadoEm.getTime() + 15 * 3_600_000),
        aprovadoPorId: adminId,
        descontoCentavos,
        itens: { create: itens },
      },
    })
    const comum = {
      categoria: 'Receita de tratamentos',
      pacienteId,
      orcamentoId: o.id,
      criadoPorId: adminId,
    }
    await db.lancamento.create({
      data: {
        ...comum,
        data: aprovadoEm,
        tipo: 'VENDA',
        valorCentavos: total,
        descricao: `Orçamento nº ${o.id} aprovado`,
      },
    })
    // Os mais antigos quase sempre já foram pagos; os recentes, nem sempre.
    const pago = sorte() < (d < -30 ? 0.9 : 0.55)
    const pagoEm = dias(Math.min(0, d + Math.floor(sorte() * 10)))
    const forma = um(formas)
    const l = pago
      ? await db.lancamento.create({
          data: {
            ...comum,
            data: pagoEm,
            tipo: 'ENTRADA',
            valorCentavos: total,
            forma,
            descricao: `Orçamento nº ${o.id}`,
          },
        })
      : null
    await db.contaFinanceira.create({
      data: {
        ...comum,
        tipo: 'RECEBER',
        descricao: `Orçamento nº ${o.id}`,
        valorCentavos: total,
        vencimento: aprovadoEm,
        parcela: 1,
        totalParcelas: 1,
        status: l ? 'PAGA' : 'ABERTA',
        pagoEm: l ? pagoEm : null,
        forma: l ? forma : null,
        lancamentoId: l?.id,
      },
    })
    n++
  }
  console.log(`Financeiro: ${n} orçamentos aprovados fictícios nos últimos 6 meses.`)
}

// ── Movimento de um ano: muitos orçamentos aprovados (pagos na aprovação) e alguns abertos ──
if ((await db.orcamento.count({ where: { status: 'APROVADO' } })) < 250) {
  let semente = 20261105
  const sorte = () => (semente = (semente * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
  const um = <T>(xs: readonly T[]) => xs[Math.floor(sorte() * xs.length)]
  const pacs = await db.pessoa.findMany({
    where: { tipo: 'PACIENTE', ativo: true, excluidoEm: null },
    take: 120,
    orderBy: { id: 'asc' },
  })
  const procs = await db.procedimento.findMany({ where: { ativo: true }, orderBy: { id: 'asc' } })
  // Os baratos e comuns saem mais; implante e coroa, menos.
  const peso = (p: (typeof procs)[number]) =>
    p.valorCentavos <= 30000 ? 5 : p.valorCentavos <= 100000 ? 3 : 1
  const sorteio = procs.flatMap((p) => Array(peso(p)).fill(p) as (typeof procs)[number][])
  // Cada profissional com um movimento diferente, para o filtro e os gráficos mostrarem algo.
  const agenda = dentistas.flatMap((id, i) => Array(Math.max(1, 4 - (i % 4))).fill(id) as number[])
  const formas = [
    'Pix',
    'Pix',
    'Pix',
    'Cartão de crédito',
    'Cartão de crédito',
    'Cartão de débito',
    'Dinheiro',
    'Boleto',
  ]
  const novo = async (quando: Date, aprovado: boolean) => {
    const escolhidos = Array.from({ length: 1 + Math.floor(sorte() * sorte() * 4) }, () =>
      um(sorteio),
    )
    const itens = escolhidos.map((p) => ({
      procedimentoId: p.id,
      nome: p.nome,
      dente: sorte() < 0.6 ? String(um([11, 12, 14, 16, 21, 24, 26, 36, 37, 46, 47])) : null,
      valorCentavos: p.valorCentavos,
      custoCentavos: p.custoCentavos,
    }))
    const subtotal = itens.reduce((t, i) => t + i.valorCentavos, 0)
    const descontoCentavos = sorte() < 0.25 ? Math.round((subtotal * um([5, 10, 15])) / 100) : 0
    const total = subtotal - descontoCentavos
    const pacienteId = um(pacs).id
    const meioDia = new Date(quando.getTime() + 15 * 3_600_000)
    const o = await db.orcamento.create({
      data: {
        pacienteId,
        profissionalId: um(agenda),
        criadoPorId: adminId,
        criadoEm: new Date(
          meioDia.getTime() - (aprovado ? Math.floor(sorte() * 10) * 86_400_000 : 0),
        ),
        descontoCentavos,
        ...(aprovado && {
          status: 'APROVADO' as const,
          aprovadoEm: meioDia,
          aprovadoPorId: adminId,
        }),
        itens: { create: itens },
      },
    })
    if (!aprovado) return
    const comum = {
      categoria: 'Receita de tratamentos',
      pacienteId,
      orcamentoId: o.id,
      criadoPorId: adminId,
    }
    const forma = um(formas)
    await db.lancamento.create({
      data: {
        ...comum,
        data: quando,
        tipo: 'VENDA',
        valorCentavos: total,
        descricao: `Orçamento nº ${o.id} aprovado`,
      },
    })
    const l = await db.lancamento.create({
      data: {
        ...comum,
        data: quando,
        tipo: 'ENTRADA',
        valorCentavos: total,
        forma,
        descricao: `Orçamento nº ${o.id}`,
      },
    })
    await db.contaFinanceira.create({
      data: {
        ...comum,
        tipo: 'RECEBER',
        descricao: `Orçamento nº ${o.id}`,
        valorCentavos: total,
        vencimento: quando,
        parcela: 1,
        totalParcelas: 1,
        status: 'PAGA',
        pagoEm: quando,
        forma,
        lancamentoId: l.id,
      },
    })
  }
  let aprovados = 0
  for (let d = -364; d <= 0; d++) {
    const quando = dias(d)
    const semana = quando.getUTCDay()
    if (semana === 0) continue
    // Sábado é mais fraco; o fim de ano também. Média de ~1,5 por dia útil.
    const mes = quando.getUTCMonth()
    const media = (semana === 6 ? 0.6 : 1.6) * (mes === 0 || mes === 11 ? 0.7 : 1)
    const n = Math.floor(media + sorte() * 1.6)
    for (let k = 0; k < n; k++) {
      await novo(quando, true)
      aprovados++
    }
  }
  let abertos = 0
  for (let k = 0; k < 40; k++) {
    await novo(dias(-Math.floor(sorte() * sorte() * 90)), false)
    abertos++
  }
  console.log(`Financeiro: ${aprovados} orçamentos aprovados e ${abertos} abertos no último ano.`)
}

// ── Casos para os relatórios: faltas, atendidas, primeira consulta, desmarcações,
// retornos, parcela atrasada e acessos a fichas, todos dentro do mês atual ──
if (!(await db.agendamento.count({ where: { status: 'FALTOU' } }))) {
  const primeiro = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1)
  const ultimo = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 0)
  /** Hoje + n dias, sem sair do mês atual e sem cair no domingo. */
  const noMes = (n: number) => {
    let t = Math.min(ultimo, Math.max(primeiro, dias(n).getTime()))
    if (new Date(t).getUTCDay() === 0) t += t + 86_400_000 <= ultimo ? 86_400_000 : -86_400_000
    return new Date(t)
  }
  const pacs = await db.pessoa.findMany({
    where: { tipo: 'PACIENTE', ativo: true, excluidoEm: null },
    orderBy: { id: 'asc' },
    skip: 12,
    take: 10,
  })
  const dentistas = Object.values(pessoaDe)
  const casos: {
    dia: number
    inicio: string
    status: 'FALTOU' | 'ATENDIDO' | 'AGENDADO'
    primeira?: boolean
    desmarcada?: string
  }[] = [
    { dia: -1, inicio: '09:00', status: 'FALTOU' },
    { dia: -2, inicio: '14:30', status: 'FALTOU' },
    { dia: -1, inicio: '10:00', status: 'ATENDIDO', primeira: true },
    { dia: -2, inicio: '11:15', status: 'ATENDIDO' },
    { dia: -3, inicio: '16:00', status: 'ATENDIDO', primeira: true },
    { dia: -4, inicio: '08:45', status: 'ATENDIDO' },
    { dia: 2, inicio: '15:00', status: 'AGENDADO', desmarcada: 'Paciente pediu para remarcar' },
    { dia: -3, inicio: '17:30', status: 'AGENDADO', desmarcada: 'Imprevisto do profissional' },
  ]
  for (const [i, c] of casos.entries()) {
    const [h, m] = c.inicio.split(':').map(Number)
    const fim = h * 60 + m + 30
    await db.agendamento.create({
      data: {
        data: noMes(c.dia),
        inicio: c.inicio,
        fim: `${String(Math.floor(fim / 60)).padStart(2, '0')}:${String(fim % 60).padStart(2, '0')}`,
        profissionalId: dentistas[i % dentistas.length],
        pacienteId: pacs[i].id,
        categoria: c.primeira ? 'Avaliação' : 'Consulta',
        status: c.status,
        primeiraConsulta: !!c.primeira,
        desmarcadoEm: c.desmarcada ? new Date() : null,
        desmarcadoPorId: c.desmarcada ? adminId : null,
        motivoDesmarcacao: c.desmarcada ?? null,
        criadoPorId: adminId,
      },
    })
  }
  await db.alertaRetorno.createMany({
    data: [
      {
        pacienteId: pacs[8].id,
        profissionalId: dentistas[0],
        data: noMes(-2),
        motivo: 'Controle pós-cirúrgico',
        criadoPorId: adminId,
      },
      {
        pacienteId: pacs[9].id,
        profissionalId: dentistas[1],
        data: noMes(-4),
        motivo: 'Revisão',
        concluidoEm: new Date(),
        criadoPorId: adminId,
      },
      {
        pacienteId: pacs[0].id,
        profissionalId: dentistas[2],
        data: noMes(4),
        motivo: 'Manutenção ortodôntica',
        criadoPorId: adminId,
      },
    ],
  })
  await db.contaFinanceira.create({
    data: {
      tipo: 'RECEBER',
      descricao: 'Tratamento: parcela em atraso',
      valorCentavos: 35000,
      vencimento: noMes(-8),
      forma: 'Boleto',
      categoria: 'Receita de tratamentos',
      pacienteId: pacs[1].id,
      criadoPorId: adminId,
    },
  })
  // Quem abriu quais fichas (R-003).
  const usuariosAcesso = await db.usuario.findMany({
    where: { login: { in: ['admin', 'dentista1', 'recepcao1'] } },
  })
  for (const [i, u] of usuariosAcesso.entries())
    for (const p of pacs.slice(i, i + 3 + i))
      await db.logAcesso.create({
        data: {
          usuarioId: u.id,
          pessoaId: p.id,
          caminho: `/pacientes/${p.id}/visao-geral`,
          em: noMes(-i),
        },
      })
  console.log('Casos para os relatórios criados.')
}

// ── Configurações da clínica (fictícias) ────────────────────────────────────
const configs: [string, object][] = [
  [
    'clinica',
    {
      nome: 'Clínica Odontológica Fictícia',
      cnpj: '00.000.000/0001-00',
      endereco: 'Rua Fictícia, 100 – Centro',
      cidade: 'Cidade Fictícia',
      telefone: '(11) 3000-0000',
      email: 'contato@example.com',
    },
  ],
]
for (const [chave, valor] of configs)
  if (!(await db.configuracao.findUnique({ where: { chave } })))
    await db.configuracao.create({ data: { chave, valor, alteradoPorId: adminId } })

// ── Prontuário completo de um paciente: anamnese, odontograma, ficha, documentos, fotos ──
const completo = await db.pessoa.findFirstOrThrow({
  where: { tipo: 'PACIENTE', nome: 'Paciente Fictício Completo' },
})
const [dra, dr] = [pessoaDe.dentista1, pessoaDe.dentista2]

if (!(await db.anamnese.count({ where: { pacienteId: completo.id } }))) {
  const responder = (alergia: string | null) =>
    MODELO_ANAMNESE.map((p) => {
      if (p.texto.startsWith('Tem alergia'))
        return { ...p, resposta: alergia ? 'Sim' : 'Não', descricao: alergia }
      if (p.texto.startsWith('Toma algum'))
        return { ...p, resposta: 'Sim', descricao: 'Losartana 50 mg (fictício)' }
      if (p.texto.startsWith('Tem pressão')) return { ...p, resposta: 'Sim', descricao: null }
      if (p.tipo === 'OPCOES') return { ...p, resposta: p.opcoes?.[1] ?? null, descricao: null }
      if (p.tipo === 'DESCRITIVA')
        return { ...p, resposta: 'Dor ao mastigar do lado direito', descricao: null }
      return { ...p, resposta: 'Não', descricao: null }
    })
  // A antiga vai para o histórico; a mais nova é a atual e tem alergia (vira alerta).
  await db.anamnese.create({
    data: {
      pacienteId: completo.id,
      respondente: 'PACIENTE',
      perguntas: responder(null),
      criadoEm: dias(-400),
      criadoPorId: adminId,
    },
  })
  await db.anamnese.create({
    data: {
      pacienteId: completo.id,
      respondente: 'PROFISSIONAL',
      perguntas: responder('Penicilina'),
      observacoes: 'Paciente ansioso; preferir anestesia sem vasoconstritor (fictício).',
      criadoPorId: adminId,
    },
  })

  const resina = await db.procedimento.findFirst({
    where: { nome: 'Restauração em resina (2 faces)' },
  })
  const limpeza = await db.procedimento.findFirst({ where: { nome: 'Limpeza (profilaxia)' } })
  const clinicos = [
    {
      procedimento: resina,
      nome: 'Restauração em resina (2 faces)',
      dente: '16',
      faces: 'MO',
      status: 'EXECUTADO' as const,
      data: dias(-30),
      obs: 'Resina cor A2',
      obsPac: 'Evitar alimentos duros por 24 horas',
    },
    {
      procedimento: limpeza,
      nome: 'Limpeza (profilaxia)',
      dente: null,
      faces: null,
      status: 'EXECUTADO' as const,
      data: dias(-30),
      obs: null,
      obsPac: null,
    },
    {
      procedimento: null,
      nome: 'Restauração antiga em amálgama',
      dente: '26',
      faces: 'O',
      status: 'EXISTENTE' as const,
      data: dias(-400),
      obs: 'Feita em outra clínica',
      obsPac: null,
    },
    {
      procedimento: null,
      nome: 'Coroa metalocerâmica',
      dente: '46',
      faces: null,
      status: 'EXISTENTE' as const,
      data: dias(-400),
      obs: null,
      obsPac: null,
    },
  ]
  for (const c of clinicos)
    await db.procedimentoClinico.create({
      data: {
        pacienteId: completo.id,
        profissionalId: dra,
        procedimentoId: c.procedimento?.id,
        nome: c.nome,
        dente: c.dente,
        faces: c.faces,
        status: c.status,
        data: c.data,
        observacao: c.obs,
        observacaoPaciente: c.obsPac,
        criadoPorId: adminId,
      },
    })

  const docAtestado = preencherModelo(MODELOS_DOCUMENTO.atestado.texto, {
    paciente: completo.nome,
    cpf: completo.cpf?.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'),
    profissional: 'Dra. Fictícia Andrade',
    cro: 'CRO-XX 10001',
    data: dias(-30).toISOString().slice(0, 10).split('-').reverse().join('/'),
    cidade: 'Cidade Fictícia',
    horario: '14:00',
    dias: '1 dia',
  })
  await db.documento.create({
    data: {
      pacienteId: completo.id,
      profissionalId: dra,
      modelo: 'atestado',
      titulo: MODELOS_DOCUMENTO.atestado.titulo,
      texto: docAtestado,
      criadoEm: dias(-30),
      criadoPorId: adminId,
    },
  })

  await db.nota.createMany({
    data: [
      { pacienteId: completo.id, texto: 'Prefere consultas pela manhã.', criadoPorId: adminId },
      {
        pacienteId: completo.id,
        texto: 'Pediu orçamento de clareamento para o próximo mês.',
        criadoPorId: adminId,
      },
    ],
  })

  console.log(`Prontuário completo criado para "${completo.nome}".`)
}

// ── Fotos, exames e documentos em todos os pacientes (as mesmas imagens repetidas) ──
{
  const profissionais = await db.pessoa.findMany({ where: { id: { in: [dra, dr] } } })
  const pacientesTodos = await db.pessoa.findMany({ where: { tipo: 'PACIENTE', excluidoEm: null } })
  let comArquivos = 0
  for (const [n, p] of pacientesTodos.entries()) {
    // Marca pela panorâmica: banco antigo (com as fotos lisas) também recebe as novas.
    if (!(await db.arquivo.count({ where: { pacienteId: p.id, nome: 'panoramica.png' } }))) {
      await db.arquivo.createMany({
        data: IMAGENS_FICTICIAS.map((a, i) => ({
          pacienteId: p.id,
          categoria: a.categoria,
          pasta: a.pasta,
          nome: a.nome,
          tipo: a.nome.endsWith('.pdf') ? 'application/pdf' : 'image/png',
          tamanho: a.dados.length,
          dados: new Uint8Array(a.dados),
          criadoEm: dias(a.pasta === 'Pós-tratamento' ? -10 : -60 + i),
          criadoPorId: adminId,
        })),
      })
      comArquivos++
    }
    if (await db.documento.count({ where: { pacienteId: p.id } })) continue
    const prof = profissionais[n % profissionais.length]
    const valores = (diasAtras: number) => ({
      paciente: p.nome,
      cpf: p.cpf?.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'),
      profissional: prof.nome,
      cro: prof.cro,
      data: dias(-diasAtras).toISOString().slice(0, 10).split('-').reverse().join('/'),
      cidade: 'Cidade Fictícia',
      horario: '09:30',
      dias: '1 dia',
    })
    const docs = [
      ['comparecimento', 45],
      ['atestado', 30],
      ['receita', 30],
    ] as const
    await db.documento.createMany({
      data: docs.map(([modelo, diasAtras]) => ({
        pacienteId: p.id,
        profissionalId: prof.id,
        modelo,
        titulo: MODELOS_DOCUMENTO[modelo].titulo,
        texto: preencherModelo(MODELOS_DOCUMENTO[modelo].texto, valores(diasAtras)).replace(
          '1. ',
          '1. Paracetamol 750 mg - 1 comprimido de 6 em 6 horas, se houver dor (fictício)',
        ),
        criadoEm: dias(-diasAtras),
        criadoPorId: adminId,
      })),
    })
  }
  console.log(`Fotos e exames fictícios criados para ${comArquivos} pacientes.`)
}

// ── Anamnese em 70% dos pacientes; metade delas com alerta (35% do total) ──
{
  const todos = await db.pessoa.findMany({
    where: { tipo: 'PACIENTE', excluidoEm: null },
    orderBy: { id: 'asc' },
  })
  // O paciente completo já tem anamnese com alerta (alergia): entra na conta.
  const outros = todos.filter((p) => p.id !== completo.id)
  const nAnamnese = Math.round(todos.length * 0.7) - 1
  const nAlerta = Math.round(todos.length * 0.35) - 1
  /** Espalha "quantos" escolhidos por "total" posições: true na posição i se ela é escolhida. */
  const espalhar = (i: number, quantos: number, total: number) =>
    Math.floor(((i + 1) * quantos) / total) > Math.floor((i * quantos) / total)
  const ALERTAS = [
    ['Tem alergia', 'Dipirona'],
    ['Toma algum', 'Metformina 850 mg'],
    ['Tem pressão alta', null],
    ['Tem diabetes', 'Tipo 2, controlada'],
    ['Tem problema de coagulação', 'Usa AAS todos os dias'],
    ['Tem problema cardíaco', 'Arritmia'],
    ['Já teve reação', 'Taquicardia com a anestesia'],
  ] as const
  const escolhidos = outros.filter((_, i) => espalhar(i, nAnamnese, outros.length))
  let criadas = 0
  for (const [k, p] of escolhidos.entries()) {
    if (await db.anamnese.count({ where: { pacienteId: p.id } })) continue
    // Um alerta, e às vezes dois, variando entre os pacientes.
    const alertas = espalhar(k, nAlerta, escolhidos.length)
      ? [ALERTAS[k % ALERTAS.length], ...(k % 3 ? [] : [ALERTAS[(k + 3) % ALERTAS.length]])]
      : []
    const perguntas = MODELO_ANAMNESE.map((q) => {
      const alerta = alertas.find(([inicio]) => q.texto.startsWith(inicio))
      if (alerta) return { ...q, resposta: 'Sim', descricao: alerta[1] }
      if (q.tipo === 'OPCOES') return { ...q, resposta: q.opcoes?.[k % 3] ?? null, descricao: null }
      if (q.tipo === 'DESCRITIVA')
        return { ...q, resposta: ['Limpeza', 'Dor de dente', 'Avaliação'][k % 3], descricao: null }
      if (q.texto === 'Fuma?') return { ...q, resposta: k % 4 ? 'Não' : 'Sim', descricao: null }
      return { ...q, resposta: 'Não', descricao: null }
    })
    await db.anamnese.create({
      data: {
        pacienteId: p.id,
        respondente: k % 2 ? 'PROFISSIONAL' : 'PACIENTE',
        perguntas,
        criadoEm: dias(-((k * 17) % 300) - 1),
        criadoPorId: adminId,
      },
    })
    criadas++
  }
  console.log(`Anamneses fictícias criadas: ${criadas} (alvo: 70% com anamnese, 35% com alerta).`)
}

// ── Odontograma em todos os pacientes: o que já tinha, o que foi feito e o que falta ──
{
  const todos = await db.pessoa.findMany({
    where: { tipo: 'PACIENTE', excluidoEm: null },
    orderBy: { id: 'asc' },
  })
  const catalogo = new Map((await db.procedimento.findMany()).map((p) => [p.nome, p.id]))
  const dentistas = Object.values(pessoaDe)
  const MOLARES = ['16', '17', '26', '27', '36', '37', '46', '47']
  const PRE = ['14', '15', '24', '25', '34', '35', '44', '45']
  const ANTERIORES = ['11', '12', '13', '21', '22', '23', '31', '32', '33', '41', '42', '43']
  const SISOS = ['18', '28', '38', '48']
  let criados = 0
  for (const p of todos) {
    // "Consulta de avaliação" sem dente marca que o paciente já recebeu o odontograma do seed.
    if (
      await db.procedimentoClinico.count({
        where: { pacienteId: p.id, nome: 'Consulta de avaliação' },
      })
    )
      continue
    // Sorteio com semente no id: o mesmo paciente sempre recebe o mesmo odontograma.
    let semente = p.id * 9301 + 49297
    const sorte = () => (semente = (semente * 9301 + 49297) % 233280) / 233280
    const um = <T>(lista: readonly T[]) => lista[Math.floor(sorte() * lista.length)]
    const livres = (lista: string[]) => [...lista].sort(() => sorte() - 0.5)
    const [posteriores, anteriores, sisos] = [
      livres([...MOLARES, ...PRE]),
      livres(ANTERIORES),
      livres(SISOS),
    ]
    // Dentes que já têm lançamento (ex.: o paciente completo) ficam de fora.
    const ocupados = new Set(
      (await db.procedimentoClinico.findMany({ where: { pacienteId: p.id } })).flatMap((c) =>
        c.dente ? [c.dente] : [],
      ),
    )
    // Dente da lista que ainda não foi usado neste paciente.
    const dente = (lista: string[]) => lista.find((d) => !ocupados.has(d) && ocupados.add(d))!
    const ehInferior = (d: string) => ['3', '4'].includes(d[0])
    const faces = (d: string, n: 1 | 2) =>
      ANTERIORES.includes(d)
        ? um(n === 1 ? ['V', 'M', 'D', 'I'] : ['MI', 'DI', 'MV'])
        : um(n === 1 ? ['O', 'V', ehInferior(d) ? 'L' : 'P'] : ['MO', 'OD', 'OV'])

    type Item = { nome: string; dente?: string; faces?: string; status: StatusClinico; dia: number }
    const itens: Item[] = [
      { nome: 'Consulta de avaliação', status: 'EXECUTADO', dia: -120 },
      { nome: 'Limpeza (profilaxia)', status: 'EXECUTADO', dia: -120 },
    ]
    // O que o paciente já tinha quando chegou.
    for (let i = 0; i < 2 + Math.floor(sorte() * 3); i++) {
      const d = dente(posteriores)
      const nome = um(['Restauração antiga em amálgama', 'Restauração em resina (2 faces)'])
      itens.push({ nome, dente: d, faces: faces(d, 2), status: 'EXISTENTE', dia: -400 })
    }
    if (sorte() < 0.5)
      itens.push({
        nome: 'Coroa de porcelana',
        dente: dente(posteriores),
        status: 'EXISTENTE',
        dia: -400,
      })
    if (sorte() < 0.4)
      itens.push({
        nome: 'Extração simples',
        dente: dente(MOLARES),
        status: 'EXISTENTE',
        dia: -400,
      })
    if (sorte() < 0.3)
      itens.push({
        nome: 'Tratamento de canal (unirradicular)',
        dente: dente(anteriores),
        status: 'EXISTENTE',
        dia: -400,
      })
    // Feito na clínica.
    for (let i = 0; i < 1 + Math.floor(sorte() * 3); i++) {
      const tipo = um(['resina1', 'resina2', 'canal', 'selante', 'resina-anterior'] as const)
      const d = dente(tipo === 'resina-anterior' ? anteriores : posteriores)
      const dia = -5 - Math.floor(sorte() * 100)
      if (tipo === 'canal') {
        itens.push({
          nome: 'Tratamento de canal (multirradicular)',
          dente: d,
          status: 'EXECUTADO',
          dia,
        })
        itens.push({
          nome: 'Coroa de porcelana',
          dente: d,
          status: sorte() < 0.5 ? 'EXECUTADO' : 'A_REALIZAR',
          dia,
        })
      } else if (tipo === 'selante')
        itens.push({ nome: 'Selante por dente', dente: d, faces: 'O', status: 'EXECUTADO', dia })
      else {
        const n = tipo === 'resina2' ? 2 : 1
        itens.push({
          nome: `Restauração em resina (${n} face${n === 2 ? 's' : ''})`,
          dente: d,
          faces: faces(d, n),
          status: 'EXECUTADO',
          dia,
        })
      }
    }
    if (sorte() < 0.2)
      itens.push({
        nome: 'Implante unitário',
        dente: dente(MOLARES),
        status: 'EXECUTADO',
        dia: -200,
      })
    // O que falta fazer.
    for (let i = 0; i < 1 + Math.floor(sorte() * 3); i++) {
      const tipo = um(['resina', 'canal', 'siso', 'coroa'] as const)
      if (tipo === 'siso') {
        itens.push({ nome: 'Extração de siso', dente: dente(sisos), status: 'A_REALIZAR', dia: 0 })
        continue
      }
      const d = dente(tipo === 'resina' && sorte() < 0.4 ? anteriores : posteriores)
      const nome = {
        resina: 'Restauração em resina (1 face)',
        canal: 'Tratamento de canal (unirradicular)',
        coroa: 'Coroa de porcelana',
      }[tipo]
      itens.push({
        nome,
        dente: d,
        faces: tipo === 'resina' ? faces(d, 1) : undefined,
        status: 'A_REALIZAR',
        dia: 0,
      })
    }

    const profissionalId = um(dentistas)
    await db.procedimentoClinico.createMany({
      data: itens
        .filter((i) => i.dente !== undefined || !i.nome.startsWith('Extração'))
        .map((i) => ({
          pacienteId: p.id,
          profissionalId,
          procedimentoId: catalogo.get(i.nome),
          nome: i.nome,
          dente: i.dente,
          faces: i.faces,
          status: i.status,
          data: dias(i.dia),
          criadoPorId: adminId,
        })),
    })
    // Botões do odontograma: alguns sem os sisos de cima, outros com um dente sem coroa.
    const removidos = sorte() < 0.25 ? ['18', '28'].filter((d) => !ocupados.has(d)) : []
    const semCoroa = sorte() < 0.2 ? [dente(posteriores)].filter(Boolean) : []
    if (
      (removidos.length || semCoroa.length) &&
      !p.dentesRemovidos.length &&
      !p.dentesSemCoroa.length
    )
      await db.pessoa.update({
        where: { id: p.id },
        data: { dentesRemovidos: removidos, dentesSemCoroa: semCoroa },
      })
    criados++
  }
  console.log(`Odontograma fictício criado para ${criados} pacientes.`)
}

// ── Plano e Ficha Clínica do paciente completo: um planejamento em cada situação de
// assinatura (não enviado, aguardando, aprovado, alterado depois) e um pedido avulso esperando.
if (!(await db.autorizacao.count({ where: { pacienteId: completo.id } }))) {
  const nomeDe = async (id: number) => (await db.pessoa.findUniqueOrThrow({ where: { id } })).nome
  const [nomeDra, nomeDr] = [await nomeDe(dra), await nomeDe(dr)]
  const iso = (n: number) => dias(n).toISOString().slice(0, 10)
  const nota = (texto: string, n: number) => ({
    id: randomBytes(4).toString('hex'),
    texto,
    em: dias(n).toISOString(),
    autor: 'Administrador',
  })
  /** Etapas da especialidade com datas (dias a partir de hoje) e as primeiras já feitas. */
  const etapas = (especialidade: string, datas: number[], feitas: number) =>
    etapasDaFicha(especialidade).map((e, i) => ({
      ...e,
      data: datas[i] === undefined ? null : iso(datas[i]),
      executado: i < feitas,
    }))
  type Item = { dente: string; faces?: string; procedimento: string; status: string; data: number }
  const assinado = (n: number) => ({
    assinadoEm: dias(n),
    assinanteNome: completo.nome,
    assinatura: `data:image/png;base64,${pngLiso(120, 40, [30, 41, 59]).toString('base64')}`,
    ip: '127.0.0.1',
    navegador: 'Navegador fictício',
  })

  /** Planejamento com os itens; com "pedido", envia os itens ao paciente (como no sistema). */
  async function planejamento(p: {
    especialidade: string
    profissionalId: number
    profissional: string
    inicio: number
    etapas: ReturnType<typeof etapas>
    notas: ReturnType<typeof nota>[]
    itens: Item[]
    pedido?: { criado: number; assinado?: number; plano: string }
    /** Acrescentados depois do pedido: ficam fora dele (planejamento alterado). */
    depois?: Item[]
  }) {
    // Banco antigo já com esse planejamento: não duplica.
    if (
      await db.fichaEspecialidade.count({
        where: { pacienteId: completo.id, especialidade: p.especialidade, excluidoEm: null },
      })
    )
      return
    const f = await db.fichaEspecialidade.create({
      data: {
        pacienteId: completo.id,
        profissionalId: p.profissionalId,
        especialidade: p.especialidade,
        inicio: dias(p.inicio),
        etapas: p.etapas,
        notas: p.notas,
        criadoEm: dias(p.inicio),
        criadoPorId: adminId,
      },
    })
    const criar = (itens: Item[], autorizacaoId?: number) =>
      db.itemFichaEspecialidade.createMany({
        data: itens.map((i) => ({
          fichaId: f.id,
          dente: i.dente,
          faces: i.faces ?? '',
          procedimento: i.procedimento,
          status: i.status,
          data: dias(i.data),
          autorizacaoId,
        })),
      })
    if (!p.pedido) return criar(p.itens)
    // O documento junta os dentes de cada procedimento e data, como o servidor faz.
    const porProc = new Map<string, { nome: string; data: string; dentes: string[] }>()
    for (const i of p.itens) {
      const k = `${i.procedimento}|${i.data}`
      const it = porProc.get(k) ?? { nome: i.procedimento, data: iso(i.data), dentes: [] }
      it.dentes.push(denteComFaces(i.dente, i.faces ?? ''))
      porProc.set(k, it)
    }
    const a = await db.autorizacao.create({
      data: {
        pacienteId: completo.id,
        fichaId: f.id,
        token: randomBytes(18).toString('base64url'),
        criadoEm: dias(p.pedido.criado),
        criadoPorId: adminId,
        ...(p.pedido.assinado !== undefined && assinado(p.pedido.assinado)),
        conteudo: {
          paciente: completo.nome,
          termo: TERMO,
          plano: p.pedido.plano,
          autor: 'Administrador',
          especialidade: p.especialidade,
          etapas: p.etapas.map((e) => ({ id: e.id, nome: e.nome, data: e.data, comentario: null })),
          itens: [...porProc.values()].map((i) => ({
            ...i,
            dentes: i.dentes.sort(),
            profissional: p.profissional,
            observacaoPaciente: null,
          })),
        },
      },
    })
    await criar(p.itens, a.id)
    if (p.depois) await criar(p.depois)
  }

  // Não enviado: o botão "Enviar para o paciente assinar" aparece.
  await planejamento({
    especialidade: 'Endodontia',
    profissionalId: dr,
    profissional: nomeDr,
    inicio: -6,
    etapas: etapas('Endodontia', [-6, -5, 2, 2, 9, 16, 30], 2),
    notas: [nota('Dor espontânea no 36 (fictício).', -6)],
    itens: [
      { dente: '36', procedimento: 'Tratamento de canal', status: 'Em tratamento', data: 2 },
      {
        dente: '36',
        faces: 'MOD',
        procedimento: 'Restauração em resina (2 faces)',
        status: 'Em avaliação',
        data: 16,
      },
      { dente: '37', procedimento: 'Teste de vitalidade', status: 'Em avaliação', data: 2 },
    ],
  })
  // Aguardando assinatura: aparecem "Enviar por WhatsApp", "Enviar por e-mail" e "Copiar link".
  await planejamento({
    especialidade: 'Ortodontia',
    profissionalId: dra,
    profissional: nomeDra,
    inicio: -3,
    etapas: etapas('Ortodontia', [-3, -2, 4, 7, 14], 2),
    notas: [nota('Paciente prefere braquetes estéticos (fictício).', -3)],
    itens: ['13', '12', '11', '21', '22', '23'].map((dente) => ({
      dente,
      procedimento: 'Aparelho ortodôntico fixo (instalação)',
      status: 'Em avaliação',
      data: 14,
    })),
    pedido: { criado: -1, plano: 'Correção do apinhamento anterior com aparelho fixo.' },
  })
  // Aprovado: o que foi assinado trava; só a situação muda.
  await planejamento({
    especialidade: 'Implantes',
    profissionalId: dr,
    profissional: nomeDr,
    inicio: -60,
    etapas: etapas('Implantes', [-60, -55, -50, -40, 50, 80, 90], 4),
    notas: [nota('Tomografia sem alterações (fictício).', -55)],
    itens: [
      { dente: '45', procedimento: 'Implante unitário', status: 'Executado', data: -40 },
      { dente: '45', procedimento: 'Coroa sobre implante', status: 'Em tratamento', data: 80 },
    ],
    pedido: { criado: -52, assinado: -50, plano: 'Reabilitar o 45 com implante e coroa.' },
  })
  // Alterado depois de assinar: há procedimento novo fora do pedido; dá para enviar de novo.
  await planejamento({
    especialidade: 'Periodontia',
    profissionalId: dra,
    profissional: nomeDra,
    inicio: -30,
    etapas: etapas('Periodontia', [-30, -28, -25, -20, 10, 40, 60], 4),
    notas: [nota('Sangramento à sondagem nos inferiores (fictício).', -30)],
    itens: ['31', '32', '41', '42'].map((dente) => ({
      dente,
      procedimento: 'Raspagem e alisamento radicular',
      status: 'Executado',
      data: -20,
    })),
    pedido: { criado: -26, assinado: -25, plano: 'Tratamento periodontal dos inferiores.' },
    depois: ['16', '17'].map((dente) => ({
      dente,
      procedimento: 'Raspagem e alisamento radicular',
      status: 'Em avaliação',
      data: 10,
    })),
  })

  // Aprovação de procedimentos (avulsos): um a realizar esperando a assinatura.
  const resina = await db.procedimento.findFirst({
    where: { nome: 'Restauração em resina (2 faces)' },
  })
  const a = await db.autorizacao.create({
    data: {
      pacienteId: completo.id,
      token: randomBytes(18).toString('base64url'),
      criadoEm: dias(-2),
      criadoPorId: adminId,
      conteudo: {
        paciente: completo.nome,
        termo: TERMO,
        plano: null,
        autor: 'Administrador',
        itens: [
          {
            nome: 'Restauração em resina (2 faces)',
            profissional: nomeDra,
            dentes: ['25DO'],
            observacaoPaciente: 'Anestesia local; cerca de 40 minutos.',
          },
        ],
      },
    },
  })
  await db.procedimentoClinico.create({
    data: {
      pacienteId: completo.id,
      profissionalId: dra,
      procedimentoId: resina?.id,
      nome: 'Restauração em resina (2 faces)',
      dente: '25',
      faces: 'DO',
      status: 'A_REALIZAR',
      data: dias(-2),
      observacaoPaciente: 'Anestesia local; cerca de 40 minutos.',
      autorizacaoId: a.id,
      criadoPorId: adminId,
    },
  })
  console.log(`Planejamentos e pedidos de assinatura criados para "${completo.nome}".`)
}

// ── Controle Protético: um trabalho em cada coluna, um deles atrasado ───────
if (!(await db.trabalhoProtetico.count())) {
  const pacs = await db.pessoa.findMany({
    where: { tipo: 'PACIENTE', ativo: true, excluidoEm: null },
    orderBy: { id: 'asc' },
    skip: 5,
    take: 5,
  })
  const trabalhos = [
    {
      etapa: 'PRE_ENVIO',
      trabalho: 'Coroa em porcelana',
      dentes: '11',
      cor: 'A2',
      prazo: dias(15),
    },
    {
      etapa: 'EM_LABORATORIO',
      trabalho: 'Prótese parcial removível',
      dentes: 'Arcada superior',
      cor: 'A3',
      prazo: dias(-2),
      enviadoEm: dias(-12),
    },
    {
      etapa: 'AGENDAMENTO',
      trabalho: 'Placa de bruxismo',
      dentes: null,
      cor: null,
      prazo: dias(3),
      enviadoEm: dias(-10),
      retornoEm: dias(-1),
    },
    {
      etapa: 'AGENDAMENTO',
      trabalho: 'Faceta em resina',
      dentes: '21, 22',
      cor: 'BL2',
      prazo: dias(1),
      enviadoEm: dias(-15),
      retornoEm: dias(-3),
    },
    {
      etapa: 'INSTALADO',
      trabalho: 'Coroa metalocerâmica',
      dentes: '46',
      cor: 'A3',
      prazo: dias(-20),
      enviadoEm: dias(-35),
      retornoEm: dias(-22),
      instaladoEm: dias(-18),
    },
  ] as const
  for (const [i, t] of trabalhos.entries())
    await db.trabalhoProtetico.create({
      data: {
        ...t,
        pacienteId: pacs[i].id,
        profissionalId: Object.values(pessoaDe)[i % 3],
        laboratorio: i % 2 ? 'Laboratório Fictício Sul' : 'Laboratório Fictício',
        valorCentavos: 30000 + i * 7500,
        criadoPorId: adminId,
      },
    })
  console.log('Trabalhos protéticos criados.')
}

// ── Confirmações: consultas já confirmadas e e-mails enviados (e um que falhou) ──
if (!(await db.mensagem.count())) {
  const futuras = await db.agendamento.findMany({
    where: {
      tipo: 'CONSULTA',
      excluidoEm: null,
      desmarcadoEm: null,
      data: { gte: hoje },
      paciente: { email: { not: null } },
    },
    include: { paciente: true },
    orderBy: [{ data: 'asc' }, { inicio: 'asc' }],
    take: 4,
  })
  for (const [i, a] of futuras.entries()) {
    const falhou = i === 3
    await db.mensagem.create({
      data: {
        agendamentoId: a.id,
        canal: 'EMAIL',
        tipo: 'CONFIRMACAO',
        destino: a.paciente!.email!,
        assunto: 'Confirme sua consulta – Clínica Odontológica Fictícia',
        status: falhou ? 'FALHOU' : 'ENVIADA',
        erro: falhou ? 'Caixa de e-mail do paciente cheia (fictício).' : null,
        enviadoPorId: adminId,
      },
    })
    // Dois confirmaram: um pelo link, outro por telefone com a recepção.
    if (i < 2)
      await db.agendamento.update({
        where: { id: a.id },
        data: {
          status: a.status === 'AGENDADO' ? 'CONFIRMADO' : a.status,
          confirmadoEm: new Date(),
          confirmadoPor: i === 0 ? 'Paciente' : 'Recepção Fictícia Um',
        },
      })
  }
  console.log('Confirmações e e-mails fictícios criados.')
}

console.log('Usuários (todos com a senha SEED_SENHA_ADMIN do server/.env):')
console.table(
  usuarios.map((u) => ({
    login: u.login,
    email: `${u.login}@example.com`,
    perfis: u.perfis.join(' + '),
    ativo: u.ativo ?? true,
  })),
)
await db.$disconnect()
