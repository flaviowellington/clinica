// Abas da ficha do paciente (screens/S-003, rules/prontuario.md).
// Nada do prontuário é apagado de verdade, e cada alteração guarda o valor antigo (BR-003).
import express, { Router, type Request, type Response } from 'express'
import { db } from './db'
import { exigir, usuarioDe } from './auth'
import { pode, type Acao } from '../../shared/permissoes'
import { hojeNaClinica, normalizar } from '../../shared/regras'
import {
  DENTES_VALIDOS,
  MODELOS_DOCUMENTO,
  alertasDaAnamnese,
  faltandoObrigatorias,
  lerPerguntas,
  normalizarFaces,
  type Pergunta,
} from '../../shared/prontuario'
import type { CategoriaArquivo } from './generated/prisma/client'
import {
  AnamneseDto,
  ArquivoDto,
  DocumentoDto,
  FichaEspecialidadeDto,
  ItemFichaDto,
  NotaDto,
  ProcedimentoClinicoDto,
  StatusItemFichaDto,
  TextoDocumentoDto,
} from '../../shared/dtos'
import { lerCorpo } from './dto'

const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const dia = (iso: string) => new Date(`${iso}T00:00:00Z`)
const isoDe = (d: Date) => d.toISOString().slice(0, 10)
const id = (req: Request) => Number(req.params.id) || 0
const pacienteDe = (res: Response) => res.locals.pacienteId as number
const ERRO_CAMPOS = 'Confira os campos.'

/** BR-003: grava o registro como estava antes de alterar ou excluir. */
const guardarAntes = (tabela: string, antes: { id: number }, usuarioId: number) =>
  db.alteracao.create({
    data: { tabela, registroId: antes.id, antes: JSON.parse(JSON.stringify(antes)), usuarioId },
  })

const ehProfissional = async (pid: number) =>
  !!(await db.pessoa.findFirst({ where: { id: pid, tipo: 'PROFISSIONAL', excluidoEm: null } }))

const pessoaCurta = { select: { id: true, nome: true } } as const

// ── Rotas por paciente: /api/pacientes/:id/... ──────────────────────────────
export const rotasFichaPaciente = Router()

// Toda rota daqui exige um paciente que não está na lixeira.
rotasFichaPaciente.param('id', async (req, res, next) => {
  const p = await db.pessoa.findFirst({
    where: { id: id(req), tipo: 'PACIENTE', excluidoEm: null },
    select: { id: true },
  })
  if (!p) return res.status(404).json({ erro: 'Paciente não encontrado.' })
  res.locals.pacienteId = p.id
  next()
})

// ── Visão geral e notas ─────────────────────────────────────────────────────
rotasFichaPaciente.get('/:id/resumo', exigir('paciente.ver'), async (_req, res) => {
  const pacienteId = pacienteDe(res)
  const perfis = usuarioDe(res).perfis
  const [proxima, retornos, orcamentos, notas, anamnese] = await Promise.all([
    db.agendamento.findFirst({
      where: {
        pacienteId,
        excluidoEm: null,
        desmarcadoEm: null,
        data: { gte: dia(hojeNaClinica()) },
      },
      include: { profissional: pessoaCurta },
      orderBy: [{ data: 'asc' }, { inicio: 'asc' }],
    }),
    db.alertaRetorno.findMany({
      where: { pacienteId, excluidoEm: null, concluidoEm: null },
      include: { profissional: pessoaCurta },
      orderBy: { data: 'asc' },
    }),
    db.orcamento.findMany({
      where: { pacienteId, status: 'ABERTO', excluidoEm: null },
      include: { itens: { select: { valorCentavos: true } } },
    }),
    db.nota.findMany({
      where: { pacienteId },
      include: { criadoPor: { select: { nome: true } } },
      orderBy: { id: 'desc' },
    }),
    pode(perfis, 'anamnese.ver')
      ? db.anamnese.findFirst({ where: { pacienteId, excluidoEm: null }, orderBy: { id: 'desc' } })
      : null,
  ])
  res.json({
    proximaConsulta: proxima && { ...proxima, data: isoDe(proxima.data) },
    retornos: retornos.map((r) => ({ ...r, data: isoDe(r.data) })),
    orcamentosAbertos: orcamentos.map((o) => ({
      id: o.id,
      totalCentavos: o.itens.reduce((s, i) => s + i.valorCentavos, 0) - o.descontoCentavos,
    })),
    notas,
    anamnese: anamnese && {
      id: anamnese.id,
      criadoEm: anamnese.criadoEm,
      alertas: alertasDaAnamnese(anamnese.perguntas as unknown as Pergunta[]),
    },
  })
})

