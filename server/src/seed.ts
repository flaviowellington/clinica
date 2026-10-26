// Dados de desenvolvimento, todos FICTÍCIOS. Nunca coloque dados reais de pacientes aqui.
// Pode rodar várias vezes: atualiza os usuários e só cria o que ainda não existe.
import { db } from './db'
import { gerarHash } from './auth'
import { deflateSync, crc32 } from 'node:zlib'
import { normalizar } from '../../shared/regras'
import { MODELO_ANAMNESE, MODELOS_DOCUMENTO, preencherModelo } from '../../shared/prontuario'
import type { MotivoInativacao, Perfil, Prisma } from './generated/prisma/client'

if (process.env.NODE_ENV === 'production') throw new Error('O seed não roda em produção.')
const senha = process.env.SEED_SENHA
if (!senha) throw new Error('Defina SEED_SENHA em server/.env')
const senhaHash = await gerarHash(senha)

const data = (iso: string) => new Date(`${iso}T00:00:00Z`)

/** PNG de uma cor só, para as fotos fictícias (sem precisar de arquivo de imagem). */
function pngLiso(largura: number, altura: number, [r, g, b]: readonly number[]) {
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
  const linha = Buffer.from([0, ...Array.from({ length: largura }, () => [r, g, b]).flat()])
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pedaco('IHDR', cab),
    pedaco('IDAT', deflateSync(Buffer.concat(Array(altura).fill(linha)))),
    pedaco('IEND', Buffer.alloc(0)),
  ])
}

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

