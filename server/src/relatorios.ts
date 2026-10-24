// Mais relatórios: agenda por profissional, status e ocupação; pacientes; contas; tratamentos.
import { db } from './db'
import { HORARIOS, STATUS } from '../../shared/agenda'
import { TIPOS_LANCAMENTO, grupoDe } from '../../shared/financeiro'
import { PERFIS } from '../../shared/permissoes'

type Linhas = (string | number)[][]
type Gerador = (p: { gte: Date; lte: Date }) => Promise<{ colunas: string[]; linhas: Linhas }>

const DIA_MS = 86_400_000
const isoDe = (d: Date) => d.toISOString().slice(0, 10)
const dataBR = (d: Date) => isoDe(d).split('-').reverse().join('/')
const reais = (c: number) =>
  (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '0%')
const instantes = (p: { gte: Date; lte: Date }) => ({
  gte: p.gte,
  lt: new Date(p.lte.getTime() + DIA_MS),
})

/** Agrupa e soma: devolve [chave, contagem, soma] ordenado pela soma. */
function agrupar<T>(itens: T[], chave: (i: T) => string, valor: (i: T) => number = () => 0) {
  const m = new Map<string, { n: number; soma: number }>()
  for (const i of itens) {
    const k = chave(i)
    const g = m.get(k) ?? { n: 0, soma: 0 }
    g.n++
    g.soma += valor(i)
    m.set(k, g)
  }
  return [...m].sort((a, b) => b[1].soma - a[1].soma || b[1].n - a[1].n || a[0].localeCompare(b[0]))
}

const consultas = (data: { gte: Date; lte: Date }) =>
  db.agendamento.findMany({
    where: { excluidoEm: null, desmarcadoEm: null, tipo: 'CONSULTA', data },
    include: { profissional: true },
  })