rotasFichaPaciente.post('/:id/notas', exigir('paciente.editar'), async (req, res) => {
  const b = lerCorpo(NotaDto, req.body, res, null)
  if (!b) return
  const n = await db.nota.create({
    data: { pacienteId: pacienteDe(res), texto: b.texto, criadoPorId: usuarioDe(res).id },
    include: { criadoPor: { select: { nome: true } } },
  })
  res.status(201).json(n)
})

// ── Anamnese (R-058, R-059, R-074, R-075) ───────────────────────────────────
const OBRIGATORIAS = 'Preencha todas as respostas obrigatórias antes de continuar.'

/** Valida as perguntas; devolve o erro pronto para a resposta ou as perguntas limpas. */
function validarAnamnese(bruto: unknown) {
  const perguntas = lerPerguntas(bruto)
  if (!perguntas) return { erro: { erro: 'Anamnese inválida.' } }
  const faltando = faltandoObrigatorias(perguntas)
  if (faltando.length)
    return {
      erro: {
        erro: OBRIGATORIAS,
        erros: Object.fromEntries(faltando.map((i) => [i, 'Preenchimento obrigatório'])),
      },
    }
  return { perguntas }
}

const comAutor = { criadoPor: { select: { nome: true } } } as const

rotasFichaPaciente.get('/:id/anamneses', exigir('anamnese.ver'), async (_req, res) => {
  const lista = await db.anamnese.findMany({
    where: { pacienteId: pacienteDe(res), excluidoEm: null },
    include: comAutor,
    orderBy: { id: 'desc' },
  })
  res.json(lista.map((a, i) => ({ ...a, atual: i === 0 })))
})

rotasFichaPaciente.get('/:id/alertas', exigir('anamnese.ver'), async (_req, res) => {
  const a = await db.anamnese.findFirst({
    where: { pacienteId: pacienteDe(res), excluidoEm: null },
    orderBy: { id: 'desc' },
  })
  res.json(a ? alertasDaAnamnese(a.perguntas as unknown as Pergunta[]) : [])
})

rotasFichaPaciente.post('/:id/anamneses', exigir('prontuario.editar'), async (req, res) => {
  const b = lerCorpo(AnamneseDto, req.body, res)
  if (!b) return
  const v = validarAnamnese(b.perguntas)
  if (v.erro) return res.status(400).json(v.erro)
  const a = await db.anamnese.create({
    data: {
      pacienteId: pacienteDe(res),
      respondente: b.respondente,
      perguntas: v.perguntas as object[],
      observacoes: b.observacoes,
      criadoPorId: usuarioDe(res).id,
    },
    include: comAutor,
  })
  res.status(201).json({ ...a, atual: true })
})

