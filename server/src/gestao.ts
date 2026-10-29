// Profissionais, conta corrente e relatórios.
import { Router, type Request } from 'express'
import multer from 'multer'
import sharp from 'sharp'
import { db } from './db'
import { exigir, usuarioDe } from './auth'
import { normalizar } from '../../shared/regras'
import { pode } from '../../shared/permissoes'
import {
  CATEGORIAS,
  CATEGORIA_PADRAO_ENTRADA,
  TIPOS_LANCAMENTO,
  type TipoLancamento,
} from '../../shared/financeiro'
import { acharRelatorio } from '../../shared/relatorios'
import { STATUS } from '../../shared/agenda'
import { GERADORES_FINANCEIRO } from './financeiro'
import { GERADORES_EXTRA } from './relatorios'
import { AtivoDto, LancamentoDto, ProfissionalDto } from '../../shared/dtos'
import { lerCorpo } from './dto'

const dia = (iso: string) => new Date(`${iso}T00:00:00Z`)
const isoDe = (d: Date) => d.toISOString().slice(0, 10)
const id = (req: Request) => Number(req.params.id) || 0

/** Período ?de=&ate= (aaaa-mm-dd); null se inválido. */
function periodo(req: Request) {
  const de = String(req.query.de ?? '')
  const ate = String(req.query.ate ?? de)
  if (isNaN(Date.parse(de)) || isNaN(Date.parse(ate))) return null
  return { gte: dia(de), lte: dia(ate) }
}

// ── Profissionais (F-024) ───────────────────────────────────────────────────
export const rotasProfissionais = Router()

const camposProfissional = {
  id: true,
  nome: true,
  cro: true,
  especialidade: true,
  email: true,
  celular: true,
  corAgenda: true,
  ativo: true,
  fotoEm: true,
} as const

rotasProfissionais.get('/', exigir('profissional.ver'), async (req, res) => {
  const termo = normalizar(String(req.query.busca ?? ''))
  const lista = await db.pessoa.findMany({
    where: {
      tipo: 'PROFISSIONAL',
      excluidoEm: null,
      ...(termo && { nomeBusca: { contains: termo } }),
      ...(req.query.ativos === '1' && { ativo: true }),
    },
    select: camposProfissional,
    // Ativos primeiro; os inativos ficam no fim da lista.
    orderBy: [{ ativo: 'desc' }, { nomeBusca: 'asc' }],
  })
  res.json(lista)
})

rotasProfissionais.post('/', exigir('profissional.editar'), async (req, res) => {
  const d = lerCorpo(ProfissionalDto, req.body, res)
  if (!d) return
  const u = usuarioDe(res)
  const p = await db.pessoa.create({
    data: {
      ...d,
      nomeBusca: normalizar(d.nome),
      tipo: 'PROFISSIONAL',
      criadoPorId: u.id,
      alteradoPorId: u.id,
    },
    select: camposProfissional,
  })
  res.status(201).json(p)
})

const acharProfissional = (req: Request) =>
  db.pessoa.findFirst({ where: { id: id(req), tipo: 'PROFISSIONAL', excluidoEm: null } })

rotasProfissionais.put('/:id', exigir('profissional.editar'), async (req, res) => {
  if (!(await acharProfissional(req)))
    return res.status(404).json({ erro: 'Profissional não encontrado.' })
  const d = lerCorpo(ProfissionalDto, req.body, res)
  if (!d) return
  const p = await db.pessoa.update({
    where: { id: id(req) },
    data: { ...d, nomeBusca: normalizar(d.nome), alteradoPorId: usuarioDe(res).id },
    select: camposProfissional,
  })
  res.json(p)
})

rotasProfissionais.post('/:id/ativo', exigir('profissional.editar'), async (req, res) => {
  if (!(await acharProfissional(req)))
    return res.status(404).json({ erro: 'Profissional não encontrado.' })
  const b = lerCorpo(AtivoDto, req.body, res)
  if (!b) return
  const p = await db.pessoa.update({
    where: { id: id(req) },
    data: { ativo: b.ativo, alteradoPorId: usuarioDe(res).id },
    select: camposProfissional,
  })
  res.json(p)
})

