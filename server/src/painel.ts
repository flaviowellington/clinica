// Dashboard Analítico (R-088): os indicadores de gestão de um período, numa chamada só.
import { Router } from 'express'
import { db } from './db'
import { exigir } from './auth'
import { periodo } from './financeiro'
import { HORARIOS, INTERVALO, paraMinutos } from '../../shared/agenda'
import { hojeNaClinica } from '../../shared/regras'

const DIA_MS = 86_400_000
const isoDe = (d: Date) => d.toISOString().slice(0, 10)
const dia = (iso: string) => new Date(`${iso}T00:00:00Z`)
type Data = { gte: Date; lte: Date }

/** Conta e soma por chave, do maior para o menor. */
function somarPor<T>(itens: T[], chave: (i: T) => string, valor: (i: T) => number = () => 1) {
  const m = new Map<string, number>()
  for (const i of itens) m.set(chave(i), (m.get(chave(i)) ?? 0) + valor(i))
  return [...m].map(([rotulo, v]) => ({ rotulo, valor: v })).sort((a, b) => b.valor - a.valor)
}
type OrcValor = { descontoCentavos: number; itens: { valorCentavos: number }[] }
const totalOrc = (o: OrcValor) =>
  o.itens.reduce((t, i) => t + i.valorCentavos, 0) - o.descontoCentavos
/** Os itens com o desconto do orçamento dividido na proporção do valor (como nos Gráficos). */
function itensLiquidos<I extends { valorCentavos: number }>(o: {
  descontoCentavos: number
  itens: I[]
}) {
  const bruto = o.itens.reduce((t, i) => t + i.valorCentavos, 0)
  const fator = bruto ? totalOrc(o) / bruto : 0
  return o.itens.map((i) => ({ ...i, liquido: Math.round(i.valorCentavos * fator) }))
}
/** Janela larga em UTC; o dia da aprovação sai do fuso da clínica (como no Financeiro). */
const janelaLarga = (data: Data) => ({
  gte: new Date(data.gte.getTime() - DIA_MS),
  lt: new Date(data.lte.getTime() + 2 * DIA_MS),
})
const noPeriodo = (iso: string, data: Data) => iso >= isoDe(data.gte) && iso <= isoDe(data.lte)

/** Os números dos cartões: calculados também no período anterior, para comparar. */
async function resumo(data: Data) {
  const instantes = { gte: data.gte, lt: new Date(data.lte.getTime() + DIA_MS) }
  const [consultas, desmarcadas, entradas, criados, aprovadosUtc, novos] = await Promise.all([
    db.agendamento.findMany({
      where: { tipo: 'CONSULTA', excluidoEm: null, desmarcadoEm: null, data },
      include: {
        profissional: { select: { nome: true } },
        paciente: { select: { id: true, nascimento: true } },
      },
    }),
    db.agendamento.count({
      where: { tipo: 'CONSULTA', excluidoEm: null, desmarcadoEm: { not: null }, data },
    }),
    db.lancamento.findMany({ where: { excluidoEm: null, data, tipo: 'ENTRADA' } }),
    db.orcamento.count({ where: { criadoEm: instantes, excluidoEm: null } }),
    db.orcamento.findMany({
      where: {
        aprovadoEm: janelaLarga(data),
        excluidoEm: null,
        status: { in: ['APROVADO', 'CANCELADO'] },
      },
      include: {
        profissional: { select: { nome: true } },
        itens: { include: { procedimento: { select: { especialidade: true } } } },
      },
    }),
    db.pessoa.findMany({
      where: { tipo: 'PACIENTE', excluidoEm: null, criadoEm: instantes },
      select: { comoConheceu: true },
    }),
  ])

  // Ocupação: horários de 15 min usados ÷ horários dos dias em que cada profissional atendeu.
  const diasPorProf = new Map<string, Set<string>>()
  let usados = 0
  for (const c of consultas) {
    usados += Math.max(1, (paraMinutos(c.fim) - paraMinutos(c.inicio)) / INTERVALO)
    const dias = diasPorProf.get(c.profissional.nome) ?? new Set()
    diasPorProf.set(c.profissional.nome, dias.add(isoDe(c.data)))
  }
  const disponiveis = [...diasPorProf.values()].reduce((s, d) => s + d.size, 0) * HORARIOS.length

  const aprovados = aprovadosUtc
    .map((o) => ({ ...o, dia: hojeNaClinica(o.aprovadoEm!) }))
    .filter((o) => noPeriodo(o.dia, data))
  // Orçamento só se aprova pago: o faturamento são os aprovados que seguem aprovados
  // (cancelado sai, como no Financeiro).
  const faturados = aprovados.filter((o) => o.status === 'APROVADO')
  const faturamento = faturados.reduce((s, o) => s + totalOrc(o), 0)
  const atendidas = consultas.filter((c) => c.status === 'ATENDIDO').length
  const faltas = consultas.filter((c) => c.status === 'FALTOU').length
  const atendidos = new Set(
    consultas.filter((c) => c.status === 'ATENDIDO' && c.pacienteId).map((c) => c.pacienteId),
  ).size

  return {
    consultas: {
      total: consultas.length,
      atendidas,
      faltas,
      desmarcadas,
      /** Atendidas ÷ (atendidas + faltas): quem tinha de vir e veio. */
      comparecimento: atendidas + faltas ? atendidas / (atendidas + faltas) : 0,
      ocupacao: disponiveis ? usados / disponiveis : 0,
    },
    financeiro: {
      faturamento,
      /** Orçamentos que entram no faturamento. */
      faturados: faturados.length,
      ticketMedio: faturados.length ? faturamento / faturados.length : 0,
      /** Faturamento ÷ pacientes atendidos. */
      porPaciente: atendidos ? faturamento / atendidos : 0,
    },
    orcamentos: {
      criados,
      aprovados: aprovados.length,
      conversao: criados ? aprovados.length / criados : 0,
    },
    pacientesNovos: novos.length,
    atendidos,
    // Detalhe do período (só o atual vai para a tela).
    _det: { consultas, entradas, faturados, novos },
  }
}

