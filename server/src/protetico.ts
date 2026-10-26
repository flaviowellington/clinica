// Controle Protético (R-082): ordem de serviço como cartão de quadro, mover e excluir.
import { Router, type Request } from 'express'
import { db } from './db'
import { exigir, usuarioDe } from './auth'
import { ETAPAS, type Etapa } from '../../shared/protetico'
import { hojeNaClinica } from '../../shared/regras'

const texto = (v: unknown, max = 200) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
const dia = (iso: string) => new Date(`${iso}T00:00:00Z`)
const dataIso = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v))
const id = (req: Request) => Number(req.params.id) || 0

const incluir = {
  paciente: { select: { id: true, nome: true, celular: true } },
  profissional: { select: { id: true, nome: true } },
} as const

/** Datas Date → aaaa-mm-dd para a tela. */
function paraTela<T extends Record<string, unknown>>(t: T) {
  const r: Record<string, unknown> = { ...t }
  for (const c of ['prazo', 'enviadoEm', 'retornoEm', 'instaladoEm'])
    if (r[c] instanceof Date) r[c] = (r[c] as Date).toISOString().slice(0, 10)
  return r
}

async function lerTrabalho(b: Record<string, unknown>) {
  const erros: Record<string, string> = {}
  const pacienteId = Number(b.pacienteId) || 0
  const profissionalId = Number(b.profissionalId) || 0
  if (
    !(await db.pessoa.findFirst({ where: { id: pacienteId, tipo: 'PACIENTE', excluidoEm: null } }))
  )
    erros.pacienteId = 'Escolha o paciente.'
  if (
    !(await db.pessoa.findFirst({
      where: { id: profissionalId, tipo: 'PROFISSIONAL', excluidoEm: null },
    }))
  )
    erros.profissionalId = 'Escolha o profissional.'
  const laboratorio = texto(b.laboratorio, 120)
  const trabalho = texto(b.trabalho)
  if (!laboratorio) erros.laboratorio = 'Informe o laboratório.'
  if (!trabalho) erros.trabalho = 'Descreva o trabalho.'
  const valor = b.valorCentavos === undefined ? 0 : b.valorCentavos
  if (!Number.isInteger(valor) || (valor as number) < 0) erros.valorCentavos = 'Valor inválido.'
  const datas: Record<string, Date | null> = {}
  for (const c of ['prazo', 'enviadoEm', 'retornoEm', 'instaladoEm']) {
    if (b[c] && !dataIso(b[c])) erros[c] = 'Data inválida.'
    datas[c] = dataIso(b[c]) ? dia(b[c]) : null
  }
  return {
    erros,
    dados: {
      pacienteId,
      profissionalId,
      laboratorio: laboratorio ?? '',
      trabalho: trabalho ?? '',
      dentes: texto(b.dentes, 60),
      cor: texto(b.cor, 40),
      valorCentavos: valor as number,
      observacoes: texto(b.observacoes, 1500),
      ...datas,
    },
  }
}

export const rotasProtetico = Router()

rotasProtetico.get('/', exigir('protetico.ver'), async (_req, res) => {
  const lista = await db.trabalhoProtetico.findMany({
    where: { excluidoEm: null },
    include: incluir,
    orderBy: [{ prazo: 'asc' }, { id: 'asc' }],
  })
  res.json(lista.map(paraTela))
})

/** Novo cartão entra sempre na primeira coluna (Pré-envio). */
rotasProtetico.post('/', exigir('protetico.editar'), async (req, res) => {
  const { erros, dados } = await lerTrabalho(req.body ?? {})
  if (Object.keys(erros).length) return res.status(400).json({ erro: 'Confira os campos.', erros })
  const t = await db.trabalhoProtetico.create({
    data: { ...dados, criadoPorId: usuarioDe(res).id },
    include: incluir,
  })
  res.status(201).json(paraTela(t))
})

rotasProtetico.put('/:id', exigir('protetico.editar'), async (req, res) => {
  const t = await db.trabalhoProtetico.findFirst({ where: { id: id(req), excluidoEm: null } })
  if (!t) return res.status(404).json({ erro: 'Trabalho não encontrado.' })
  const { erros, dados } = await lerTrabalho(req.body ?? {})
  if (Object.keys(erros).length) return res.status(400).json({ erro: 'Confira os campos.', erros })
  const novo = await db.trabalhoProtetico.update({
    where: { id: t.id },
    data: dados,
    include: incluir,
  })
  res.json(paraTela(novo))
})

/** Mover de coluna: grava quem moveu e, ao entrar na etapa, a data dela (se ainda não houver). */
rotasProtetico.patch('/:id/etapa', exigir('protetico.editar'), async (req, res) => {
  const t = await db.trabalhoProtetico.findFirst({ where: { id: id(req), excluidoEm: null } })
  if (!t) return res.status(404).json({ erro: 'Trabalho não encontrado.' })
  const etapa = String(req.body?.etapa) as Etapa
  if (!(etapa in ETAPAS)) return res.status(400).json({ erro: 'Etapa inválida.' })
  const hoje = dia(hojeNaClinica())
  const novo = await db.trabalhoProtetico.update({
    where: { id: t.id },
    data: {
      etapa,
      movidoEm: new Date(),
      movidoPorId: usuarioDe(res).id,
      ...(etapa === 'EM_LABORATORIO' && !t.enviadoEm && { enviadoEm: hoje }),
      ...(etapa === 'RETORNO' && !t.retornoEm && { retornoEm: hoje }),
      ...(etapa === 'INSTALADO' && !t.instaladoEm && { instaladoEm: hoje }),
    },
    include: incluir,
  })
  res.json(paraTela(novo))
})

rotasProtetico.delete('/:id', exigir('protetico.editar'), async (req, res) => {
  const t = await db.trabalhoProtetico.findFirst({ where: { id: id(req), excluidoEm: null } })
  if (!t) return res.status(404).json({ erro: 'Trabalho não encontrado.' })
  await db.trabalhoProtetico.update({
    where: { id: t.id },
    data: { excluidoEm: new Date(), excluidoPorId: usuarioDe(res).id },
  })
  res.json({ ok: true })
})
