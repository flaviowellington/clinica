// Configurações da clínica (S-014), tabela de procedimentos e teste do e-mail.
import { Router } from 'express'
import type { z } from 'zod'
import { db } from './db'
import { exigir, usuarioDe } from './auth'
import { CHAVES, PADROES, validarConfig, type ChaveConfig } from '../../shared/configuracoes'
import { normalizar } from '../../shared/regras'
import { emailConfigurado, enviar, ErroEnvio } from './mensagens'
import { EmailTesteDto, ProcedimentoTabelaDto } from '../../shared/dtos'
import { lerCorpo } from './dto'

/** Lê uma configuração; sem nada gravado, vale o padrão. */
export async function lerConfig<C extends ChaveConfig>(chave: C): Promise<(typeof PADROES)[C]> {
  const c = await db.configuracao.findUnique({ where: { chave } })
  if (!c) return PADROES[chave]
  // Objetos: completa com o padrão o que ainda não foi gravado (ex.: modelo novo de documento).
  const padrao = PADROES[chave]
  return (
    Array.isArray(padrao) ? c.valor : { ...padrao, ...(c.valor as object) }
  ) as (typeof PADROES)[C]
}

const ehChave = (v: string): v is ChaveConfig => (CHAVES as string[]).includes(v)

export const rotasConfiguracoes = Router()

// E-mail antes de "/:chave", para não ser lido como uma chave.
rotasConfiguracoes.get('/email/estado', exigir('configuracao.editar'), (_req, res) => {
  res.json({
    configurado: emailConfigurado(),
    remetente: process.env.EMAIL_REMETENTE || process.env.SMTP_USUARIO || null,
    servidor: process.env.SMTP_HOST || null,
  })
})

rotasConfiguracoes.post('/email/teste', exigir('configuracao.editar'), async (req, res) => {
  const b = lerCorpo(EmailTesteDto, req.body, res, null)
  if (!b) return
  const { para } = b
  const clinica = await lerConfig('clinica')
  try {
    await enviar({
      canal: 'EMAIL',
      tipo: 'TESTE',
      destino: para,
      assunto: `Teste de e-mail – ${clinica.nome}`,
      texto: 'Se você recebeu esta mensagem, o e-mail da clínica está funcionando.',
      usuarioId: usuarioDe(res).id,
    })
  } catch (e) {
    const status = e instanceof ErroEnvio ? e.status : 502
    return res.status(status).json({ erro: (e as Error).message })
  }
  res.json({ mensagem: `E-mail de teste enviado para ${para}.` })
})

// Todas as configurações podem ser lidas por quem está logado (recibo, documentos, anamnese).
rotasConfiguracoes.get('/:chave', async (req, res) => {
  if (!ehChave(req.params.chave)) return res.status(404).json({ erro: 'Configuração não existe.' })
  res.json(await lerConfig(req.params.chave))
})

rotasConfiguracoes.put('/:chave', exigir('configuracao.editar'), async (req, res) => {
  const chave = String(req.params.chave)
  if (!ehChave(chave)) return res.status(404).json({ erro: 'Configuração não existe.' })
  const v = validarConfig(chave, req.body)
  if (v.erro !== undefined) return res.status(400).json({ erro: v.erro })
  const valor = v.valor as object
  const alteradoPorId = usuarioDe(res).id
  await db.configuracao.upsert({
    where: { chave },
    create: { chave, valor, alteradoPorId },
    update: { valor, alteradoPorId },
  })
  res.json(await lerConfig(chave))
})

// ── Tabela de procedimentos (E-009) ─────────────────────────────────────────
// A busca (GET) fica em tratamentos.ts; aqui o cadastro.
export const rotasTabelaProcedimentos = Router()

const paraBanco = (d: z.output<typeof ProcedimentoTabelaDto>) => ({
  ...d,
  nomeBusca: normalizar(d.nome),
})

rotasTabelaProcedimentos.post('/', exigir('configuracao.editar'), async (req, res) => {
  const d = lerCorpo(ProcedimentoTabelaDto, req.body, res)
  if (!d) return
  res.status(201).json(await db.procedimento.create({ data: paraBanco(d) }))
})

rotasTabelaProcedimentos.put('/:id', exigir('configuracao.editar'), async (req, res) => {
  const p = await db.procedimento.findUnique({ where: { id: Number(req.params.id) || 0 } })
  if (!p) return res.status(404).json({ erro: 'Procedimento não encontrado.' })
  const d = lerCorpo(ProcedimentoTabelaDto, req.body, res)
  if (!d) return
  // Orçamentos antigos guardam a cópia do nome e do valor: mudar aqui não mexe neles.
  res.json(await db.procedimento.update({ where: { id: p.id }, data: paraBanco(d) }))
})