/** Idade em anos completos na data (ISO). */
function idade(nasc: Date, hoje: string) {
  const n = isoDe(nasc)
  const anos = Number(hoje.slice(0, 4)) - Number(n.slice(0, 4))
  return hoje.slice(5) < n.slice(5) ? anos - 1 : anos
}
const FAIXAS: [number, string][] = [
  [12, '0–12'],
  [17, '13–17'],
  [25, '18–25'],
  [35, '26–35'],
  [50, '36–50'],
  [65, '51–65'],
  [200, '66+'],
]
const ATRASOS: [number, string][] = [
  [30, '1–30 dias'],
  [60, '31–60 dias'],
  [90, '61–90 dias'],
  [180, '91–180 dias'],
  [Infinity, 'Mais de 180 dias'],
]

export const rotasPainel = Router()

rotasPainel.get('/', exigir('painel.ver'), async (req, res) => {
  const data = periodo(req)
  if (!data) return res.status(400).json({ erro: 'Período inválido.' })
  const [antDe, antAte] = [String(req.query.anteriorDe ?? ''), String(req.query.anteriorAte ?? '')]
  const ant = Date.parse(antDe) && Date.parse(antAte) ? { gte: dia(antDe), lte: dia(antAte) } : null
  const hoje = hojeNaClinica()
  // 12 meses que terminam no mês do fim do período.
  const fim = isoDe(data.lte)
  const ini12 = isoDe(new Date(Date.UTC(+fim.slice(0, 4), +fim.slice(5, 7) - 12, 1)))
  const fim12 = isoDe(new Date(Date.UTC(+fim.slice(0, 4), +fim.slice(5, 7), 0)))

  const doze = { gte: dia(ini12), lte: dia(fim12) }
  const [atual, anterior, atrasadas, criadosCoorte, orcs12, retornosVencidos] = await Promise.all([
    resumo(data),
    ant ? resumo(ant) : null,
    db.contaFinanceira.findMany({
      where: { tipo: 'RECEBER', status: 'ABERTA', vencimento: { lt: dia(hoje) } },
      select: { valorCentavos: true, pacienteId: true, vencimento: true },
    }),
    db.orcamento.findMany({
      where: {
        criadoEm: { gte: data.gte, lt: new Date(data.lte.getTime() + DIA_MS) },
        excluidoEm: null,
      },
      select: { status: true, itens: { select: { executadoEm: true } } },
    }),
    db.orcamento.findMany({
      where: { status: 'APROVADO', excluidoEm: null, aprovadoEm: janelaLarga(doze) },
      select: {
        aprovadoEm: true,
        descontoCentavos: true,
        itens: { select: { valorCentavos: true } },
      },
    }),
    db.alertaRetorno.count({
      where: { excluidoEm: null, concluidoEm: null, data: { lt: dia(hoje) } },
    }),
  ])
  const { consultas, entradas, faturados, novos } = atual._det
  const tirar = (r: Awaited<ReturnType<typeof resumo>>) => {
    const { _det, ...resto } = r
    void _det
    return resto
  }

  // Mapa de calor: [dia da semana 0=dom][hora 0–23] → consultas.
  const mapaCalor = Array.from({ length: 7 }, () => Array<number>(24).fill(0))
  for (const c of consultas) mapaCalor[c.data.getUTCDay()][Number(c.inicio.slice(0, 2))]++
  const faltasSemana = Array<number>(7).fill(0)
  for (const c of consultas) if (c.status === 'FALTOU') faltasSemana[c.data.getUTCDay()]++

  // Faturamento por dia (da aprovação): a tela agrupa por dia, semana ou mês.
  const porDia = new Map<string, number>()
  for (const o of faturados) porDia.set(o.dia, (porDia.get(o.dia) ?? 0) + totalOrc(o))

  // Últimos 12 meses.
  const meses = Array.from({ length: 12 }, (_, i) =>
    isoDe(new Date(Date.UTC(+ini12.slice(0, 4), +ini12.slice(5, 7) - 1 + i, 1))).slice(0, 7),
  )
  const porMes = new Map<string, number>()
  for (const o of orcs12) {
    const mes = hojeNaClinica(o.aprovadoEm!).slice(0, 7)
    porMes.set(mes, (porMes.get(mes) ?? 0) + totalOrc(o))
  }
  const tendencia = meses.map((mes) => ({ mes, faturamento: porMes.get(mes) ?? 0 }))

  // Profissionais: agenda e faturamento lado a lado.
  const profs = new Map<string, { consultas: number; faltas: number; faturamento: number }>()
  const prof = (nome: string) => {
    const g = profs.get(nome) ?? { consultas: 0, faltas: 0, faturamento: 0 }
    profs.set(nome, g)
    return g
  }
  for (const c of consultas) {
    const g = prof(c.profissional.nome)
    g.consultas++
    if (c.status === 'FALTOU') g.faltas++
  }
  for (const o of faturados) prof(o.profissional.nome).faturamento += totalOrc(o)

  // Funil: os orçamentos criados no período e até onde chegaram.
  const aprov = criadosCoorte.filter((o) => o.status === 'APROVADO')
  const comExecucao = aprov.filter((o) => o.itens.some((i) => i.executadoEm))
  const concluidos = comExecucao.filter((o) => o.itens.every((i) => i.executadoEm))

  // Pacientes atendidos (um por paciente), por faixa de idade.
  const vistos = new Map<number, Date | null>()
  for (const c of consultas)
    if (c.status === 'ATENDIDO' && c.paciente) vistos.set(c.paciente.id, c.paciente.nascimento)
  const faixaEtaria = FAIXAS.map(([, rotulo]) => ({ rotulo, valor: 0 }))
  let semIdade = 0
  for (const n of vistos.values()) {
    if (!n) {
      semIdade++
      continue
    }
    const a = idade(n, hoje)
    faixaEtaria[FAIXAS.findIndex(([max]) => a <= max)].valor++
  }

  const statusConsultas = [
    { rotulo: 'Atendidas', valor: atual.consultas.atendidas },
    { rotulo: 'Faltas', valor: atual.consultas.faltas },
    { rotulo: 'Desmarcadas', valor: atual.consultas.desmarcadas },
    {
      rotulo: 'A atender',
      valor: consultas.filter((c) => c.status !== 'ATENDIDO' && c.status !== 'FALTOU').length,
    },
  ]

  res.json({
    ...tirar(atual),
    anterior: anterior && tirar(anterior),
    consultas: {
      ...atual.consultas,
      status: statusConsultas,
      porCategoria: somarPor(consultas, (c) => c.categoria || 'Sem categoria'),
      porProfissional: [...profs]
        .map(([nome, g]) => ({ nome, ...g }))
        .sort((a, b) => b.faturamento - a.faturamento || b.consultas - a.consultas),
    },
    financeiro: {
      ...atual.financeiro,
      // Forma de pagamento só existe no pagamento (que acontece na aprovação).
      porForma: somarPor(
        entradas,
        (l) => l.forma ?? 'Não informada',
        (l) => l.valorCentavos,
      ),
      porDia: [...porDia]
        .map(([d, valor]) => ({ data: d, valor }))
        .sort((a, b) => (a.data < b.data ? -1 : 1)),
      tendencia,
    },
    inadimplencia: {
      valor: atrasadas.reduce((s, c) => s + c.valorCentavos, 0),
      parcelas: atrasadas.length,
      pacientes: new Set(atrasadas.map((c) => c.pacienteId)).size,
      porAtraso: ATRASOS.map(([max, rotulo], i) => ({
        rotulo,
        valor: atrasadas
          .filter((c) => {
            const d = Math.round((dia(hoje).getTime() - c.vencimento.getTime()) / DIA_MS)
            return d <= max && d > (i ? ATRASOS[i - 1][0] : 0)
          })
          .reduce((s, c) => s + c.valorCentavos, 0),
      })),
    },
    orcamentos: {
      ...atual.orcamentos,
      funil: [
        { rotulo: 'Criados', valor: criadosCoorte.length },
        { rotulo: 'Aprovados', valor: aprov.length },
        { rotulo: 'Em execução', valor: comExecucao.length },
        { rotulo: 'Concluídos', valor: concluidos.length },
      ],
      porEspecialidade: somarPor(
        faturados.flatMap(itensLiquidos),
        (i) => i.procedimento.especialidade ?? 'Sem especialidade',
        (i) => i.liquido,
      ),
      porProcedimento: somarPor(
        faturados.flatMap(itensLiquidos),
        (i) => i.nome,
        (i) => i.liquido,
      ),
    },
    pacientes: {
      novos: novos.length,
      atendidos: atual.atendidos,
      origem: somarPor(novos, (p) => p.comoConheceu || 'Não informada'),
      faixaEtaria,
      semIdade,
    },
    retornosVencidos,
    mapaCalor,
    faltasSemana,
  })
})