// ── Odontograma, plano e ficha clínica (R-019, R-061, R-069, R-078) ─────────
rotasFichaPaciente.get('/:id/procedimentos', exigir('prontuario.ver'), async (_req, res) => {
  const pacienteId = pacienteDe(res)
  const [clinicos, itens] = await Promise.all([
    db.procedimentoClinico.findMany({
      where: { pacienteId, excluidoEm: null },
      include: { profissional: pessoaCurta },
    }),
    // Em aberto ou aprovado: tudo; cancelado: só o que chegou a ser feito; excluído: nada.
    db.itemOrcamento.findMany({
      where: {
        orcamento: { pacienteId, excluidoEm: null },
        OR: [
          { orcamento: { status: { in: ['ABERTO', 'APROVADO'] } } },
          { executadoEm: { not: null } },
        ],
      },
      include: { orcamento: { include: { profissional: pessoaCurta } } },
    }),
  ])
  const lista = [
    ...clinicos.map((c) => ({
      origem: 'CLINICO' as const,
      id: c.id,
      procedimentoId: c.procedimentoId,
      nome: c.nome,
      dente: c.dente,
      faces: c.faces,
      status: c.status as 'EXECUTADO' | 'EXISTENTE' | 'A_REALIZAR',
      data: isoDe(c.data),
      profissional: c.profissional,
      observacao: c.observacao,
      observacaoPaciente: c.observacaoPaciente,
      orcamentoId: null as number | null,
      orcamentoStatus: null as string | null,
      valorCentavos: null as number | null,
    })),
    ...itens.map((i) => ({
      origem: 'ORCAMENTO' as const,
      id: i.id,
      procedimentoId: i.procedimentoId,
      nome: i.nome,
      dente: i.dente,
      faces: i.faces,
      status: i.executadoEm ? ('EXECUTADO' as const) : ('A_REALIZAR' as const),
      data: isoDe(i.executadoEm ?? i.orcamento.aprovadoEm ?? i.orcamento.criadoEm),
      profissional: i.orcamento.profissional,
      observacao: null,
      observacaoPaciente: null,
      orcamentoId: i.orcamentoId,
      orcamentoStatus: i.orcamento.status as string | null,
      valorCentavos: i.valorCentavos as number | null,
    })),
  ]
  lista.sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id)
  res.json(lista)
})

/** Lê o procedimento pelo DTO; o nome vem da tabela e o profissional precisa existir. */
async function lerProcedimento(corpo: unknown, res: Response) {
  const d = lerCorpo(ProcedimentoClinicoDto, corpo, res)
  if (!d) return
  const tabela = d.procedimentoId
    ? await db.procedimento.findUnique({ where: { id: d.procedimentoId } })
    : null
  const nome = tabela?.nome ?? d.nome
  const erros: Record<string, string> = {}
  if (!nome) erros.procedimentoId = 'Escolha o procedimento.'
  if (!(await ehProfissional(d.profissionalId))) erros.profissionalId = 'Escolha o profissional.'
  if (Object.keys(erros).length) {
    res.status(400).json({ erro: ERRO_CAMPOS, erros })
    return
  }
  return {
    ...d,
    procedimentoId: tabela?.id ?? null,
    nome: nome!,
    faces: d.dente ? normalizarFaces(d.faces) || null : null,
    data: dia(d.data ?? hojeNaClinica()),
  }
}

rotasFichaPaciente.post('/:id/procedimentos', exigir('prontuario.editar'), async (req, res) => {
  const lido = await lerProcedimento(req.body, res)
  if (!lido) return
  const { dentes, ...dados } = lido
  const comum = { ...dados, pacienteId: pacienteDe(res), criadoPorId: usuarioDe(res).id }
  // Vários dentes: um registro por dente, todos ou nenhum.
  const criados = await db.$transaction(
    (dentes?.length
      ? dentes.map((d) => ({ ...comum, dente: d.dente, faces: normalizarFaces(d.faces) || null }))
      : [comum]
    ).map((data) => db.procedimentoClinico.create({ data })),
  )
  // ponytail: responde só o primeiro; ninguém usa a lista ainda.
  res.status(201).json({ ...criados[0], data: isoDe(criados[0].data) })
})

// ── Odontograma: dente sem coroa e dente removido ───────────────────────────
rotasFichaPaciente.get('/:id/odontograma', exigir('prontuario.ver'), async (_req, res) => {
  const p = await db.pessoa.findUniqueOrThrow({ where: { id: pacienteDe(res) } })
  res.json({ semCoroa: p.dentesSemCoroa, removidos: p.dentesRemovidos })
})

rotasFichaPaciente.put('/:id/odontograma', exigir('prontuario.editar'), async (req, res) => {
  const lista = (v: unknown) =>
    Array.isArray(v) && v.every((d) => DENTES_VALIDOS.has(d)) ? [...new Set(v as string[])] : null
  const semCoroa = lista(req.body?.semCoroa)
  const removidos = lista(req.body?.removidos)
  if (!semCoroa || !removidos) return res.status(400).json({ erro: 'Dente inválido.' })
  await db.pessoa.update({
    where: { id: pacienteDe(res) },
    data: { dentesSemCoroa: semCoroa, dentesRemovidos: removidos },
  })
  res.json({ semCoroa, removidos })
})

