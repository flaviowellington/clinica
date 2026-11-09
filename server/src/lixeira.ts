// R-050: lixeira geral. Tudo que tem exclusão lógica aparece aqui e pode ser restaurado.
import { Router } from 'express'
import { db } from './db'
import { exigir, usuarioDe } from './auth'
import { avisarTodos } from './tempoReal'
import type { Prisma } from './generated/prisma/client'
import { denteComFaces } from '../../shared/prontuario'

const LIMITE = 200
const naLixeira = { excluidoEm: { not: null } }
const ordem = { excluidoEm: 'desc' } as const
const nomeDe = { select: { nome: true } }
const dataBR = (d: Date) => d.toISOString().slice(0, 10).split('-').reverse().join('/')

type Linha = {
  id: number
  /** Todos os registros da linha (vários dentes de um lançamento); padrão: só o id. */
  ids?: number[]
  titulo: string
  detalhe?: string | null
  paciente?: { nome: string } | null
  excluidoEm: Date | null
  excluidoPorId?: number | null
}

/** Cada tipo: rótulo, assunto do aviso em tempo real, como listar e como restaurar. */
type Tipo = {
  rotulo: string
  assunto: string
  listar: () => Promise<Linha[]>
  /** Devolve quantos voltaram (0 = não estava na lixeira) ou uma mensagem de recusa. */
  restaurar: (id: number, quem: number) => Promise<number | string>
}

const sim = (r: { count: number }) => r.count
const volta = { excluidoEm: null, excluidoPorId: null }

/** Excluídos juntos com até esse intervalo entre um dente e outro são um só lançamento. */
const JUNTOS_MS = 10_000

/**
 * Junta os dentes de um mesmo lançamento: a tela exclui um a um, então cada dente vira um
 * registro. Mesma chave e excluídos em sequência (até JUNTOS_MS entre um e outro) = um grupo.
 */
export function juntar<T extends { excluidoEm: Date | null }>(itens: T[], chave: (i: T) => unknown) {
  const grupos: T[][] = []
  const aberto = new Map<string, T[]>()
  for (const i of [...itens].sort((a, b) => +a.excluidoEm! - +b.excluidoEm!)) {
    const k = JSON.stringify(chave(i))
    const g = aberto.get(k)
    if (g && +i.excluidoEm! - +g.at(-1)!.excluidoEm! <= JUNTOS_MS) g.push(i)
    else {
      grupos.push([i])
      aberto.set(k, grupos.at(-1)!)
    }
  }
  return grupos
}

const dentes = (g: { dente: string | null; faces: string | null }[]) =>
  g.map((i) => denteComFaces(i.dente, i.faces)).filter(Boolean).join(', ')

/** Ids do grupo que contém `id`, entre os grupos dados. */
const grupoDe = (grupos: { id: number }[][], id: number) =>
  grupos.find((g) => g.some((i) => i.id === id))?.map((i) => i.id) ?? []

const chaveProcedimento = (c: Prisma.ProcedimentoClinicoGetPayload<object>) => [
  c.pacienteId, c.nome, c.status, +c.data, c.profissionalId, c.observacao,
  c.observacaoPaciente, c.excluidoPorId,
]
const chaveItemFicha = (i: Prisma.ItemFichaEspecialidadeGetPayload<object>) => [
  i.fichaId, i.procedimento, i.status, i.data && +i.data, i.observacao,
]

const pessoa = (tipo: 'PACIENTE' | 'PROFISSIONAL', rotulo: string): Tipo => ({
  rotulo,
  assunto: tipo === 'PACIENTE' ? 'pacientes' : 'agenda',
  listar: async () =>
    (
      await db.pessoa.findMany({ where: { tipo, ...naLixeira }, orderBy: ordem, take: LIMITE })
    ).map((p) => ({ ...p, titulo: p.nome, detalhe: p.cpf && `CPF ${p.cpf}` })),
  restaurar: async (id, quem) =>
    sim(
      await db.pessoa.updateMany({
        where: { id, tipo, ...naLixeira },
        data: { ...volta, alteradoPorId: quem },
      }),
    ),
})

