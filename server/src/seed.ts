// Dados de desenvolvimento, todos FICTÍCIOS. Nunca coloque dados reais de pacientes aqui.
// Pode rodar várias vezes: atualiza os usuários e só cria o que ainda não existe.
import { db } from './db'
import { gerarHash } from './auth'
import { normalizar } from '../../shared/regras'
import type { MotivoInativacao, Perfil, Prisma } from './generated/prisma/client'

if (process.env.NODE_ENV === 'production') throw new Error('O seed não roda em produção.')
const senha = process.env.SEED_SENHA
if (!senha) throw new Error('Defina SEED_SENHA em server/.env')
const senhaHash = await gerarHash(senha)

const data = (iso: string) => new Date(`${iso}T00:00:00Z`)

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

console.log('Usuários (todos com a senha SEED_SENHA do server/.env):')
console.table(usuarios.map((u) => ({ login: u.login, perfis: u.perfis.join(' + ') })))
await db.$disconnect()