// ── Usuários: um por perfil, e um com dois perfis (a permissão soma) ────────
const usuarios: { login: string; nome: string; perfis: Perfil[]; pessoaId?: number }[] = [
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
]
for (const u of usuarios) {
  await db.usuario.upsert({
    where: { login: u.login },
    update: { nome: u.nome, perfis: u.perfis, pessoaId: u.pessoaId, senhaHash, ativo: true },
    create: { ...u, senhaHash },
  })
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

// ── Agenda: consultas fictícias a partir de hoje (só se a agenda estiver vazia) ──
let consultas = 0
if (!(await db.agendamento.count())) {
  const ativos = await db.pessoa.findMany({
    where: { tipo: 'PACIENTE', ativo: true, excluidoEm: null },
    take: 12,
    orderBy: { id: 'asc' },
  })
  const dentistas = Object.values(pessoaDe)
  const horarios = ['08:30', '09:00', '10:15', '11:00', '14:00', '15:30', '16:45', '18:00']
  const categorias = ['Avaliação', 'Consulta', 'Retorno', 'Cirurgia', null]
  const hoje = new Date()
  hoje.setUTCHours(0, 0, 0, 0)
  const diaUtil = (d: Date) => (d.getUTCDay() === 0 ? new Date(d.getTime() + 86_400_000) : d)
  const hora = (min: number) =>
    `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
  for (let i = 0; i < ativos.length; i++) {
    const inicio = horarios[i % horarios.length]
    const [h, m] = inicio.split(':').map(Number)
    const espera = i === 0 // um paciente já chegou (check-in)
    await db.agendamento.create({
      data: {
        data: diaUtil(new Date(hoje.getTime() + (i % 4) * 86_400_000)),
        inicio,
        fim: hora(h * 60 + m + (i % 3 === 0 ? 30 : 15)),
        profissionalId: dentistas[i % dentistas.length],
        pacienteId: ativos[i].id,
        categoria: categorias[i % categorias.length],
        status: espera ? 'EM_ESPERA' : i % 5 === 1 ? 'CONFIRMADO' : 'AGENDADO',
        checkinEm: espera ? new Date() : null,
        esperaInicio: espera ? new Date() : null,
        criadoPorId: adminId,
      },
    })
    consultas++
  }
  await db.agendamento.create({
    data: {
      tipo: 'COMPROMISSO',
      titulo: 'Reunião da equipe',
      data: diaUtil(hoje),
      inicio: '12:00',
      fim: '13:00',
      profissionalId: dentistas[0],
      criadoPorId: adminId,
    },
  })
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
  const hoje = new Date()
  hoje.setUTCHours(0, 0, 0, 0)
  for (let i = 0; i < alguns.length; i++) {
    const data = new Date(hoje.getTime() - i * 86_400_000)
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

// ── Tabela de procedimentos (valores fictícios) ──────────────────────────────
if (!(await db.procedimento.count())) {
  const tabela: [string, string, number][] = [
    ['Consulta de avaliação', 'Clínica geral', 15000],
    ['Limpeza (profilaxia)', 'Periodontia', 18000],
    ['Raspagem por quadrante', 'Periodontia', 22000],
    ['Restauração em resina (1 face)', 'Dentística', 25000],
    ['Restauração em resina (2 faces)', 'Dentística', 32000],
    ['Clareamento em consultório', 'Dentística', 90000],
    ['Tratamento de canal (unirradicular)', 'Endodontia', 85000],
    ['Tratamento de canal (multirradicular)', 'Endodontia', 130000],
    ['Extração simples', 'Cirurgia bucomaxilofacial', 25000],
    ['Extração de siso', 'Cirurgia bucomaxilofacial', 60000],
    ['Coroa de porcelana', 'Prótese', 180000],
    ['Implante unitário', 'Implantodontia', 350000],
    ['Aparelho ortodôntico fixo (instalação)', 'Ortodontia', 120000],
    ['Manutenção ortodôntica mensal', 'Ortodontia', 25000],
    ['Aplicação de flúor', 'Odontopediatria', 8000],
    ['Selante por dente', 'Odontopediatria', 9000],
  ]
  await db.procedimento.createMany({
    data: tabela.map(([nome, especialidade, valorCentavos]) => ({
      nome,
      nomeBusca: normalizar(nome),
      especialidade,
      valorCentavos,
    })),
  })
  console.log('Tabela de procedimentos criada.')
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
  const hoje = new Date()
  hoje.setUTCHours(0, 0, 0, 0)
  const dias = (n: number) => new Date(hoje.getTime() + n * 86_400_000)
  const item = (p: (typeof procs)[number], dente: string | null = null) => ({
    procedimentoId: p.id,
    nome: p.nome,
    dente,
    valorCentavos: p.valorCentavos,
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

  // Reprovado.
  await db.orcamento.create({
    data: {
      pacienteId: pacs[2].id,
      profissionalId: dentistas[2],
      criadoPorId: adminId,
      status: 'REPROVADO',
      motivoReprovacao: 'Paciente vai pensar',
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

// ── Casos para os relatórios: faltas, atendidas, primeira consulta, desmarcações,
// retornos, parcela atrasada e acessos a fichas, todos dentro do mês atual ──
if (!(await db.agendamento.count({ where: { status: 'FALTOU' } }))) {
  const hoje = new Date()
  hoje.setUTCHours(0, 0, 0, 0)
  const primeiro = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1)
  const ultimo = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 0)
  /** Hoje + n dias, sem sair do mês atual e sem cair no domingo. */
  const noMes = (n: number) => {
    let t = Math.min(ultimo, Math.max(primeiro, hoje.getTime() + n * 86_400_000))
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
  [
    'medicamentos',
    [
      { nome: 'Amoxicilina 500 mg', posologia: '1 cápsula de 8 em 8 horas por 7 dias' },
      {
        nome: 'Ibuprofeno 600 mg',
        posologia: '1 comprimido de 8 em 8 horas por 3 dias, após as refeições',
      },
      { nome: 'Dipirona 500 mg', posologia: '1 comprimido de 6 em 6 horas, se houver dor' },
      {
        nome: 'Clorexidina 0,12%',
        posologia: 'Bochechar 15 ml por 1 minuto, 2 vezes ao dia, por 7 dias',
      },
    ],
  ],
]
for (const [chave, valor] of configs)
  if (!(await db.configuracao.findUnique({ where: { chave } })))
    await db.configuracao.create({ data: { chave, valor, alteradoPorId: adminId } })

// Usuário inativo (saiu da clínica): aparece na tela de Usuários, mas não entra.
await db.usuario.upsert({
  where: { login: 'ex.recepcao' },
  update: {},
  create: {
    login: 'ex.recepcao',
    nome: 'Ex-Recepção Fictícia',
    perfis: ['RECEPCAO'],
    senhaHash,
    ativo: false,
  },
})

// ── Prontuário completo de um paciente: anamnese, odontograma, ficha, documentos, fotos ──
const hojeSeed = new Date()
hojeSeed.setUTCHours(0, 0, 0, 0)
const diasAtras = (n: number) => new Date(hojeSeed.getTime() - n * 86_400_000)
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
      criadoEm: diasAtras(400),
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
      data: diasAtras(30),
      obs: 'Resina cor A2',
      obsPac: 'Evitar alimentos duros por 24 horas',
    },
    {
      procedimento: limpeza,
      nome: 'Limpeza (profilaxia)',
      dente: null,
      faces: null,
      status: 'EXECUTADO' as const,
      data: diasAtras(30),
      obs: null,
      obsPac: null,
    },
    {
      procedimento: null,
      nome: 'Restauração antiga em amálgama',
      dente: '26',
      faces: 'O',
      status: 'EXISTENTE' as const,
      data: diasAtras(400),
      obs: 'Feita em outra clínica',
      obsPac: null,
    },
    {
      procedimento: null,
      nome: 'Coroa metalocerâmica',
      dente: '46',
      faces: null,
      status: 'EXISTENTE' as const,
      data: diasAtras(400),
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

  await db.fichaEspecialidade.create({
    data: {
      pacienteId: completo.id,
      profissionalId: dr,
      especialidade: 'Endodontia',
      observacoes: 'Dor espontânea no 36 (fictício).',
      criadoPorId: adminId,
      itens: {
        create: [
          { dente: '36', procedimento: 'Tratamento de canal', status: 'Em tratamento' },
          { dente: '37', procedimento: 'Teste de vitalidade', status: 'Em avaliação' },
        ],
      },
    },
  })

  const docAtestado = preencherModelo(MODELOS_DOCUMENTO.atestado.texto, {
    paciente: completo.nome,
    cpf: completo.cpf?.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'),
    profissional: 'Dra. Fictícia Andrade',
    cro: 'CRO-XX 10001',
    data: diasAtras(30).toISOString().slice(0, 10).split('-').reverse().join('/'),
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
      criadoEm: diasAtras(30),
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

  // Fotos (imagens geradas aqui, de cor lisa) e um exame em PDF, todos fictícios.
  for (const [nome, cor, pasta] of [
    ['frontal-inicial.png', [15, 118, 110], 'Inicial'],
    ['oclusal-inicial.png', [56, 189, 248], 'Inicial'],
    ['frontal-final.png', [234, 179, 8], 'Pós-tratamento'],
  ] as const) {
    const dados = pngLiso(160, 110, cor)
    await db.arquivo.create({
      data: {
        pacienteId: completo.id,
        categoria: 'FOTO',
        pasta,
        nome,
        tipo: 'image/png',
        tamanho: dados.length,
        dados: new Uint8Array(dados),
        criadoPorId: adminId,
      },
    })
  }
  const pdf = Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
      '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF',
  )
  await db.arquivo.create({
    data: {
      pacienteId: completo.id,
      categoria: 'EXAME',
      nome: 'radiografia-panoramica-ficticia.pdf',
      tipo: 'application/pdf',
      tamanho: pdf.length,
      dados: new Uint8Array(pdf),
      criadoPorId: adminId,
    },
  })
  console.log(`Prontuário completo criado para "${completo.nome}".`)
}

// ── Caixa: um caixa fechado ontem, com os recebimentos dele e uma diferença ──
if (!(await db.caixa.count())) {
  const recepcao = await db.usuario.findUniqueOrThrow({ where: { login: 'recepcao1' } })
  const ontem = diasAtras(1)
  const caixa = await db.caixa.create({
    data: {
      abertoEm: new Date(ontem.getTime() + 11 * 3_600_000),
      abertoPorId: recepcao.id,
      saldoInicialCentavos: 10000,
      fechadoEm: new Date(ontem.getTime() + 21 * 3_600_000),
      fechadoPorId: recepcao.id,
      conferencia: {
        Dinheiro: { esperado: 25000, contado: 24500 },
        Pix: { esperado: 30000, contado: 30000 },
      },
      observacoes: 'Faltaram R$ 5,00 no troco (fictício).',
    },
  })
  const pacs = await db.pessoa.findMany({
    where: { tipo: 'PACIENTE', ativo: true, excluidoEm: null },
    orderBy: { id: 'asc' },
    skip: 3,
    take: 2,
  })
  for (const [i, [valor, forma]] of (
    [
      [15000, 'Dinheiro'],
      [30000, 'Pix'],
    ] as const
  ).entries())
    await db.lancamento.create({
      data: {
        data: ontem,
        tipo: 'ENTRADA',
        valorCentavos: valor,
        descricao: 'Recebimento no balcão',
        forma,
        categoria: 'Receita de tratamentos',
        pacienteId: pacs[i].id,
        caixaId: caixa.id,
        criadoPorId: recepcao.id,
      },
    })
  console.log('Caixa fechado de ontem criado.')
}

// ── Controle Protético: um trabalho em cada coluna, um deles atrasado ───────
if (!(await db.trabalhoProtetico.count())) {
  const pacs = await db.pessoa.findMany({
    where: { tipo: 'PACIENTE', ativo: true, excluidoEm: null },
    orderBy: { id: 'asc' },
    skip: 5,
    take: 5,
  })
  const emDias = (n: number) => new Date(hojeSeed.getTime() + n * 86_400_000)
  const trabalhos = [
    {
      etapa: 'PRE_ENVIO',
      trabalho: 'Coroa em porcelana',
      dentes: '11',
      cor: 'A2',
      prazo: emDias(15),
    },
    {
      etapa: 'EM_LABORATORIO',
      trabalho: 'Prótese parcial removível',
      dentes: 'Arcada superior',
      cor: 'A3',
      prazo: emDias(-2),
      enviadoEm: emDias(-12),
    },
    {
      etapa: 'RETORNO',
      trabalho: 'Placa de bruxismo',
      dentes: null,
      cor: null,
      prazo: emDias(3),
      enviadoEm: emDias(-10),
      retornoEm: emDias(-1),
    },
    {
      etapa: 'AGENDAMENTO',
      trabalho: 'Faceta em resina',
      dentes: '21, 22',
      cor: 'BL2',
      prazo: emDias(1),
      enviadoEm: emDias(-15),
      retornoEm: emDias(-3),
    },
    {
      etapa: 'INSTALADO',
      trabalho: 'Coroa metalocerâmica',
      dentes: '46',
      cor: 'A3',
      prazo: emDias(-20),
      enviadoEm: emDias(-35),
      retornoEm: emDias(-22),
      instaladoEm: emDias(-18),
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
      data: { gte: hojeSeed },
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

console.log('Usuários (todos com a senha SEED_SENHA do server/.env):')
console.table(usuarios.map((u) => ({ login: u.login, perfis: u.perfis.join(' + ') })))
await db.$disconnect()
