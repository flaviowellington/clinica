import { Router, type Request } from 'express'
import { db } from './db'
import { exigir, usuarioDe } from './auth'
import {
  MOTIVOS_INATIVACAO,
  normalizar,
  validarPaciente,
  type MotivoInativacao,
} from '../../shared/regras'
import type { Pessoa } from './generated/prisma/client'

const POR_PAGINA = 10
const TAMANHOS = [10, 25, 50]

const CAMPOS = [
  'nome',
  'nascimento',
  'apelido',
  'cpf',
  'rg',
  'sexo',
  'estadoCivil',
  'observacoes',
  'email',
  'celular',
  'telefone',
  'comoConheceu',
  'indicadoPor',
  'nomeMae',
  'nomePai',
  'responsavelNome',
  'responsavelCpf',
  'responsavelParentesco',
] as const

/** Lê só os campos conhecidos do corpo; texto vazio vira null. */
function lerDados(body: Record<string, unknown>) {
  const d = {} as Record<(typeof CAMPOS)[number], string | null>
  for (const c of CAMPOS) {
    const v = typeof body?.[c] === 'string' ? (body[c] as string).trim() : ''
    d[c] = v || null
  }
  if (d.cpf) d.cpf = d.cpf.replace(/\D/g, '')
  if (d.responsavelCpf) d.responsavelCpf = d.responsavelCpf.replace(/\D/g, '')
  return d
}

function paraBanco(d: ReturnType<typeof lerDados>) {
  return {
    ...d,
    nome: d.nome!,
    nomeBusca: normalizar(d.nome!),
    nascimento: new Date(`${d.nascimento}T00:00:00Z`),
  }
}

function paraTela(p: Pessoa) {
  const { nomeBusca: _n, excluidoPorId: _e, ...resto } = p
  return { ...resto, nascimento: p.nascimento?.toISOString().slice(0, 10) ?? null }
}

/** Paciente que não está na lixeira, ou null. */
const acharPaciente = (req: Request) =>
  db.pessoa.findFirst({
    where: { id: Number(req.params.id) || 0, tipo: 'PACIENTE', excluidoEm: null },
  })

const NAO_ACHOU = { erro: 'Paciente não encontrado.' }

export const rotasPacientes = Router()

// Busca em qualquer parte do nome (acha pelo sobrenome); "%" digitado é ignorado.
rotasPacientes.get('/', exigir('paciente.ver'), async (req, res) => {
  const bruto = String(req.query.busca ?? '').trim()
  const termo = normalizar(bruto.replace(/[%_\\]/g, ''))

  const pagina = Math.max(1, Number(req.query.pagina) || 1)
  const porPagina = TAMANHOS.includes(Number(req.query.porPagina))
    ? Number(req.query.porPagina)
    : POR_PAGINA
  // Sem termo, lista todos (paginado).
  const where = {
    tipo: 'PACIENTE' as const,
    excluidoEm: null,
    ...(termo && { nomeBusca: { contains: termo } }),
  }
  const [total, itens] = await Promise.all([
    db.pessoa.count({ where }),
    db.pessoa.findMany({
      where,
      orderBy: { nomeBusca: 'asc' },
      skip: (pagina - 1) * porPagina,
      take: porPagina,
    }),
  ])
  res.json({ total, porPagina, itens: itens.map(paraTela) })
})

rotasPacientes.post('/', exigir('paciente.editar'), async (req, res) => {
  const d = lerDados(req.body)
  const erros = validarPaciente(d)
  if (Object.keys(erros).length) return res.status(400).json({ erro: 'Confira os campos.', erros })

  const quem = usuarioDe(res).id
  const p = await db.pessoa.create({
    data: { ...paraBanco(d), tipo: 'PACIENTE', criadoPorId: quem, alteradoPorId: quem },
  })
  res.status(201).json(paraTela(p))
})

