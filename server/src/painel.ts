// Dashboard Analítico (R-088): os indicadores de gestão de um período, numa chamada só.
import { Router } from 'express'
import { db } from './db'
import { exigir } from './auth'
import { periodo } from './financeiro'
import { HORARIOS, INTERVALO, paraMinutos } from '../../shared/agenda'
import { hojeNaClinica } from '../../shared/regras'

const DIA_MS = 86_400_000
const isoDe = (d: Date) => d.toISOString().slice(0, 10)

/** Conta e soma por chave, do maior para o menor. */
function somarPor<T>(itens: T[], chave: (i: T) => string, valor: (i: T) => number = () => 1) {
  const m = new Map<string, number>()
  for (const i of itens) m.set(chave(i), (m.get(chave(i)) ?? 0) + valor(i))
  return [...m].map(([rotulo, v]) => ({ rotulo, valor: v })).sort((a, b) => b.valor - a.valor)
}

export const rotasPainel = Router()

rotasPainel.get('/', exigir('painel.ver'), async (req, res) => {
  const data = periodo(req)
  if (!data) return res.status(400).json({ erro: 'Período inválido.' })
  const instantes = { gte: data.gte, lt: new Date(data.lte.getTime() + DIA_MS) }

  const [consultas, desmarcadas, lancamentos, atrasadas, criados, aprovados, novos] =
    await Promise.all([
      db.agendamento.findMany({
        where: { tipo: 'CONSULTA', excluidoEm: null, desmarcadoEm: null, data },
        include: { profissional: { select: { nome: true } } },
      }),
      db.agendamento.count({
        where: { tipo: 'CONSULTA', excluidoEm: null, desmarcadoEm: { not: null }, data },
      }),
      db.lancamento.findMany({ where: { excluidoEm: null, data } }),
      db.contaFinanceira.findMany({
        where: {
          tipo: 'RECEBER',
          status: 'ABERTA',
          vencimento: { lt: new Date(`${hojeNaClinica()}T00:00:00Z`) },
        },
        select: { valorCentavos: true, pacienteId: true },
      }),
      db.orcamento.count({ where: { criadoEm: instantes, excluidoEm: null } }),
      db.orcamento.findMany({
        where: { aprovadoEm: instantes, status: { in: ['APROVADO', 'CANCELADO'] } },
        include: { itens: { include: { procedimento: { select: { especialidade: true } } } } },
      }),
      db.pessoa.count({ where: { tipo: 'PACIENTE', excluidoEm: null, criadoEm: instantes } }),
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

  const soma = (tipo: string) =>
    lancamentos.filter((l) => l.tipo === tipo).reduce((s, l) => s + l.valorCentavos, 0)
  const recebido = soma('ENTRADA')
  const despesas = soma('SAIDA')
  const valorAprovado = aprovados.reduce(
    (s, o) => s + o.itens.reduce((t, i) => t + i.valorCentavos, 0) - o.descontoCentavos,
    0,
  )
  const porProfissional = new Map<string, { consultas: number; faltas: number }>()
  for (const c of consultas) {
    const g = porProfissional.get(c.profissional.nome) ?? { consultas: 0, faltas: 0 }
    g.consultas++
    if (c.status === 'FALTOU') g.faltas++
    porProfissional.set(c.profissional.nome, g)
  }

  res.json({
    consultas: {
      total: consultas.length,
      atendidas: consultas.filter((c) => c.status === 'ATENDIDO').length,
      faltas: consultas.filter((c) => c.status === 'FALTOU').length,
      desmarcadas,
      ocupacao: disponiveis ? usados / disponiveis : 0,
      porCategoria: somarPor(consultas, (c) => c.categoria || 'Sem categoria'),
      porProfissional: [...porProfissional]
        .map(([nome, g]) => ({ nome, ...g }))
        .sort((a, b) => b.consultas - a.consultas),
    },
    financeiro: {
      vendido: soma('VENDA'),
      cancelado: soma('CANCELAMENTO'),
      recebido,
      despesas,
      resultado: recebido - despesas,
      recibos: lancamentos.filter((l) => l.tipo === 'ENTRADA').length,
      porForma: somarPor(
        lancamentos.filter((l) => l.tipo === 'ENTRADA'),
        (l) => l.forma ?? 'Não informada',
        (l) => l.valorCentavos,
      ),
    },
    inadimplencia: {
      valor: atrasadas.reduce((s, c) => s + c.valorCentavos, 0),
      parcelas: atrasadas.length,
      pacientes: new Set(atrasadas.map((c) => c.pacienteId)).size,
    },
    orcamentos: {
      criados,
      aprovados: aprovados.length,
      conversao: criados ? aprovados.length / criados : 0,
      valorAprovado,
      porEspecialidade: somarPor(
        aprovados.flatMap((o) => o.itens),
        (i) => i.procedimento.especialidade ?? 'Sem especialidade',
        (i) => i.valorCentavos,
      ),
    },
    pacientesNovos: novos,
  })
})
