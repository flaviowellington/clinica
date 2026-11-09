// Autorização do plano de tratamento: o paciente lê e assina pelo celular os procedimentos
// "a realizar". Independe do pagamento: o orçamento se aprova depois do atendimento.
import { randomBytes } from 'node:crypto'
import { Router, type Request } from 'express'
import { db } from './db'
import { exigir, usuarioDe } from './auth'
import { enviar, responderErroEnvio } from './mensagens'
import { lerConfig } from './configuracoes'
import { enderecoPublico } from './confirmacoes'
import { comEtapasFixas, denteComFaces, type EtapaFicha } from '../../shared/prontuario'
import {
  AssinarAutorizacaoDto,
  AutorizacaoDto,
  AutorizacaoFichaDto,
  EnviarConfirmacaoDto,
  JuntarAutorizacoesDto,
  idOpcional,
} from '../../shared/dtos'
import { lerCorpo } from './dto'
import { escreverPdf } from './pdfAutorizacao'

/** Texto que o paciente declara ao assinar; vai copiado em cada pedido. */
export const TERMO =
  'Declaro que fui informado(a) de forma clara sobre os procedimentos acima: o que será feito, ' +
  'seus objetivos, cuidados, riscos e alternativas. Tive a oportunidade de tirar minhas dúvidas ' +
  'e autorizo a sua realização.'

export interface ConteudoAutorizacao {
  paciente: string
  termo: string
  /** Plano escrito pelo profissional e quem escreveu. */
  plano?: string | null
  autor?: string
  /** Planejamento (ficha de especialidade): a especialidade e as etapas com as datas previstas. */
  especialidade?: string
  etapas?: { id: string; nome: string; data: string | null; comentario: string | null }[]
  itens: {
    nome: string
    profissional: string
    dentes: string[]
    /** Data prevista (planejamento). */
    data?: string | null
    observacaoPaciente: string | null
  }[]
}

const pessoaCurta = { select: { id: true, nome: true, email: true, celular: true } } as const
const link = (token: string) => `${enderecoPublico()}/autorizar/${token}`
const linkPdf = (token: string) => `${enderecoPublico()}/api/publico/autorizacao/${token}/pdf`
const mensagem = (primeiroNome: string, clinica: string, token: string) =>
  `Olá, ${primeiroNome}! A ${clinica} preparou o seu plano de tratamento. ` +
  `Leia e assine pelo celular: ${link(token)}`

/** Tira os procedimentos do pedido: eles voltam para "Para autorizar". */
const soltar = (autorizacaoId: number) => [
  db.itemOrcamento.updateMany({ where: { autorizacaoId }, data: { autorizacaoId: null } }),
  db.procedimentoClinico.updateMany({ where: { autorizacaoId }, data: { autorizacaoId: null } }),
  db.itemFichaEspecialidade.updateMany({ where: { autorizacaoId }, data: { autorizacaoId: null } }),
]

// ── Rotas com login: /api/autorizacoes ──────────────────────────────────────
export const rotasAutorizacoes = Router()

rotasAutorizacoes.get('/', exigir('prontuario.ver'), async (req, res) => {
  const pacienteId = idOpcional.parse(req.query.pacienteId) ?? 0
  // Sem fichaId: os pedidos avulsos; com ele, os do planejamento.
  const fichaId = idOpcional.parse(req.query.fichaId)
  const [lista, clinica] = await Promise.all([
    db.autorizacao.findMany({
      where: { pacienteId, canceladoEm: null, fichaId },
      include: { paciente: pessoaCurta, criadoPor: { select: { nome: true } } },
      omit: { assinatura: true },
      orderBy: { id: 'desc' },
    }),
    lerConfig('clinica'),
  ])
  res.json(
    lista.map(({ token, ...a }) => ({
      ...a,
      link: link(token),
      pdf: linkPdf(token),
      mensagem: mensagem(a.paciente.nome.split(' ')[0], clinica.nome, token),
    })),
  )
})