// ── Fichas de especialidade (R-068) ─────────────────────────────────────────
const comItens = {
  itens: { where: { excluidoEm: null }, orderBy: { id: 'asc' } },
  profissional: pessoaCurta,
} as const

rotasFichaPaciente.get('/:id/fichas', exigir('prontuario.ver'), async (_req, res) => {
  res.json(
    await db.fichaEspecialidade.findMany({
      where: { pacienteId: pacienteDe(res), excluidoEm: null },
      include: comItens,
      orderBy: { id: 'desc' },
    }),
  )
})

rotasFichaPaciente.post('/:id/fichas', exigir('prontuario.editar'), async (req, res) => {
  const b = lerCorpo(FichaEspecialidadeDto, req.body, res)
  if (!b) return
  if (!(await ehProfissional(b.profissionalId)))
    return res
      .status(400)
      .json({ erro: ERRO_CAMPOS, erros: { profissionalId: 'Escolha o profissional.' } })
  const f = await db.fichaEspecialidade.create({
    data: {
      ...b,
      pacienteId: pacienteDe(res),
      criadoPorId: usuarioDe(res).id,
    },
    include: comItens,
  })
  res.status(201).json(f)
})

// ── Fotos e exames (R-076, R-077) ───────────────────────────────────────────
/** Tipos aceitos e a assinatura (primeiros bytes) que o arquivo precisa ter. */
const ASSINATURAS: Record<string, (b: Buffer) => boolean> = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
  'image/gif': (b) => b.subarray(0, 4).toString('latin1') === 'GIF8',
  'image/webp': (b) =>
    b.subarray(0, 4).toString('latin1') === 'RIFF' &&
    b.subarray(8, 12).toString('latin1') === 'WEBP',
  'image/bmp': (b) => b.subarray(0, 2).toString('latin1') === 'BM',
  'application/pdf': (b) => b.subarray(0, 4).toString('latin1') === '%PDF',
}
const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp']
const TAMANHO_MAXIMO = '15mb'

const categoriaDe = (v: unknown): CategoriaArquivo => (v === 'EXAME' ? 'EXAME' : 'FOTO')
const podeVer = (perfis: Parameters<typeof pode>[0], c: CategoriaArquivo) =>
  pode(perfis, (c === 'FOTO' ? 'fotos.ver' : 'prontuario.ver') satisfies Acao)
const SEM_PERMISSAO = { erro: 'Você não tem permissão para esta ação.' }

const semDados = {
  id: true,
  categoria: true,
  pasta: true,
  nome: true,
  tipo: true,
  tamanho: true,
  rotacao: true,
  espelhado: true,
  criadoEm: true,
  criadoPor: { select: { nome: true } },
} as const

rotasFichaPaciente.get('/:id/arquivos', async (req, res) => {
  const categoria = categoriaDe(req.query.categoria)
  if (!podeVer(usuarioDe(res).perfis, categoria)) return res.status(403).json(SEM_PERMISSAO)
  res.json(
    await db.arquivo.findMany({
      where: { pacienteId: pacienteDe(res), categoria, excluidoEm: null },
      select: semDados,
      orderBy: { id: 'desc' },
    }),
  )
})

rotasFichaPaciente.post(
  '/:id/arquivos',
  exigir('prontuario.editar'),
  express.raw({ type: () => true, limit: TAMANHO_MAXIMO }),
  async (req, res) => {
    const categoria = categoriaDe(req.query.categoria)
    const tipo = String(req.headers['content-type'] ?? '')
      .split(';')[0]
      .trim()
    const aceitos = categoria === 'FOTO' ? TIPOS_FOTO : [...TIPOS_FOTO, 'application/pdf']
    const dados = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
    if (!aceitos.includes(tipo))
      return res.status(400).json({
        erro:
          categoria === 'FOTO'
            ? 'Envie uma imagem JPEG, PNG, WEBP, BMP ou GIF.'
            : 'Envie uma imagem ou um PDF.',
      })
    // O tipo vem do navegador; confere os bytes para não guardar outra coisa disfarçada.
    if (!dados.length || !ASSINATURAS[tipo](dados))
      return res.status(400).json({ erro: 'O arquivo não é do tipo informado.' })
    const a = await db.arquivo.create({
      data: {
        pacienteId: pacienteDe(res),
        categoria,
        pasta: texto(req.query.pasta)?.slice(0, 80),
        nome: texto(req.query.nome)?.slice(0, 200) ?? 'arquivo',
        tipo,
        tamanho: dados.length,
        dados: new Uint8Array(dados),
        criadoPorId: usuarioDe(res).id,
      },
      select: semDados,
    })
    res.status(201).json(a)
  },
)

