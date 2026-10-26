// Caixa do dia (F-031): abre com o troco, recebe pagamentos, fecha conferindo cada forma.
// ponytail: um caixa da clínica por vez; um caixa por recepcionista se a clínica pedir.
import { Router } from 'express'
import { db } from './db'
import { conferirSenha, exigir, usuarioDe } from './auth'

export const caixaAberto = () => db.caixa.findFirst({ where: { fechadoEm: null } })

const SEM_FORMA = 'Não informada'
const pessoa = { select: { nome: true } } as const

/** Quanto deve haver em cada forma: o troco inicial (em dinheiro) mais os recebimentos. */
async function esperado(caixaId: number, saldoInicial: number) {
  const g = await db.lancamento.groupBy({
    by: ['forma', 'tipo'],
    where: { caixaId, excluidoEm: null },
    _sum: { valorCentavos: true },
  })
  const porForma: Record<string, number> = { Dinheiro: saldoInicial }
  for (const l of g) {
    const forma = l.forma ?? SEM_FORMA
    const sinal = l.tipo === 'SAIDA' ? -1 : 1
    porForma[forma] = (porForma[forma] ?? 0) + sinal * (l._sum.valorCentavos ?? 0)
  }
  return porForma
}

export const rotasCaixa = Router()

rotasCaixa.get('/', exigir('caixa.operar'), async (_req, res) => {
  const [aberto, ultimos] = await Promise.all([
    db.caixa.findFirst({
      where: { fechadoEm: null },
      include: {
        abertoPor: pessoa,
        lancamentos: {
          where: { excluidoEm: null },
          include: { paciente: { select: { id: true, nome: true } }, criadoPor: pessoa },
          orderBy: { id: 'desc' },
        },
      },
    }),
    db.caixa.findMany({
      where: { fechadoEm: { not: null } },
      include: { abertoPor: pessoa, fechadoPor: pessoa },
      orderBy: { id: 'desc' },
      take: 15,
    }),
  ])
  res.json({
    aberto: aberto && {
      ...aberto,
      esperado: await esperado(aberto.id, aberto.saldoInicialCentavos),
    },
    ultimos,
  })
})

rotasCaixa.post('/abrir', exigir('caixa.operar'), async (req, res) => {
  const saldo = req.body?.saldoInicialCentavos
  if (!Number.isInteger(saldo) || saldo < 0)
    return res.status(400).json({ erro: 'Informe o troco inicial (pode ser zero).' })
  if (await caixaAberto()) return res.status(409).json({ erro: 'Já existe um caixa aberto.' })
  const c = await db.caixa.create({
    data: { saldoInicialCentavos: saldo, abertoPorId: usuarioDe(res).id },
  })
  res.status(201).json(c)
})

/** Fecha pedindo a senha de quem fecha; guarda esperado e contado de cada forma. */
rotasCaixa.post('/fechar', exigir('caixa.operar'), async (req, res) => {
  const c = await caixaAberto()
  if (!c) return res.status(409).json({ erro: 'Não há caixa aberto.' })
  const u = usuarioDe(res)
  if (!(await conferirSenha(u.login, String(req.body?.senha ?? ''))))
    return res.status(401).json({ erro: 'Senha incorreta.' })
  const contado = (req.body?.contado ?? {}) as Record<string, unknown>
  const porForma = await esperado(c.id, c.saldoInicialCentavos)
  const conferencia: Record<string, { esperado: number; contado: number }> = {}
  for (const forma of new Set([...Object.keys(porForma), ...Object.keys(contado)])) {
    const v = contado[forma]
    if (v !== undefined && (!Number.isInteger(v) || (v as number) < 0))
      return res.status(400).json({ erro: `Valor contado inválido em ${forma}.` })
    conferencia[forma.slice(0, 40)] = {
      esperado: porForma[forma] ?? 0,
      contado: (v as number) ?? 0,
    }
  }
  const fechado = await db.caixa.update({
    where: { id: c.id },
    data: {
      fechadoEm: new Date(),
      fechadoPorId: u.id,
      conferencia,
      observacoes:
        typeof req.body?.observacoes === 'string' ? req.body.observacoes.slice(0, 1000) : null,
    },
  })
  res.json(fechado)
})