/** Cria o pedido com os procedimentos escolhidos e guarda a cópia do que o paciente vai ler. */
rotasAutorizacoes.post('/', exigir('prontuario.editar'), async (req, res) => {
  const b = lerCorpo(AutorizacaoDto, req.body, res, null)
  if (!b) return
  const paciente = await db.pessoa.findFirst({
    where: { id: b.pacienteId, tipo: 'PACIENTE', excluidoEm: null },
  })
  if (!paciente) return res.status(404).json({ erro: 'Paciente não encontrado.' })
  const ids = (origem: string) => b.itens.filter((i) => i.origem === origem).map((i) => i.id)
  const [clinicos, orcados] = await Promise.all([
    db.procedimentoClinico.findMany({
      where: {
        id: { in: ids('CLINICO') },
        pacienteId: paciente.id,
        excluidoEm: null,
        // Executado também: pode ter sido feito e ainda esperar a assinatura.
        status: { in: ['A_REALIZAR', 'EXECUTADO'] },
      },
      include: { profissional: pessoaCurta },
    }),
    db.itemOrcamento.findMany({
      where: {
        id: { in: ids('ORCAMENTO') },
        orcamento: {
          pacienteId: paciente.id,
          excluidoEm: null,
          status: { in: ['ABERTO', 'APROVADO'] },
        },
      },
      include: { orcamento: { include: { profissional: pessoaCurta } } },
    }),
  ])
  const unicos = new Set(b.itens.map((i) => `${i.origem}-${i.id}`)).size
  if (clinicos.length + orcados.length !== unicos)
    return res
      .status(409)
      .json({ erro: 'Algum procedimento não está mais no plano. Atualize a página.' })
  if ([...clinicos, ...orcados].some((i) => i.autorizacaoId))
    return res
      .status(409)
      .json({ erro: 'Algum procedimento já foi enviado ao paciente. Cancele o pedido antes.' })

  // Um item por procedimento, com os dentes juntos. O texto escrito ao enviar vale mais que
  // a observação gravada.
  const textoDe = (origem: string, id: number, gravado: string | null) => {
    const t = b.itens.find((i) => i.origem === origem && i.id === id)?.texto
    return t === undefined ? gravado : t
  }
  const linhas = [
    ...clinicos.map((c) => ({
      ...c,
      profissional: c.profissional.nome,
      observacaoPaciente: textoDe('CLINICO', c.id, c.observacaoPaciente),
    })),
    ...orcados.map((i) => ({
      ...i,
      profissional: i.orcamento.profissional.nome,
      observacaoPaciente: textoDe('ORCAMENTO', i.id, i.observacaoPaciente),
    })),
  ]
  const itens = new Map<string, ConteudoAutorizacao['itens'][number]>()
  for (const l of linhas) {
    const k = JSON.stringify([l.nome, l.profissional, l.observacaoPaciente])
    const item = itens.get(k) ?? {
      nome: l.nome,
      profissional: l.profissional,
      dentes: [],
      observacaoPaciente: l.observacaoPaciente,
    }
    if (l.dente) item.dentes.push(denteComFaces(l.dente, l.faces))
    itens.set(k, item)
  }
  const conteudo: ConteudoAutorizacao = {
    paciente: paciente.nome,
    termo: TERMO,
    plano: b.plano,
    autor: usuarioDe(res).nome,
    itens: [...itens.values()].map((i) => ({ ...i, dentes: i.dentes.sort() })),
  }
  const a = await db.$transaction(async (tx) => {
    const a = await tx.autorizacao.create({
      data: {
        pacienteId: paciente.id,
        conteudo: conteudo as object,
        token: randomBytes(18).toString('base64url'),
        criadoPorId: usuarioDe(res).id,
      },
    })
    await tx.procedimentoClinico.updateMany({
      where: { id: { in: clinicos.map((c) => c.id) } },
      data: { autorizacaoId: a.id },
    })
    await tx.itemOrcamento.updateMany({
      where: { id: { in: orcados.map((i) => i.id) } },
      data: { autorizacaoId: a.id },
    })
    return a
  })
  res.status(201).json({ id: a.id, link: link(a.token) })
})

/**
 * Planejamento inteiro para assinar: etapas com as datas previstas e todos os procedimentos.
 * Os que ainda não estavam em pedido passam para este; assinado, o que foi enviado trava.
 */