// ── Documentos (R-062) ──────────────────────────────────────────────────────
const comPessoasDoc = {
  profissional: { select: { id: true, nome: true, cro: true } },
  paciente: { select: { id: true, nome: true, cpf: true } },
  criadoPor: { select: { nome: true } },
} as const

rotasFichaPaciente.get('/:id/documentos', exigir('prontuario.ver'), async (_req, res) => {
  res.json(
    await db.documento.findMany({
      where: { pacienteId: pacienteDe(res), excluidoEm: null },
      include: comPessoasDoc,
      orderBy: { id: 'desc' },
    }),
  )
})

rotasFichaPaciente.post('/:id/documentos', exigir('prontuario.editar'), async (req, res) => {
  const b = lerCorpo(DocumentoDto, req.body, res)
  if (!b) return
  if (b.profissionalId && !(await ehProfissional(b.profissionalId)))
    return res
      .status(400)
      .json({ erro: ERRO_CAMPOS, erros: { profissionalId: 'Profissional não encontrado.' } })
  const d = await db.documento.create({
    data: {
      ...b,
      pacienteId: pacienteDe(res),
      titulo: MODELOS_DOCUMENTO[b.modelo].titulo,
      criadoPorId: usuarioDe(res).id,
    },
    include: comPessoasDoc,
  })
  res.status(201).json(d)
})

// ── Financeiro, agendamentos e indicações do paciente ───────────────────────
rotasFichaPaciente.get('/:id/financeiro', exigir('financeiro.paciente'), async (_req, res) => {
  const pacienteId = pacienteDe(res)
  const [contas, lancamentos] = await Promise.all([
    db.contaFinanceira.findMany({
      where: { pacienteId, tipo: 'RECEBER' },
      orderBy: [{ vencimento: 'asc' }, { id: 'asc' }],
    }),
    db.lancamento.findMany({
      where: { pacienteId, excluidoEm: null },
      include: { criadoPor: { select: { nome: true } } },
      orderBy: [{ data: 'desc' }, { id: 'desc' }],
    }),
  ])
  // Saldo: o que pagou menos o que comprou (negativo = deve).
  const sinal = { ENTRADA: 1, CANCELAMENTO: 1, VENDA: -1, SAIDA: -1 } as const
  res.json({
    contas: contas.map((c) => ({
      ...c,
      vencimento: isoDe(c.vencimento),
      pagoEm: c.pagoEm && isoDe(c.pagoEm),
    })),
    lancamentos: lancamentos.map(({ excluidoPorId: _e, ...l }) => ({ ...l, data: isoDe(l.data) })),
    saldoCentavos: lancamentos.reduce((s, l) => s + sinal[l.tipo] * l.valorCentavos, 0),
  })
})

rotasFichaPaciente.get('/:id/agendamentos', exigir('agenda.ver'), async (_req, res) => {
  const lista = await db.agendamento.findMany({
    where: { pacienteId: pacienteDe(res), excluidoEm: null },
    include: { profissional: pessoaCurta },
    orderBy: [{ data: 'desc' }, { inicio: 'desc' }],
  })
  res.json(lista.map(({ excluidoPorId: _e, ...a }) => ({ ...a, data: isoDe(a.data) })))
})