// R-057: exclusão lógica. Só de quem já foi inativado; o histórico (agenda, prontuário) fica.
rotasProfissionais.delete('/:id', exigir('profissional.editar'), async (req, res) => {
  const p = await acharProfissional(req)
  if (!p) return res.status(404).json({ erro: 'Profissional não encontrado.' })
  if (p.ativo)
    return res.status(400).json({ erro: 'Inative o profissional antes de excluir.' })
  await db.pessoa.update({
    where: { id: p.id },
    data: { excluidoEm: new Date(), excluidoPorId: usuarioDe(res).id },
  })
  res.json({ mensagem: 'Profissional excluído.' })
})

// ── Foto do profissional ────────────────────────────────────────────────────
const FOTO_LADO = 400
const FOTO_MAXIMO_MB = 10
const FORMATOS_FOTO = ['jpeg', 'png', 'webp', 'gif', 'tiff']
// Em memória: a foto vai para o banco já tratada, nada fica em disco.
const receberFoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: FOTO_MAXIMO_MB * 1024 * 1024, files: 1 },
}).single('foto')

/**
 * Recebe a foto e o quadrado escolhido na tela (x, y, tamanho em pixels da imagem original):
 * corta o resto, reduz para 400x400 e guarda em WebP.
 */
rotasProfissionais.post(
  '/:id/foto',
  exigir('profissional.editar'),
  (req, res, next) =>
    receberFoto(req, res, (e: unknown) => {
      if (!e) return next()
      const grande = e instanceof multer.MulterError && e.code === 'LIMIT_FILE_SIZE'
      res.status(400).json({
        erro: grande
          ? `A foto pode ter no máximo ${FOTO_MAXIMO_MB} MB.`
          : 'Não foi possível receber a foto.',
      })
    }),
  async (req, res) => {
    if (!(await acharProfissional(req)))
      return res.status(404).json({ erro: 'Profissional não encontrado.' })
    if (!req.file) return res.status(400).json({ erro: 'Escolha uma foto.' })

    const erroImagem = { erro: 'Envie uma imagem JPEG, PNG ou WEBP.' }
    const meta = await sharp(req.file.buffer)
      .metadata()
      .catch(() => null)
    if (!meta?.width || !meta.height || !FORMATOS_FOTO.includes(meta.format ?? ''))
      return res.status(400).json(erroImagem)
    // Foto de celular deitada pelo EXIF: a tela mostrou já em pé, então as medidas trocam.
    const deitada = (meta.orientation ?? 1) >= 5
    const largura = deitada ? meta.height : meta.width
    const altura = deitada ? meta.width : meta.height

    const [x, y, tamanho] = ['x', 'y', 'tamanho'].map((k) => Math.round(Number(req.body?.[k])))
    if (
      ![x, y, tamanho].every(Number.isFinite) ||
      x < 0 ||
      y < 0 ||
      tamanho < 1 ||
      x + tamanho > largura ||
      y + tamanho > altura
    )
      return res.status(400).json({ erro: 'Recorte fora da imagem.' })

    const foto = await sharp(req.file.buffer)
      .rotate() // endireita pelo EXIF antes de cortar
      .extract({ left: x, top: y, width: tamanho, height: tamanho })
      .resize(FOTO_LADO, FOTO_LADO)
      .webp({ quality: 82 })
      .toBuffer()
      .catch(() => null)
    if (!foto) return res.status(400).json(erroImagem)

    const p = await db.pessoa.update({
      where: { id: id(req) },
      data: { foto: new Uint8Array(foto), fotoEm: new Date(), alteradoPorId: usuarioDe(res).id },
      select: camposProfissional,
    })
    res.json(p)
  },
)

rotasProfissionais.get('/:id/foto', exigir('profissional.ver'), async (req, res) => {
  const p = await db.pessoa.findFirst({
    where: { id: id(req), tipo: 'PROFISSIONAL', excluidoEm: null },
    select: { foto: true },
  })
  if (!p?.foto) return res.status(404).json({ erro: 'Sem foto.' })
  // A URL muda a cada foto nova (?v=fotoEm), então pode guardar em cache à vontade.
  res.type('image/webp').set('Cache-Control', 'private, max-age=31536000, immutable')
  res.send(Buffer.from(p.foto))
})

rotasProfissionais.delete('/:id/foto', exigir('profissional.editar'), async (req, res) => {
  if (!(await acharProfissional(req)))
    return res.status(404).json({ erro: 'Profissional não encontrado.' })
  const p = await db.pessoa.update({
    where: { id: id(req) },
    data: { foto: null, fotoEm: null, alteradoPorId: usuarioDe(res).id },
    select: camposProfissional,
  })
  res.json(p)
})

