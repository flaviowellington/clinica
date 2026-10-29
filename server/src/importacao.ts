// Importação das planilhas exportadas do sistema antigo (F-030, COMECE-AQUI passo 9).
// A tela lê o XLSX no navegador, o usuário diz qual coluna é qual campo, e as linhas chegam
// aqui em lotes, já com os nomes dos campos. Aqui tudo é validado de novo.
import { Router } from 'express'
import { db } from './db'
import { exigir, usuarioDe } from './auth'
import { cpfValido, normalizar } from '../../shared/regras'
import { STATUS, type StatusAgenda } from '../../shared/agenda'
import { DENTES_VALIDOS, normalizarFaces } from '../../shared/prontuario'
import { CAMPOS_IMPORTACAO, type TipoImportacao } from '../../shared/importacao'
import { ImportacaoDto } from '../../shared/dtos'
import { lerCorpo } from './dto'

type Linha = Record<string, unknown>

const txt = (v: unknown, max = 200) => {
  const t = v === null || v === undefined ? '' : String(v).trim()
  return t ? t.slice(0, max) : null
}

/** "2025-03-10" ou "10/03/2025" → Date (UTC, meia-noite). Inválida → undefined. */
function lerData(v: unknown) {
  const t = txt(v, 30)
  if (!t) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t) ?? /^(\d{2})\/(\d{2})\/(\d{4})/.exec(t)
  if (!m) return undefined
  const iso = m[1].length === 4 ? `${m[1]}-${m[2]}-${m[3]}` : `${m[3]}-${m[2]}-${m[1]}`
  const d = new Date(`${iso}T00:00:00Z`)
  return isNaN(d.getTime()) || isoDe(d) !== iso ? undefined : d
}
const isoDe = (d: Date) => d.toISOString().slice(0, 10)

/** "9:00", "09:00:00" → "09:00". Inválida → null. */
function lerHora(v: unknown) {
  const m = /^(\d{1,2}):(\d{2})/.exec(txt(v, 10) ?? '')
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null
  return `${m[1].padStart(2, '0')}:${m[2]}`
}

/** Tira "Dr.", "Dra." e acentos, para achar o profissional pelo nome. */
const semTitulo = (nome: string) => normalizar(nome).replace(/^dra?\.?\s+/, '')

class ErroLinha extends Error {}

async function acharPaciente(l: Linha) {
  const cpf = txt(l.pacienteCpf)?.replace(/\D/g, '')
  if (cpf) {
    const p = await db.pessoa.findFirst({ where: { tipo: 'PACIENTE', excluidoEm: null, cpf } })
    if (p) return p
  }
  const nome = txt(l.paciente, 150)
  if (!nome) throw new ErroLinha('Falta o paciente.')
  const achados = await db.pessoa.findMany({
    where: { tipo: 'PACIENTE', excluidoEm: null, nomeBusca: normalizar(nome) },
    take: 2,
  })
  if (!achados.length)
    throw new ErroLinha(`Paciente "${nome}" não encontrado. Importe os pacientes antes.`)
  if (achados.length > 1)
    throw new ErroLinha(`Há mais de um paciente "${nome}": inclua a coluna de CPF.`)
  return achados[0]
}

function criarBuscaProfissional(profissionais: { id: number; nome: string }[]) {
  const porNome = new Map(profissionais.map((p) => [semTitulo(p.nome), p.id]))
  return (v: unknown) => {
    const nome = txt(v, 150)
    if (!nome) throw new ErroLinha('Falta o profissional.')
    const id = porNome.get(semTitulo(nome))
    if (!id)
      throw new ErroLinha(`Profissional "${nome}" não cadastrado. Cadastre em Profissionais.`)
    return id
  }
}

const STATUS_POR_ROTULO = new Map(
  Object.entries(STATUS).flatMap(([k, s]) => [
    [normalizar(s.rotulo), k],
    [normalizar(k), k],
  ]),
)

/** Cada tipo: grava uma linha e diz se criou (true) ou se já existia (false). */
const IMPORTADORES: Record<
  TipoImportacao,
  (l: Linha, ctx: { usuarioId: number; profissional: (v: unknown) => number }) => Promise<boolean>