/** "Indicado por" é texto livre: compara o nome sem acento nem maiúsculas. */
rotasFichaPaciente.get('/:id/indicacoes', exigir('paciente.ver'), async (_req, res) => {
  const p = await db.pessoa.findUniqueOrThrow({ where: { id: pacienteDe(res) } })
  const [candidatos, quemIndicou] = await Promise.all([
    db.pessoa.findMany({
      where: {
        tipo: 'PACIENTE',
        excluidoEm: null,
        id: { not: p.id },
        indicadoPor: { contains: p.nome.split(' ')[0], mode: 'insensitive' },
      },
      select: { id: true, nome: true, indicadoPor: true, criadoEm: true },
      orderBy: { criadoEm: 'desc' },
    }),
    p.indicadoPor
      ? db.pessoa.findFirst({
          where: { tipo: 'PACIENTE', excluidoEm: null, nomeBusca: normalizar(p.indicadoPor) },
          select: { id: true, nome: true },
        })
      : null,
  ])
  res.json({
    indicadoPor: p.indicadoPor,
    quemIndicou,
    indicados: candidatos.filter((c) => normalizar(c.indicadoPor ?? '') === p.nomeBusca),
  })
})

// ── Rotas por registro: /api/prontuario/... ─────────────────────────────────
export const rotasProntuario = Router()

const NAO_ACHOU = { erro: 'Registro não encontrado.' }

rotasProntuario.put('/anamneses/:id', exigir('prontuario.editar'), async (req, res) => {
  const a = await db.anamnese.findFirst({ where: { id: id(req), excluidoEm: null } })
  if (!a) return res.status(404).json(NAO_ACHOU)
  const b = lerCorpo(AnamneseDto, req.body, res)
  if (!b) return
  const v = validarAnamnese(b.perguntas)
  if (v.erro) return res.status(400).json(v.erro)
  const u = usuarioDe(res)
  const [, nova] = await db.$transaction([
    guardarAntes('Anamnese', a, u.id),
    db.anamnese.update({
      where: { id: a.id },
      data: {
        perguntas: v.perguntas as object[],
        observacoes: b.observacoes,
      },
      include: comAutor,
    }),
  ])
  res.json(nova)
})

rotasProntuario.put('/procedimentos/:id', exigir('prontuario.editar'), async (req, res) => {
  const c = await db.procedimentoClinico.findFirst({ where: { id: id(req), excluidoEm: null } })
  if (!c) return res.status(404).json(NAO_ACHOU)
  const dados = await lerProcedimento(
    { procedimentoId: c.procedimentoId, nome: c.nome, data: isoDe(c.data), ...req.body },
    res,
  )
  if (!dados) return
  // Editar é sempre um dente só.
  delete dados.dentes
  const [, novo] = await db.$transaction([
    guardarAntes('ProcedimentoClinico', c, usuarioDe(res).id),
    db.procedimentoClinico.update({ where: { id: c.id }, data: dados }),
  ])
  res.json({ ...novo, data: isoDe(novo.data) })
})

rotasProntuario.delete('/procedimentos/:id', exigir('prontuario.editar'), async (req, res) => {
  const c = await db.procedimentoClinico.findFirst({ where: { id: id(req), excluidoEm: null } })
  if (!c) return res.status(404).json(NAO_ACHOU)
  const u = usuarioDe(res)
  await db.$transaction([
    guardarAntes('ProcedimentoClinico', c, u.id),
    db.procedimentoClinico.update({
      where: { id: c.id },
      data: { excluidoEm: new Date(), excluidoPorId: u.id },
    }),
  ])
  res.json({ ok: true })
})

rotasProntuario.post('/fichas/:id/itens', exigir('prontuario.editar'), async (req, res) => {
  const f = await db.fichaEspecialidade.findFirst({ where: { id: id(req), excluidoEm: null } })
  if (!f) return res.status(404).json(NAO_ACHOU)
  const b = lerCorpo(ItemFichaDto, req.body, res)
  if (!b) return
  const i = await db.itemFichaEspecialidade.create({ data: { ...b, fichaId: f.id } })
  res.status(201).json(i)
})