export const GERADORES_EXTRA: Record<string, Gerador> = {
  'agenda-profissional': async (data) => {
    const l = await consultas(data)
    const m = new Map<string, { total: number; atendidas: number; faltas: number }>()
    for (const a of l) {
      const g = m.get(a.profissional.nome) ?? { total: 0, atendidas: 0, faltas: 0 }
      g.total++
      if (a.status === 'ATENDIDO') g.atendidas++
      if (a.status === 'FALTOU') g.faltas++
      m.set(a.profissional.nome, g)
    }
    return {
      colunas: ['Profissional', 'Consultas', 'Atendidas', 'Faltas', 'Taxa de faltas'],
      linhas: [...m]
        .sort((a, b) => b[1].total - a[1].total)
        .map(([nome, g]) => [nome, g.total, g.atendidas, g.faltas, pct(g.faltas, g.total)]),
    }
  },
  'agenda-status': async (data) => {
    const l = await consultas(data)
    return {
      colunas: ['Status', 'Consultas', '% do total'],
      linhas: agrupar(l, (a) => STATUS[a.status].rotulo).map(([k, g]) => [
        k,
        g.n,
        pct(g.n, l.length),
      ]),
    }
  },
  // Ocupação: horários de 15 min usados ÷ horários disponíveis (48 por profissional por dia aberto).
  'agenda-ocupacao': async (data) => {
    const l = await db.agendamento.findMany({
      where: { excluidoEm: null, desmarcadoEm: null, data },
      include: { profissional: true },
    })
    const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3))
    const m = new Map<string, { usados: number; dias: Set<string> }>()
    for (const a of l) {
      const g = m.get(a.profissional.nome) ?? { usados: 0, dias: new Set() }
      g.usados += Math.max(1, (minutos(a.fim) - minutos(a.inicio)) / 15)
      g.dias.add(isoDe(a.data))
      m.set(a.profissional.nome, g)
    }
    return {
      colunas: [
        'Profissional',
        'Dias com agenda',
        'Horários usados',
        'Horários livres',
        'Ocupação',
      ],
      linhas: [...m].map(([nome, g]) => {
        const total = g.dias.size * HORARIOS.length
        return [nome, g.dias.size, g.usados, total - g.usados, pct(g.usados, total)]
      }),
    }
  },
  'pacientes-novos': async (data) => {
    const l = await db.pessoa.findMany({
      where: { tipo: 'PACIENTE', excluidoEm: null, criadoEm: instantes(data) },
      orderBy: { criadoEm: 'asc' },
    })
    return {
      colunas: ['Cadastrado em', 'Paciente', 'Celular', 'Como conheceu'],
      linhas: l.map((p) => [dataBR(p.criadoEm), p.nome, p.celular ?? '', p.comoConheceu ?? '']),
    }
  },
  'pacientes-indicacoes': async () => {
    const l = await db.pessoa.findMany({
      where: {
        tipo: 'PACIENTE',
        excluidoEm: null,
        OR: [{ comoConheceu: 'Indicado por' }, { indicadoPor: { not: null } }],
      },
      orderBy: { nomeBusca: 'asc' },
    })
    return {
      colunas: ['Paciente', 'Indicado por', 'Cadastrado em'],
      linhas: l.map((p) => [p.nome, p.indicadoPor ?? 'Não informado', dataBR(p.criadoEm)]),
    }
  },
  // Cobrança: parcelas vencidas até o fim do período e ainda em aberto.
  'pacientes-inadimplentes': async ({ lte }) => {
    const l = await db.contaFinanceira.findMany({
      where: {
        tipo: 'RECEBER',
        status: 'ABERTA',
        vencimento: { lt: new Date(Math.min(lte.getTime() + DIA_MS, Date.now())) },
      },
      include: { paciente: true },
      orderBy: { vencimento: 'asc' },
    })
    const hoje = Date.now()
    return {
      colunas: ['Paciente', 'Descrição', 'Vencimento', 'Dias em atraso', 'Valor (R$)'],
      linhas: l.map((c) => [
        c.paciente?.nome ?? 'Sem paciente',
        c.descricao,
        dataBR(c.vencimento),
        Math.floor((hoje - c.vencimento.getTime()) / DIA_MS),
        reais(c.valorCentavos),
      ]),
    }
  },
  'financeiro-pagar': async (data) => {
    const l = await db.contaFinanceira.findMany({
      where: { tipo: 'PAGAR', vencimento: data },
      orderBy: { vencimento: 'asc' },
    })
    return {
      colunas: ['Vencimento', 'Descrição', 'Fornecedor', 'Conta', 'Situação', 'Valor (R$)'],
      linhas: l.map((c) => [
        dataBR(c.vencimento),
        c.descricao,
        c.detalhes ?? '',
        c.categoria ?? '',
        c.status === 'PAGA'
          ? `Paga em ${dataBR(c.pagoEm!)}`
          : c.status === 'CANCELADA'
            ? 'Cancelada'
            : 'Em aberto',
        reais(c.valorCentavos),
      ]),
    }
  },
  'financeiro-receber': async (data) => {
    const l = await db.contaFinanceira.findMany({
      where: { tipo: 'RECEBER', vencimento: data },
      include: { paciente: true },
      orderBy: { vencimento: 'asc' },
    })
    return {
      colunas: ['Vencimento', 'Descrição', 'Paciente', 'Forma', 'Situação', 'Valor (R$)'],
      linhas: l.map((c) => [
        dataBR(c.vencimento),
        c.descricao,
        c.paciente?.nome ?? '',
        c.forma ?? '',
        c.status === 'PAGA'
          ? `Recebida em ${dataBR(c.pagoEm!)}`
          : c.status === 'CANCELADA'
            ? 'Cancelada'
            : 'Em aberto',
        reais(c.valorCentavos),
      ]),
    }
  },
  'financeiro-lancamentos': async (data) => {
    const l = await db.lancamento.findMany({
      where: { excluidoEm: null, data },
      include: { paciente: true, criadoPor: true },
      orderBy: [{ data: 'asc' }, { id: 'asc' }],
    })
    return {
      colunas: ['Data', 'Tipo', 'Descrição', 'Paciente', 'Forma', 'Lançado por', 'Valor (R$)'],
      linhas: l.map((x) => [
        dataBR(x.data),
        TIPOS_LANCAMENTO[x.tipo],
        x.descricao,
        x.paciente?.nome ?? '',
        x.forma ?? '',
        x.criadoPor.nome,
        reais(x.valorCentavos),
      ]),
    }
  },
  'financeiro-categorias': async (data) => {
    const l = await db.lancamento.findMany({ where: { excluidoEm: null, data, tipo: 'SAIDA' } })
    return {
      colunas: ['Conta', 'Grupo', 'Saídas', 'Total (R$)'],
      linhas: agrupar(
        l,
        (x) => x.categoria ?? 'Sem conta',
        (x) => x.valorCentavos,
      ).map(([k, g]) => [k, grupoDe(k) ?? 'Despesas operacionais', g.n, reais(g.soma)]),
    }
  },
  'geral-usuarios': async () => {
    const l = await db.usuario.findMany({ orderBy: { nome: 'asc' } })
    return {
      colunas: ['Usuário', 'Login', 'Perfis', 'Situação', 'Criado em'],
      linhas: l.map((u) => [
        u.nome,
        u.login,
        u.perfis.map((p) => PERFIS[p]).join(' + '),
        u.ativo ? 'Ativo' : 'Inativo',
        dataBR(u.criadoEm),
      ]),
    }
  },
  'tratamentos-faturamento': async (data) => {
    const l = await db.orcamento.findMany({
      where: { status: { in: ['APROVADO', 'CANCELADO'] }, aprovadoEm: instantes(data) },
      include: { profissional: true, itens: true },
    })
    const total = (o: (typeof l)[number]) =>
      Math.max(0, o.itens.reduce((s, i) => s + i.valorCentavos, 0) - o.descontoCentavos)
    const m = new Map<string, { aprovados: number; cancelados: number; valor: number }>()
    for (const o of l) {
      const g = m.get(o.profissional.nome) ?? { aprovados: 0, cancelados: 0, valor: 0 }
      if (o.status === 'APROVADO') {
        g.aprovados++
        g.valor += total(o)
      } else g.cancelados++
      m.set(o.profissional.nome, g)
    }
    return {
      colunas: ['Profissional', 'Orçamentos aprovados', 'Cancelados depois', 'Faturado (R$)'],
      linhas: [...m]
        .sort((a, b) => b[1].valor - a[1].valor)
        .map(([n, g]) => [n, g.aprovados, g.cancelados, reais(g.valor)]),
    }
  },
  'tratamentos-procedimentos': async (data) => {
    const l = await db.itemOrcamento.findMany({
      where: { orcamento: { criadoEm: instantes(data) } },
      include: { orcamento: true },
    })
    const m = new Map<string, { orcados: number; aprovados: number; valor: number }>()
    for (const i of l) {
      const g = m.get(i.nome) ?? { orcados: 0, aprovados: 0, valor: 0 }
      g.orcados++
      if (i.orcamento.status === 'APROVADO') {
        g.aprovados++
        g.valor += i.valorCentavos
      }
      m.set(i.nome, g)
    }
    return {
      colunas: ['Procedimento', 'Vezes orçado', 'Vezes aprovado', 'Conversão', 'Aprovado (R$)'],
      linhas: [...m]
        .sort((a, b) => b[1].orcados - a[1].orcados || a[0].localeCompare(b[0]))
        .map(([n, g]) => [n, g.orcados, g.aprovados, pct(g.aprovados, g.orcados), reais(g.valor)]),
    }
  },
}