// R-003: abrir a ficha (ou uma aba dela) grava quem abriu.
rotasPacientes.get('/:id', exigir('paciente.ver'), async (req, res) => {
  const p = await acharPaciente(req)
  if (!p) return res.status(404).json(NAO_ACHOU)

  const aba = String(req.query.aba ?? 'visao-geral')
    .replace(/[^a-z-]/g, '')
    .slice(0, 40)
  await db.logAcesso.create({
    data: { usuarioId: usuarioDe(res).id, pessoaId: p.id, caminho: `/pacientes/${p.id}/${aba}` },
  })
  res.json(paraTela(p))
})

// R-067: a edição recebe o cadastro inteiro.
rotasPacientes.put('/:id', exigir('paciente.editar'), async (req, res) => {
  const p = await acharPaciente(req)
  if (!p) return res.status(404).json(NAO_ACHOU)

  const d = lerDados(req.body)
  const erros = validarPaciente(d)
  if (Object.keys(erros).length) return res.status(400).json({ erro: 'Confira os campos.', erros })

  const novo = await db.pessoa.update({
    where: { id: p.id },
    data: { ...paraBanco(d), alteradoPorId: usuarioDe(res).id },
  })
  res.json(paraTela(novo))
})

// R-071: inativar exige motivo; "Outros" exige descrição.
rotasPacientes.post('/:id/inativar', exigir('paciente.inativar'), async (req, res) => {
  const p = await acharPaciente(req)
  if (!p) return res.status(404).json(NAO_ACHOU)

  const motivo = String(req.body?.motivo ?? '')
  const descricao = String(req.body?.descricao ?? '').trim()
  if (!Object.hasOwn(MOTIVOS_INATIVACAO, motivo))
    return res.status(400).json({ erro: 'Escolha o motivo.' })
  if (motivo === 'OUTROS' && !descricao) return res.status(400).json({ erro: 'Descreva o motivo.' })

  const novo = await db.pessoa.update({
    where: { id: p.id },
    data: {
      ativo: false,
      motivoInativacao: motivo as MotivoInativacao,
      motivoInativacaoDescricao: descricao || null,
      alteradoPorId: usuarioDe(res).id,
    },
  })
  res.json(paraTela(novo))
})

rotasPacientes.post('/:id/ativar', exigir('paciente.inativar'), async (req, res) => {
  const p = await acharPaciente(req)
  if (!p) return res.status(404).json(NAO_ACHOU)

  const novo = await db.pessoa.update({
    where: { id: p.id },
    data: {
      ativo: true,
      motivoInativacao: null,
      motivoInativacaoDescricao: null,
      alteradoPorId: usuarioDe(res).id,
    },
  })
  res.json(paraTela(novo))
})

// R-057: exclusão lógica; o paciente vai para a lixeira.
rotasPacientes.delete('/:id', exigir('paciente.excluir'), async (req, res) => {
  const p = await acharPaciente(req)
  if (!p) return res.status(404).json(NAO_ACHOU)

  await db.pessoa.update({
    where: { id: p.id },
    data: { excluidoEm: new Date(), excluidoPorId: usuarioDe(res).id },
  })
  res.json({ mensagem: 'Paciente excluído com sucesso.' })
})

// R-050: lixeira, só para quem pode restaurar.
export const rotasLixeira = Router()

rotasLixeira.get('/pacientes', exigir('lixeira.restaurar'), async (_req, res) => {
  const itens = await db.pessoa.findMany({
    where: { tipo: 'PACIENTE', excluidoEm: { not: null } },
    orderBy: { excluidoEm: 'desc' },
    take: 200,
  })
  res.json(itens.map(paraTela))
})

rotasLixeira.post('/pacientes/:id/restaurar', exigir('lixeira.restaurar'), async (req, res) => {
  const { count } = await db.pessoa.updateMany({
    where: { id: Number(req.params.id) || 0, tipo: 'PACIENTE', excluidoEm: { not: null } },
    data: { excluidoEm: null, excluidoPorId: null, alteradoPorId: usuarioDe(res).id },
  })
  if (!count) return res.status(404).json({ erro: 'Paciente não está na lixeira.' })
  res.json({ mensagem: 'Paciente restaurado.' })
})