rotasAutorizacoes.post('/ficha', exigir('prontuario.editar'), async (req, res) => {
  const b = lerCorpo(AutorizacaoFichaDto, req.body, res, null)
  if (!b) return
  const f = await db.fichaEspecialidade.findFirst({
    where: { id: b.fichaId, excluidoEm: null },
    include: {
      paciente: { select: { nome: true } },
      profissional: { select: { nome: true } },
      itens: { where: { excluidoEm: null }, orderBy: { id: 'asc' } },
      autorizacoes: { where: { canceladoEm: null, assinadoEm: null }, select: { id: true } },
    },
  })
  if (!f) return res.status(404).json({ erro: 'Planejamento não encontrado.' })
  if (f.autorizacoes.length)
    return res.status(409).json({
      erro: 'Já há um pedido esperando a assinatura do paciente. Cancele-o para enviar outro.',
    })
  if (!f.itens.length)
    return res.status(400).json({ erro: 'Adicione um procedimento antes de enviar.' })

  // Um item por procedimento e data prevista, com os dentes juntos.
  const itens = new Map<string, ConteudoAutorizacao['itens'][number]>()
  for (const i of f.itens) {
    const data = i.data?.toISOString().slice(0, 10) ?? null
    const k = JSON.stringify([i.procedimento, data])
    const item = itens.get(k) ?? {
      nome: i.procedimento,
      profissional: f.profissional.nome,
      dentes: [],
      data,
      observacaoPaciente: b.procedimentos[i.procedimento] ?? null,
    }
    item.dentes.push(denteComFaces(i.dente, i.faces))
    itens.set(k, item)
  }
  const conteudo: ConteudoAutorizacao = {
    paciente: f.paciente.nome,
    termo: TERMO,
    plano: b.plano,
    autor: usuarioDe(res).nome,
    especialidade: f.especialidade,
    etapas: comEtapasFixas(f.etapas as Partial<EtapaFicha>[]).map((e) => ({
      id: e.id,
      nome: e.nome,
      data: e.data,
      comentario: b.etapas[e.id] ?? null,
    })),
    itens: [...itens.values()].map((i) => ({ ...i, dentes: i.dentes.sort() })),
  }
  const a = await db.$transaction(async (tx) => {
    const a = await tx.autorizacao.create({
      data: {
        pacienteId: f.pacienteId,
        fichaId: f.id,
        conteudo: conteudo as object,
        token: randomBytes(18).toString('base64url'),
        criadoPorId: usuarioDe(res).id,
      },
    })
    await tx.itemFichaEspecialidade.updateMany({
      where: { fichaId: f.id, excluidoEm: null, autorizacaoId: null },
      data: { autorizacaoId: a.id },
    })
    return a
  })
  res.status(201).json({ id: a.id, link: link(a.token) })
})

/**
 * Junta pedidos em aberto do mesmo paciente num só: um link e um documento com tudo.
 * Os antigos são cancelados (o link deles para de valer) e os procedimentos passam para o novo.
 */
rotasAutorizacoes.post('/juntar', exigir('prontuario.editar'), async (req, res) => {
  const b = lerCorpo(JuntarAutorizacoesDto, req.body, res, null)
  if (!b) return
  const ids = [...new Set(b.ids)]
  const pedidos = await db.autorizacao.findMany({
    where: { id: { in: ids }, canceladoEm: null, assinadoEm: null },
    orderBy: { id: 'asc' },
  })
  if (
    pedidos.length !== ids.length ||
    new Set(pedidos.map((p) => p.pacienteId)).size !== 1 ||
    pedidos.some((p) => p.fichaId)
  )
    return res
      .status(409)
      .json({ erro: 'Só dá para juntar pedidos em aberto do mesmo paciente. Atualize a página.' })
  const conteudos = pedidos.map((p) => p.conteudo as unknown as ConteudoAutorizacao)
  const conteudo: ConteudoAutorizacao = {
    paciente: conteudos[0].paciente,
    termo: TERMO,
    plano:
      conteudos
        .map((c) => c.plano)
        .filter(Boolean)
        .join('\n\n') || null,
    autor: usuarioDe(res).nome,
    itens: conteudos.flatMap((c) => c.itens),
  }
  const novo = await db
    .$transaction(async (tx) => {
      // Só junta se ninguém assinou um deles no meio do caminho.
      const { count } = await tx.autorizacao.updateMany({
        where: { id: { in: ids }, canceladoEm: null, assinadoEm: null },
        data: { canceladoEm: new Date() },
      })
      if (count !== ids.length) throw new Error('assinado no meio')
      const a = await tx.autorizacao.create({
        data: {
          pacienteId: pedidos[0].pacienteId,
          conteudo: conteudo as object,
          token: randomBytes(18).toString('base64url'),
          criadoPorId: usuarioDe(res).id,
        },
      })
      const de = { autorizacaoId: { in: ids } }
      await tx.procedimentoClinico.updateMany({ where: de, data: { autorizacaoId: a.id } })
      await tx.itemOrcamento.updateMany({ where: de, data: { autorizacaoId: a.id } })
      return a
    })
    .catch(() => null)
  if (!novo) return res.status(409).json({ erro: 'Um dos pedidos acabou de ser assinado.' })
  res.status(201).json({ id: novo.id, link: link(novo.token) })
})

const acharAutorizacao = (req: Request) =>
  db.autorizacao.findFirst({
    where: { id: Number(req.params.id) || 0, canceladoEm: null },
    include: { paciente: pessoaCurta },
  })

