// Logs do sistema, só para o administrador (Configurações → Logs).
// Junta o que já existia (quem abriu cada ficha, LogAcesso) com toda alteração feita pela API.
import { Router, type NextFunction, type Request, type Response } from 'express'
import { db } from './db'
import { usuarioDe } from './auth'

/** Grava, ao terminar o pedido, toda alteração (POST/PUT/PATCH/DELETE). Leituras ficam de fora. */
export function registrarAtividade(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next()
  res.on('finish', () => {
    const caminho = req.originalUrl.split('?')[0].slice(0, 300)
    db.logAtividade
      .create({
        data: {
          usuarioId: res.locals.usuario?.id ?? null,
          metodo: req.method,
          caminho,
          status: res.statusCode,
          ip: req.ip ?? null,
          detalhe:
            caminho === '/api/entrar' ? String(req.body?.login ?? '').slice(0, 100) || null : null,
        },
      })
      .catch((e) => console.error('Falha ao gravar log', e))
  })
  next()
}

export const rotasLogs = Router()

// Página por número, como em Pacientes. As duas tabelas são juntadas aqui, por data.
// ponytail: cada página lê pagina*porPagina de cada tabela; se a página 500 ficar lenta,
// trocar por uma VIEW com UNION ALL no banco.
rotasLogs.get('/', async (req, res) => {
  if (!usuarioDe(res).perfis.includes('ADMINISTRADOR'))
    return res.status(403).json({ erro: 'Só o administrador vê os logs.' })
  const porPagina = [10, 25, 50, 100].includes(Number(req.query.porPagina))
    ? Number(req.query.porPagina)
    : 25
  const pagina = Math.min(Math.max(1, Math.floor(Number(req.query.pagina)) || 1), 1000)
  const usuarioId = Number(req.query.usuarioId) || undefined
  const nome = { select: { nome: true } }
  // Busca: no nome de quem fez, no caminho e no detalhe (login tentado / paciente da ficha).
  const busca = String(req.query.busca ?? '')
    .trim()
    .slice(0, 100)
  const tem = { contains: busca, mode: 'insensitive' as const }
  const ondeAtividade = {
    usuarioId,
    OR: busca
      ? [{ usuario: { nome: tem } }, { caminho: tem }, { metodo: tem }, { detalhe: tem }]
      : undefined,
  }
  const ondeAcesso = {
    usuarioId,
    OR: busca
      ? [{ usuario: { nome: tem } }, { caminho: tem }, { pessoa: { nome: tem } }]
      : undefined,
  }
  const ate = pagina * porPagina

  const [atividades, acessos, totalAtividades, totalAcessos] = await Promise.all([
    db.logAtividade.findMany({
      where: ondeAtividade,
      orderBy: [{ em: 'desc' }, { id: 'desc' }],
      take: ate,
      include: { usuario: nome },
    }),
    db.logAcesso.findMany({
      where: ondeAcesso,
      orderBy: [{ em: 'desc' }, { id: 'desc' }],
      take: ate,
      include: { usuario: nome, pessoa: nome },
    }),
    db.logAtividade.count({ where: ondeAtividade }),
    db.logAcesso.count({ where: ondeAcesso }),
  ])
  const itens = [
    ...atividades.map((a) => ({
      id: `a${a.id}`,
      em: a.em,
      usuario: a.usuario?.nome ?? null,
      metodo: a.metodo,
      caminho: a.caminho,
      status: a.status,
      ip: a.ip,
      detalhe: a.detalhe,
    })),
    ...acessos.map((a) => ({
      id: `f${a.id}`,
      em: a.em,
      usuario: a.usuario.nome,
      metodo: 'ABRIU',
      caminho: a.caminho,
      status: 200,
      ip: null,
      detalhe: a.pessoa.nome,
    })),
  ]
    .sort((x, y) => y.em.getTime() - x.em.getTime())
    .slice(ate - porPagina, ate)
  res.json({ itens, total: totalAtividades + totalAcessos, pagina, porPagina })
})
