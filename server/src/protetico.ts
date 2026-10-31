// Controle Protético (R-082): ordem de serviço como cartão de quadro, mover e excluir.
import { Router, type Request, type Response } from 'express'
import { db } from './db'
import { exigir, usuarioDe } from './auth'
import { EtapaDto, TrabalhoProteticoDto } from '../../shared/dtos'
import { lerCorpo } from './dto'
import { hojeNaClinica } from '../../shared/regras'

const dia = (iso: string) => new Date(`${iso}T00:00:00Z`)
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

/** Trabalho lido pelo DTO; paciente e profissional precisam existir. */
async function lerTrabalho(corpo: unknown, res: Response) {
  const d = lerCorpo(TrabalhoProteticoDto, corpo, res)
  if (!d) return
  const erros: Record<string, string> = {}
  const existe = (id: number, tipo: 'PACIENTE' | 'PROFISSIONAL') =>
    db.pessoa.findFirst({ where: { id, tipo, excluidoEm: null } })
  if (!(await existe(d.pacienteId, 'PACIENTE'))) erros.pacienteId = 'Escolha o paciente.'
  if (!(await existe(d.profissionalId, 'PROFISSIONAL')))
    erros.profissionalId = 'Escolha o profissional.'
  if (Object.keys(erros).length) {
    res.status(400).json({ erro: 'Confira os campos.', erros })
    return
  }
  const quando = (v: string | null) => (v ? dia(v) : null)
  return {
    ...d,
    prazo: quando(d.prazo),
    enviadoEm: quando(d.enviadoEm),
    retornoEm: quando(d.retornoEm),
    instaladoEm: quando(d.instaladoEm),
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
  const dados = await lerTrabalho(req.body, res)
  if (!dados) return
  const t = await db.trabalhoProtetico.create({
    data: { ...dados, criadoPorId: usuarioDe(res).id },
    include: incluir,
  })
  res.status(201).json(paraTela(t))
})

rotasProtetico.put('/:id', exigir('protetico.editar'), async (req, res) => {
  const t = await db.trabalhoProtetico.findFirst({ where: { id: id(req), excluidoEm: null } })
  if (!t) return res.status(404).json({ erro: 'Trabalho não encontrado.' })
  const dados = await lerTrabalho(req.body, res)
  if (!dados) return
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
  const b = lerCorpo(EtapaDto, req.body, res, null)
  if (!b) return
  const { etapa } = b
  const hoje = dia(hojeNaClinica())
  const novo = await db.trabalhoProtetico.update({
    where: { id: t.id },
    data: {
      etapa,
      movidoEm: new Date(),
      movidoPorId: usuarioDe(res).id,
      ...(etapa === 'EM_LABORATORIO' && !t.enviadoEm && { enviadoEm: hoje }),
      ...(etapa === 'AGENDAMENTO' && !t.retornoEm && { retornoEm: hoje }),
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