rotasProntuario.patch('/fichas/itens/:id', exigir('prontuario.editar'), async (req, res) => {
  const i = await db.itemFichaEspecialidade.findFirst({ where: { id: id(req), excluidoEm: null } })
  if (!i) return res.status(404).json(NAO_ACHOU)
  const b = lerCorpo(StatusItemFichaDto, req.body, res, null)
  if (!b) return
  const status = b.status ?? i.status
  const [, novo] = await db.$transaction([
    guardarAntes('ItemFichaEspecialidade', i, usuarioDe(res).id),
    db.itemFichaEspecialidade.update({ where: { id: i.id }, data: { status } }),
  ])
  res.json(novo)
})

rotasProntuario.delete('/fichas/itens/:id', exigir('prontuario.editar'), async (req, res) => {
  const i = await db.itemFichaEspecialidade.findFirst({ where: { id: id(req), excluidoEm: null } })
  if (!i) return res.status(404).json(NAO_ACHOU)
  await db.$transaction([
    guardarAntes('ItemFichaEspecialidade', i, usuarioDe(res).id),
    db.itemFichaEspecialidade.update({ where: { id: i.id }, data: { excluidoEm: new Date() } }),
  ])
  res.json({ ok: true })
})

const acharArquivo = (req: Request) =>
  db.arquivo.findFirst({
    where: { id: id(req), excluidoEm: null },
    select: { ...semDados, dados: false },
  })

rotasProntuario.get('/arquivos/:id/conteudo', async (req, res) => {
  const a = await db.arquivo.findFirst({ where: { id: id(req), excluidoEm: null } })
  if (!a) return res.status(404).json(NAO_ACHOU)
  if (!podeVer(usuarioDe(res).perfis, a.categoria)) return res.status(403).json(SEM_PERMISSAO)
  res.set({
    'Cache-Control': 'private, no-store',
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(a.nome)}`,
  })
  res.type(a.tipo).send(Buffer.from(a.dados))
})

/** R-077: girar ou espelhar grava na hora. */
rotasProntuario.patch('/arquivos/:id', exigir('prontuario.editar'), async (req, res) => {
  const a = await acharArquivo(req)
  if (!a) return res.status(404).json(NAO_ACHOU)
  const b = lerCorpo(ArquivoDto, req.body, res, null)
  if (!b) return
  const novo = await db.arquivo.update({
    where: { id: a.id },
    data: { rotacao: b.rotacao ?? a.rotacao, espelhado: b.espelhado ?? a.espelhado },
    select: semDados,
  })
  res.json(novo)
})

/** Sai da lista, mas o arquivo fica guardado (BR-003). */
rotasProntuario.delete('/arquivos/:id', exigir('prontuario.editar'), async (req, res) => {
  const a = await acharArquivo(req)
  if (!a) return res.status(404).json(NAO_ACHOU)
  await db.arquivo.update({
    where: { id: a.id },
    data: { excluidoEm: new Date(), excluidoPorId: usuarioDe(res).id },
  })
  res.json({ ok: true })
})

rotasProntuario.get('/documentos/:id', exigir('prontuario.ver'), async (req, res) => {
  const d = await db.documento.findFirst({
    where: { id: id(req), excluidoEm: null },
    include: comPessoasDoc,
  })
  if (!d) return res.status(404).json(NAO_ACHOU)
  res.json(d)
})

rotasProntuario.put('/documentos/:id', exigir('prontuario.editar'), async (req, res) => {
  const d = await db.documento.findFirst({ where: { id: id(req), excluidoEm: null } })
  if (!d) return res.status(404).json(NAO_ACHOU)
  const b = lerCorpo(TextoDocumentoDto, req.body, res, null)
  if (!b) return
  const [, novo] = await db.$transaction([
    guardarAntes('Documento', d, usuarioDe(res).id),
    db.documento.update({ where: { id: d.id }, data: { texto: b.texto }, include: comPessoasDoc }),
  ])
  res.json(novo)
})

rotasProntuario.delete('/documentos/:id', exigir('prontuario.editar'), async (req, res) => {
  const d = await db.documento.findFirst({ where: { id: id(req), excluidoEm: null } })
  if (!d) return res.status(404).json(NAO_ACHOU)
  const u = usuarioDe(res)
  await db.documento.update({
    where: { id: d.id },
    data: { excluidoEm: new Date(), excluidoPorId: u.id },
  })
  res.json({ ok: true })
})