/** Cancela o pedido ainda não assinado: o link para de valer e os procedimentos voltam. */
rotasAutorizacoes.post('/:id/cancelar', exigir('prontuario.editar'), async (req, res) => {
  const a = await acharAutorizacao(req)
  if (!a) return res.status(404).json({ erro: 'Pedido não encontrado.' })
  if (a.assinadoEm)
    return res
      .status(409)
      .json({ erro: 'O paciente já assinou: a autorização não pode ser cancelada.' })
  await db.$transaction([
    db.autorizacao.update({ where: { id: a.id }, data: { canceladoEm: new Date() } }),
    ...soltar(a.id),
  ])
  res.json({ ok: true })
})

/** Manda o link por e-mail ou WhatsApp (sem a API do WhatsApp: 501 com o link do WhatsApp Web). */
rotasAutorizacoes.post('/:id/enviar', exigir('agenda.editar'), async (req, res) => {
  const a = await acharAutorizacao(req)
  if (!a) return res.status(404).json({ erro: 'Pedido não encontrado.' })
  const canal = EnviarConfirmacaoDto.parse(req.body ?? {}).canal
  const destino = canal === 'EMAIL' ? a.paciente.email : a.paciente.celular
  if (canal === 'EMAIL' && !destino)
    return res.status(400).json({ erro: 'O paciente não tem e-mail no cadastro.' })
  const clinica = await lerConfig('clinica')
  const nome = a.paciente.nome.split(' ')[0]
  // Já assinado: manda a cópia em PDF.
  const assinado = !!a.assinadoEm
  try {
    res.json(
      await enviar({
        canal,
        tipo: assinado ? 'AUTORIZACAO_ASSINADA' : 'AUTORIZACAO',
        destino: destino ?? '',
        assunto: `Seu plano de tratamento${assinado ? ' assinado' : ''} – ${clinica.nome}`,
        texto: assinado
          ? `Olá, ${nome}! Segue o seu plano de tratamento assinado (PDF): ${linkPdf(a.token)}`
          : mensagem(nome, clinica.nome, a.token),
        usuarioId: usuarioDe(res).id,
      }),
    )
  } catch (e) {
    responderErroEnvio(res, e)
  }
})

// ── Rotas públicas (sem login): a página que o paciente abre no celular ─────
export const rotasAutorizacaoPublica = Router()

const LINK_INVALIDO = { erro: 'Link inválido ou pedido cancelado pela clínica.' }
const peloToken = (token: string) =>
  db.autorizacao.findFirst({
    where: { token, canceladoEm: null },
    include: { paciente: { select: { nome: true } } },
  })

rotasAutorizacaoPublica.get('/:token', async (req, res) => {
  const a = await peloToken(req.params.token)
  if (!a) return res.status(404).json(LINK_INVALIDO)
  const clinica = await lerConfig('clinica')
  res.json({
    // Cabeçalho do documento.
    clinica,
    primeiroNome: a.paciente.nome.split(' ')[0],
    conteudo: a.conteudo,
    criadoEm: a.criadoEm,
    assinadoEm: a.assinadoEm,
    assinanteNome: a.assinanteNome,
    assinatura: a.assinatura,
  })
})

/** PDF para baixar (antes ou depois de assinar). */
rotasAutorizacaoPublica.get('/:token/pdf', async (req, res) => {
  const a = await peloToken(req.params.token)
  if (!a) return res.status(404).json(LINK_INVALIDO)
  const nome = `plano-de-tratamento-${a.id}${a.assinadoEm ? '-assinado' : ''}.pdf`
  res.setHeader('Content-Type', 'application/pdf')
  // ?ver abre no navegador (a ficha); sem ele, baixa (o paciente).
  const modo = 'ver' in req.query ? 'inline' : 'attachment'
  res.setHeader('Content-Disposition', `${modo}; filename="${nome}"`)
  escreverPdf(res, {
    ...a,
    clinica: await lerConfig('clinica'),
    conteudo: a.conteudo as unknown as ConteudoAutorizacao,
  })
})

rotasAutorizacaoPublica.post('/:token', async (req, res) => {
  const a = await peloToken(req.params.token)
  if (!a) return res.status(404).json(LINK_INVALIDO)
  if (a.assinadoEm) return res.status(409).json({ erro: 'Este plano já foi assinado.' })
  const b = lerCorpo(AssinarAutorizacaoDto, req.body, res, null)
  if (!b) return
  // Só assina se ninguém assinou no meio do caminho.
  const { count } = await db.autorizacao.updateMany({
    where: { id: a.id, assinadoEm: null, canceladoEm: null },
    data: {
      assinadoEm: new Date(),
      assinanteNome: b.nome,
      assinatura: b.assinatura,
      ip: req.ip ?? null,
      navegador: String(req.headers['user-agent'] ?? '').slice(0, 300) || null,
    },
  })
  if (!count) return res.status(409).json({ erro: 'Este plano já foi assinado.' })
  res.json({ mensagem: 'Plano assinado. Obrigado!' })
})