// ── Conta corrente (S-009) ──────────────────────────────────────────────────
export const rotasFinanceiro = Router()

const zerados = () =>
  ({ VENDA: 0, CANCELAMENTO: 0, ENTRADA: 0, SAIDA: 0 }) as Record<TipoLancamento, number>

rotasFinanceiro.get('/lancamentos', exigir('financeiro.ver'), async (req, res) => {
  const data = periodo(req)
  if (!data) return res.status(400).json({ erro: 'Período inválido.' })
  const tipo = String(req.query.tipo ?? '')
  const termo = String(req.query.busca ?? '').trim()
  const lista = await db.lancamento.findMany({
    where: {
      excluidoEm: null,
      data,
      ...(tipo in TIPOS_LANCAMENTO && { tipo: tipo as TipoLancamento }),
      ...(termo && {
        OR: [
          { descricao: { contains: termo, mode: 'insensitive' as const } },
          { forma: { contains: termo, mode: 'insensitive' as const } },
          { paciente: { nomeBusca: { contains: normalizar(termo) } } },
        ],
      }),
    },
    include: {
      paciente: { select: { id: true, nome: true } },
      criadoPor: { select: { nome: true } },
    },
    orderBy: [{ data: 'desc' }, { id: 'desc' }],
  })
  const totais = zerados()
  const dias = new Map<
    string,
    { data: string; totais: ReturnType<typeof zerados>; lancamentos: unknown[] }
  >()
  for (const l of lista) {
    const d = isoDe(l.data)
    if (!dias.has(d)) dias.set(d, { data: d, totais: zerados(), lancamentos: [] })
    const g = dias.get(d)!
    g.totais[l.tipo] += l.valorCentavos
    totais[l.tipo] += l.valorCentavos
    const { excluidoPorId: _e, ...resto } = l
    g.lancamentos.push({ ...resto, data: d })
  }
  res.json({ totais, quantidade: lista.length, dias: [...dias.values()] })
})

rotasFinanceiro.post('/lancamentos', exigir('financeiro.editar'), async (req, res) => {
  const d = lerCorpo(LancamentoDto, req.body, res)
  if (!d) return
  const erros: Record<string, string> = {}
  const categoria = d.categoria ?? (d.tipo === 'ENTRADA' ? CATEGORIA_PADRAO_ENTRADA : null)
  if (categoria && !CATEGORIAS.includes(categoria))
    erros.categoria = 'Conta do plano de contas inválida.'
  const { pacienteId } = d
  if (pacienteId && !(await db.pessoa.findFirst({ where: { id: pacienteId, tipo: 'PACIENTE' } })))
    erros.pacienteId = 'Paciente não encontrado.'
  if (Object.keys(erros).length) return res.status(400).json({ erro: 'Confira os campos.', erros })
  const l = await db.lancamento.create({
    data: {
      data: dia(d.data),
      tipo: d.tipo,
      valorCentavos: d.valorCentavos,
      descricao: d.descricao,
      forma: d.forma,
      categoria,
      pacienteId,
      criadoPorId: usuarioDe(res).id,
    },
  })
  res.status(201).json({ ...l, data: isoDe(l.data) })
})

rotasFinanceiro.delete('/lancamentos/:id', exigir('financeiro.editar'), async (req, res) => {
  const l = await db.lancamento.findFirst({ where: { id: id(req), excluidoEm: null } })
  if (!l) return res.status(404).json({ erro: 'Lançamento não encontrado.' })
  await db.lancamento.update({
    where: { id: l.id },
    data: { excluidoEm: new Date(), excluidoPorId: usuarioDe(res).id },
  })
  res.json({ ok: true })
})

// ── Relatórios ──────────────────────────────────────────────────────────────
export const rotasRelatorios = Router()

type Linhas = (string | number)[][]
const contar = (valores: (string | null | undefined)[], vazio = 'Não informado'): Linhas => {
  const m = new Map<string, number>()
  for (const v of valores) m.set(v || vazio, (m.get(v || vazio) ?? 0) + 1)
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}
const dataBR = (d: Date) => isoDe(d).split('-').reverse().join('/')