export const TIPOS: Record<string, Tipo> = {
  paciente: pessoa('PACIENTE', 'Paciente'),
  profissional: pessoa('PROFISSIONAL', 'Profissional'),
  agendamento: {
    rotulo: 'Agendamento',
    assunto: 'agenda',
    listar: async () =>
      (
        await db.agendamento.findMany({
          where: naLixeira,
          orderBy: ordem,
          take: LIMITE,
          include: { paciente: nomeDe, profissional: nomeDe },
        })
      ).map((a) => ({
        ...a,
        titulo: a.tipo === 'CONSULTA' ? 'Consulta' : `Compromisso: ${a.titulo ?? ''}`,
        detalhe: `${dataBR(a.data)} ${a.inicio}–${a.fim} · ${a.profissional.nome}`,
      })),
    restaurar: async (id) => sim(await db.agendamento.updateMany({ where: { id, ...naLixeira }, data: volta })),
  },
  orcamento: {
    rotulo: 'Orçamento',
    assunto: 'pacientes',
    listar: async () =>
      (
        await db.orcamento.findMany({
          where: naLixeira,
          orderBy: ordem,
          take: LIMITE,
          include: { paciente: nomeDe, profissional: nomeDe, itens: { select: { nome: true } } },
        })
      ).map((o) => ({
        ...o,
        titulo: `Orçamento nº ${o.id}`,
        detalhe: o.itens.map((i) => i.nome).join(', ') || 'Sem procedimentos',
      })),
    restaurar: async (id) => {
      // R-010: orçamento precisa de pelo menos um procedimento.
      if (!(await db.itemOrcamento.count({ where: { orcamentoId: id } })))
        return 'Orçamento sem procedimentos não pode ser restaurado.'
      return sim(await db.orcamento.updateMany({ where: { id, ...naLixeira }, data: volta }))
    },
  },
  protetico: {
    rotulo: 'Controle protético',
    assunto: 'protetico',
    listar: async () =>
      (
        await db.trabalhoProtetico.findMany({
          where: naLixeira,
          orderBy: ordem,
          take: LIMITE,
          include: { paciente: nomeDe },
        })
      ).map((t) => ({ ...t, titulo: t.trabalho, detalhe: `Laboratório ${t.laboratorio}` })),
    restaurar: async (id) =>
      sim(await db.trabalhoProtetico.updateMany({ where: { id, ...naLixeira }, data: volta })),
  },
  procedimento: {
    rotulo: 'Procedimento',
    assunto: 'pacientes',
    listar: async () =>
      juntar(
        await db.procedimentoClinico.findMany({
          where: naLixeira,
          orderBy: ordem,
          take: LIMITE,
          include: { paciente: nomeDe },
        }),
        chaveProcedimento,
      ).map((g) => {
        const d = dentes(g)
        return {
          ...g.at(-1)!,
          ids: g.map((c) => c.id),
          titulo: g[0].nome,
          detalhe: [d && `${g.length > 1 ? 'Dentes' : 'Dente'} ${d}`, dataBR(g[0].data)]
            .filter(Boolean)
            .join(' · '),
        }
      }),
    // Restaura o lançamento inteiro (todos os dentes excluídos juntos).
    restaurar: async (id) => {
      const c = await db.procedimentoClinico.findFirst({ where: { id, ...naLixeira } })
      if (!c) return 0
      const irmaos = await db.procedimentoClinico.findMany({
        where: { pacienteId: c.pacienteId, nome: c.nome, ...naLixeira },
      })
      const ids = grupoDe(juntar(irmaos, chaveProcedimento), id)
      return sim(await db.procedimentoClinico.updateMany({ where: { id: { in: ids } }, data: volta }))
    },
  },
  ficha: {
    rotulo: 'Ficha de especialidade',
    assunto: 'pacientes',
    listar: async () =>
      (
        await db.fichaEspecialidade.findMany({
          where: naLixeira,
          orderBy: ordem,
          take: LIMITE,
          include: { paciente: nomeDe },
        })
      ).map((f) => ({ ...f, titulo: f.especialidade, detalhe: f.status })),
    restaurar: async (id) =>
      sim(await db.fichaEspecialidade.updateMany({ where: { id, ...naLixeira }, data: volta })),
  },
  itemFicha: {
    rotulo: 'Procedimento da ficha',
    assunto: 'pacientes',
    listar: async () =>
      juntar(
        await db.itemFichaEspecialidade.findMany({
          where: naLixeira,
          orderBy: ordem,
          take: LIMITE,
          include: { ficha: { select: { especialidade: true, paciente: nomeDe } } },
        }),
        chaveItemFicha,
      ).map((g) => ({
        ...g.at(-1)!,
        ids: g.map((i) => i.id),
        titulo: g[0].procedimento,
        detalhe: `${g.length > 1 ? 'Dentes' : 'Dente'} ${dentes(g)} · ${g[0].ficha.especialidade}`,
        paciente: g[0].ficha.paciente,
      })),
    // Restaura o lançamento inteiro (todos os dentes excluídos juntos).
    restaurar: async (id) => {
      const i = await db.itemFichaEspecialidade.findFirst({ where: { id, ...naLixeira } })
      if (!i) return 0
      const irmaos = await db.itemFichaEspecialidade.findMany({
        where: { fichaId: i.fichaId, procedimento: i.procedimento, ...naLixeira },
      })
      const ids = grupoDe(juntar(irmaos, chaveItemFicha), id)
      return sim(
        await db.itemFichaEspecialidade.updateMany({ where: { id: { in: ids } }, data: { excluidoEm: null } }),
      )
    },
  },
  documento: {
    rotulo: 'Documento',
    assunto: 'pacientes',
    listar: async () =>
      (
        await db.documento.findMany({
          where: naLixeira,
          orderBy: ordem,
          take: LIMITE,
          select: { id: true, titulo: true, modelo: true, excluidoEm: true, excluidoPorId: true, paciente: nomeDe },
        })
      ).map((d) => ({ ...d, detalhe: d.modelo })),
    restaurar: async (id) => sim(await db.documento.updateMany({ where: { id, ...naLixeira }, data: volta })),
  },
  arquivo: {
    rotulo: 'Foto ou exame',
    assunto: 'pacientes',
    listar: async () =>
      (
        await db.arquivo.findMany({
          where: naLixeira,
          orderBy: ordem,
          take: LIMITE,
          // Sem os bytes do arquivo.
          select: { id: true, nome: true, categoria: true, excluidoEm: true, excluidoPorId: true, paciente: nomeDe },
        })
      ).map((a) => ({ ...a, titulo: a.nome, detalhe: a.categoria === 'FOTO' ? 'Foto' : 'Exame' })),
    restaurar: async (id) => sim(await db.arquivo.updateMany({ where: { id, ...naLixeira }, data: volta })),
  },
  lancamento: {
    rotulo: 'Lançamento financeiro',
    assunto: 'financeiro',
    // Os de orçamento foram desfeitos pela desaprovação: voltam aprovando de novo, não por aqui.
    listar: async () =>
      (
        await db.lancamento.findMany({
          where: { ...naLixeira, orcamentoId: null },
          orderBy: ordem,
          take: LIMITE,
          include: { paciente: nomeDe },
        })
      ).map((l) => ({
        ...l,
        titulo: l.descricao,
        detalhe: `${dataBR(l.data)} · ${(l.valorCentavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
      })),
    restaurar: async (id) =>
      sim(await db.lancamento.updateMany({ where: { id, orcamentoId: null, ...naLixeira }, data: volta })),
  },
  retorno: {
    rotulo: 'Alerta de retorno',
    assunto: 'retornos',
    listar: async () =>
      (
        await db.alertaRetorno.findMany({
          where: naLixeira,
          orderBy: ordem,
          take: LIMITE,
          include: { paciente: nomeDe },
        })
      ).map((r) => ({ ...r, titulo: `Retorno em ${dataBR(r.data)}`, detalhe: r.motivo })),
    restaurar: async (id) =>
      sim(await db.alertaRetorno.updateMany({ where: { id, ...naLixeira }, data: { excluidoEm: null } })),
  },
}

export const rotasLixeira = Router()

rotasLixeira.get('/', exigir('lixeira.restaurar'), async (_req, res) => {
  const grupos = await Promise.all(
    Object.entries(TIPOS).map(async ([tipo, t]) =>
      (await t.listar()).map((l) => ({ ...l, tipo, rotulo: t.rotulo })),
    ),
  )
  const linhas = grupos.flat().sort((a, b) => +b.excluidoEm! - +a.excluidoEm!)
  const ids = [...new Set(linhas.map((l) => l.excluidoPorId).filter((x): x is number => !!x))]
  const nomes = new Map(
    (await db.usuario.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } })).map(
      (u) => [u.id, u.nome],
    ),
  )
  res.json(
    linhas.map((l) => ({
      tipo: l.tipo,
      rotulo: l.rotulo,
      id: l.id,
      ids: l.ids ?? [l.id],
      titulo: l.titulo,
      detalhe: l.detalhe ?? null,
      paciente: l.paciente?.nome ?? null,
      excluidoEm: l.excluidoEm,
      excluidoPor: (l.excluidoPorId && nomes.get(l.excluidoPorId)) || null,
    })),
  )
})

rotasLixeira.post('/:tipo/:id/restaurar', exigir('lixeira.restaurar'), async (req, res) => {
  const tipo = String(req.params.tipo)
  const t = Object.hasOwn(TIPOS, tipo) ? TIPOS[tipo] : undefined
  const r = t && (await t.restaurar(Number(req.params.id) || 0, usuarioDe(res).id))
  if (typeof r === 'string') return res.status(409).json({ erro: r })
  if (!r) return res.status(404).json({ erro: 'Registro não está na lixeira.' })
  avisarTodos(t!.assunto)
  res.json({ mensagem: 'Registro restaurado.' })
})