> = {
  async pacientes(l, { usuarioId }) {
    const nome = txt(l.nome, 150)
    if (!nome) throw new ErroLinha('Falta o nome.')
    const nascimento = lerData(l.nascimento)
    if (nascimento === undefined) throw new ErroLinha('Data de nascimento inválida.')
    // CPF inválido no sistema antigo não impede a importação: o paciente entra sem CPF.
    const cpfBruto = txt(l.cpf, 20)?.replace(/\D/g, '') ?? null
    const cpf = cpfBruto && cpfValido(cpfBruto) ? cpfBruto : null
    const nomeBusca = normalizar(nome)
    const existe = await db.pessoa.findFirst({
      where: {
        tipo: 'PACIENTE',
        excluidoEm: null,
        OR: [...(cpf ? [{ cpf }] : []), { nomeBusca, nascimento }],
      },
    })
    if (existe) return false
    const respCpf = txt(l.responsavelCpf, 20)?.replace(/\D/g, '') ?? null
    await db.pessoa.create({
      data: {
        tipo: 'PACIENTE',
        nome,
        nomeBusca,
        nascimento,
        cpf,
        apelido: txt(l.apelido, 80),
        rg: txt(l.rg, 30),
        sexo: txt(l.sexo, 30),
        estadoCivil: txt(l.estadoCivil, 30),
        email: txt(l.email, 120),
        celular: txt(l.celular, 30),
        telefone: txt(l.telefone, 30),
        comoConheceu: txt(l.comoConheceu, 60),
        indicadoPor: txt(l.indicadoPor, 150),
        nomeMae: txt(l.nomeMae, 150),
        nomePai: txt(l.nomePai, 150),
        responsavelNome: txt(l.responsavelNome, 150),
        responsavelCpf: respCpf && cpfValido(respCpf) ? respCpf : null,
        observacoes: txt(l.observacoes, 2000),
        criadoPorId: usuarioId,
        alteradoPorId: usuarioId,
      },
    })
    return true
  },

  async agendamentos(l, { usuarioId, profissional }) {
    const paciente = await acharPaciente(l)
    const profissionalId = profissional(l.profissional)
    const data = lerData(l.data)
    if (!data) throw new ErroLinha('Data da consulta inválida.')
    const inicio = lerHora(l.inicio)
    if (!inicio) throw new ErroLinha('Horário de início inválido.')
    const fim = lerHora(l.fim) ?? inicio
    const status = (STATUS_POR_ROTULO.get(normalizar(txt(l.status) ?? '')) ??
      'AGENDADO') as StatusAgenda
    const existe = await db.agendamento.findFirst({
      where: { pacienteId: paciente.id, profissionalId, data, inicio, excluidoEm: null },
    })
    if (existe) return false
    await db.agendamento.create({
      data: {
        tipo: 'CONSULTA',
        data,
        inicio,
        fim: fim > inicio ? fim : inicio,
        profissionalId,
        pacienteId: paciente.id,
        status,
        categoria: txt(l.categoria, 40),
        observacoes: txt(l.observacoes, 2000),
        criadoPorId: usuarioId,
      },
    })
    return true
  },

  async procedimentos(l, { usuarioId, profissional }) {
    const paciente = await acharPaciente(l)
    const profissionalId = profissional(l.profissional)
    const nome = txt(l.procedimento)
    if (!nome) throw new ErroLinha('Falta o procedimento.')
    const data = lerData(l.data)
    if (!data) throw new ErroLinha('Data do procedimento inválida.')
    const denteBruto = txt(l.dente, 10)
    const dente = denteBruto && DENTES_VALIDOS.has(denteBruto) ? denteBruto : null
    const existe = await db.procedimentoClinico.findFirst({
      where: { pacienteId: paciente.id, nome, data, dente, excluidoEm: null },
    })
    if (existe) return false
    const observacao = [
      txt(l.observacao, 1500),
      denteBruto && !dente ? `Região: ${denteBruto}` : null,
    ]
      .filter(Boolean)
      .join(' · ')
    await db.procedimentoClinico.create({
      data: {
        pacienteId: paciente.id,
        profissionalId,
        nome,
        dente,
        faces: dente ? normalizarFaces(txt(l.faces, 10)) || null : null,
        status: 'EXECUTADO',
        data,
        observacao: observacao.slice(0, 1500) || null,
        criadoPorId: usuarioId,
      },
    })
    return true
  },
}

export const rotasImportacao = Router()

rotasImportacao.get('/', exigir('dados.importar'), async (_req, res) => {
  res.json(
    await db.importacao.findMany({
      include: { criadoPor: { select: { nome: true } } },
      orderBy: { id: 'desc' },
      take: 50,
    }),
  )
})

rotasImportacao.post('/:tipo', exigir('dados.importar'), async (req, res) => {
  const tipo = req.params.tipo as TipoImportacao
  if (!(tipo in CAMPOS_IMPORTACAO))
    return res.status(404).json({ erro: 'Tipo de importação desconhecido.' })
  const b = lerCorpo(ImportacaoDto, req.body, res, null)
  if (!b) return
  const { linhas, primeiraLinha: primeira } = b
  const usuarioId = usuarioDe(res).id
  const profissionais = await db.pessoa.findMany({
    where: { tipo: 'PROFISSIONAL', excluidoEm: null },
    select: { id: true, nome: true },
  })
  const ctx = { usuarioId, profissional: criarBuscaProfissional(profissionais) }

  let criados = 0
  let ignorados = 0
  const erros: { linha: number; erro: string }[] = []
  // Uma linha por vez: a linha com erro não derruba as outras.
  for (const [i, l] of linhas.entries()) {
    try {
      if (await IMPORTADORES[tipo](l, ctx)) criados++
      else ignorados++
    } catch (e) {
      if (!(e instanceof ErroLinha)) throw e
      erros.push({ linha: primeira + i, erro: e.message })
    }
  }
  await db.importacao.create({
    data: {
      tipo,
      arquivo: b.arquivo ?? 'planilha',
      criados,
      ignorados,
      erros: erros.length,
      criadoPorId: usuarioId,
    },
  })
  res.json({ criados, ignorados, erros })
})