export const GERADORES: Record<
  string,
  (p: { gte: Date; lte: Date }) => Promise<{ colunas: string[]; linhas: Linhas }>
> = {
  'agenda-geral': async (data) => {
    const l = await db.agendamento.findMany({
      where: { excluidoEm: null, tipo: 'CONSULTA', data },
      include: { paciente: true, profissional: true },
      orderBy: [{ data: 'asc' }, { inicio: 'asc' }],
    })
    return {
      colunas: ['Data', 'Horário', 'Paciente', 'Profissional', 'Categoria', 'Status'],
      linhas: l.map((a) => [
        dataBR(a.data),
        `${a.inicio}–${a.fim}`,
        a.paciente?.nome ?? '',
        a.profissional.nome,
        a.categoria ?? '',
        STATUS[a.status].rotulo,
      ]),
    }
  },
  'agenda-categoria': async (data) => {
    const l = await db.agendamento.findMany({
      where: { excluidoEm: null, tipo: 'CONSULTA', data },
      select: { categoria: true },
    })
    return {
      colunas: ['Categoria', 'Consultas'],
      linhas: contar(
        l.map((a) => a.categoria),
        'Sem categoria',
      ),
    }
  },
  'agenda-faltas': async (data) => {
    const l = await db.agendamento.findMany({
      where: { excluidoEm: null, status: 'FALTOU', data },
      include: { paciente: true, profissional: true },
      orderBy: { data: 'asc' },
    })
    return {
      colunas: ['Data', 'Horário', 'Paciente', 'Celular', 'Profissional'],
      linhas: l.map((a) => [
        dataBR(a.data),
        a.inicio,
        a.paciente?.nome ?? '',
        a.paciente?.celular ?? '',
        a.profissional.nome,
      ]),
    }
  },
  'agenda-primeira': async (data) => {
    const l = await db.agendamento.findMany({
      where: { excluidoEm: null, primeiraConsulta: true, data },
      include: { paciente: true, profissional: true },
      orderBy: { data: 'asc' },
    })
    return {
      colunas: ['Data', 'Paciente', 'Como conheceu', 'Profissional', 'Status'],
      linhas: l.map((a) => [
        dataBR(a.data),
        a.paciente?.nome ?? '',
        a.paciente?.comoConheceu ?? '',
        a.profissional.nome,
        STATUS[a.status].rotulo,
      ]),
    }
  },
  'pacientes-aniversariantes': async ({ gte, lte }) => {
    const l = await db.pessoa.findMany({
      where: { tipo: 'PACIENTE', excluidoEm: null, ativo: true, nascimento: { not: null } },
    })
    // Compara só mês e dia (mmdd); o período pode virar o ano.
    const md = (d: Date) => isoDe(d).slice(5).replace('-', '')
    const [a, b] = [md(gte), md(lte)]
    const dentro = (x: string) => (a <= b ? x >= a && x <= b : x >= a || x <= b)
    return {
      colunas: ['Dia', 'Paciente', 'Celular', 'E-mail'],
      linhas: l
        .filter((p) => dentro(md(p.nascimento!)))
        .sort((x, y) => md(x.nascimento!).localeCompare(md(y.nascimento!)))
        .map((p) => [dataBR(p.nascimento!).slice(0, 5), p.nome, p.celular ?? '', p.email ?? '']),
    }
  },
  'pacientes-faixa': async () => {
    const l = await db.pessoa.findMany({
      where: { tipo: 'PACIENTE', excluidoEm: null },
      select: { nascimento: true },
    })
    const hoje = new Date()
    const faixa = (n: Date | null) => {
      if (!n) return 'Não informado'
      const anos = Math.floor((hoje.getTime() - n.getTime()) / (365.25 * 86_400_000))
      if (anos < 13) return '0 a 12 anos'
      if (anos < 18) return '13 a 17 anos'
      if (anos < 30) return '18 a 29 anos'
      if (anos < 45) return '30 a 44 anos'
      if (anos < 60) return '45 a 59 anos'
      return '60 anos ou mais'
    }
    const ordem = [
      '0 a 12 anos',
      '13 a 17 anos',
      '18 a 29 anos',
      '30 a 44 anos',
      '45 a 59 anos',
      '60 anos ou mais',
      'Não informado',
    ]
    const linhas = contar(l.map((p) => faixa(p.nascimento)))
    return {
      colunas: ['Faixa etária', 'Pacientes'],
      linhas: linhas.sort((x, y) => ordem.indexOf(String(x[0])) - ordem.indexOf(String(y[0]))),
    }
  },
  'pacientes-origem': async (data) => {
    const l = await db.pessoa.findMany({
      where: {
        tipo: 'PACIENTE',
        excluidoEm: null,
        criadoEm: { gte: data.gte, lt: new Date(data.lte.getTime() + 86_400_000) },
      },
      select: { comoConheceu: true },
    })
    return {
      colunas: ['Como conheceu', 'Pacientes cadastrados'],
      linhas: contar(l.map((p) => p.comoConheceu)),
    }
  },
  'pacientes-ultimo': async () => {
    const l = await db.pessoa.findMany({
      where: { tipo: 'PACIENTE', excluidoEm: null, ativo: true },
      include: {
        consultas: {
          where: { excluidoEm: null },
          orderBy: { data: 'desc' },
          take: 1,
          include: { profissional: true },
        },
      },
      orderBy: { nomeBusca: 'asc' },
    })
    return {
      colunas: ['Paciente', 'Celular', 'Último agendamento', 'Profissional'],
      linhas: l.map((p) => [
        p.nome,
        p.celular ?? '',
        p.consultas[0] ? dataBR(p.consultas[0].data) : 'Nunca',
        p.consultas[0]?.profissional.nome ?? '',
      ]),
    }
  },
  'financeiro-resumo': async (data) => {
    const l = await db.lancamento.groupBy({
      by: ['tipo'],
      where: { excluidoEm: null, data },
      _sum: { valorCentavos: true },
      _count: true,
    })
    return {
      colunas: ['Tipo', 'Lançamentos', 'Total (R$)'],
      linhas: (Object.keys(TIPOS_LANCAMENTO) as TipoLancamento[]).map((t) => {
        const g = l.find((x) => x.tipo === t)
        return [
          TIPOS_LANCAMENTO[t],
          g?._count ?? 0,
          ((g?._sum.valorCentavos ?? 0) / 100).toFixed(2).replace('.', ','),
        ]
      }),
    }
  },
  'financeiro-formas': async (data) => {
    const l = await db.lancamento.groupBy({
      by: ['forma'],
      where: { excluidoEm: null, tipo: 'ENTRADA', data },
      _sum: { valorCentavos: true },
    })
    return {
      colunas: ['Forma de pagamento', 'Total (R$)'],
      linhas: l
        .sort((a, b) => (b._sum.valorCentavos ?? 0) - (a._sum.valorCentavos ?? 0))
        .map((g) => [
          g.forma ?? 'Não informada',
          ((g._sum.valorCentavos ?? 0) / 100).toFixed(2).replace('.', ','),
        ]),
    }
  },
  'geral-acessos': async (data) => {
    const l = await db.logAcesso.findMany({
      where: { em: { gte: data.gte, lt: new Date(data.lte.getTime() + 86_400_000) } },
      include: { usuario: { select: { nome: true } } },
    })
    const m = new Map<string, { acessos: number; fichas: Set<number> }>()
    for (const a of l) {
      const g = m.get(a.usuario.nome) ?? { acessos: 0, fichas: new Set() }
      g.acessos++
      g.fichas.add(a.pessoaId)
      m.set(a.usuario.nome, g)
    }
    return {
      colunas: ['Usuário', 'Acessos', 'Fichas diferentes'],
      linhas: [...m]
        .sort((a, b) => b[1].acessos - a[1].acessos)
        .map(([nome, g]) => [nome, g.acessos, g.fichas.size]),
    }
  },
}

rotasRelatorios.get('/:id', async (req, res) => {
  const r = acharRelatorio(req.params.id)
  const gerar =
    GERADORES[req.params.id] ??
    GERADORES_FINANCEIRO[req.params.id] ??
    GERADORES_EXTRA[req.params.id]
  if (!r || !gerar) return res.status(404).json({ erro: 'Relatório não encontrado.' })
  if (!pode(usuarioDe(res).perfis, r.permissao))
    return res.status(403).json({ erro: 'Sem permissão para este relatório.' })
  const data = periodo(req)
  if (!data) return res.status(400).json({ erro: 'Período inválido.' })
  res.json({ titulo: r.titulo, grupo: r.grupo, ...(await gerar(data)) })
})
