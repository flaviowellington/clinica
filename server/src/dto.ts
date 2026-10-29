import type { Response } from 'express'
import type { z } from 'zod'
import { errosPorCampo } from '../../shared/dtos'

/**
 * Lê o corpo com o DTO (shared/dtos.ts). Inválido: já responde 400 e devolve undefined.
 * Formulário: { erro: 'Confira os campos.', erros: { campo: mensagem } }.
 * Com resumo null (ação de um campo só): { erro: primeira mensagem }.
 */
export function lerCorpo<S extends z.ZodType>(
  Dto: S,
  corpo: unknown,
  res: Response,
  resumo: string | null = 'Confira os campos.',
): z.output<S> | undefined {
  const r = Dto.safeParse(corpo ?? {})
  if (r.success) return r.data
  if (resumo === null) res.status(400).json({ erro: r.error.issues[0].message })
  else res.status(400).json({ erro: resumo, erros: errosPorCampo(r.error) })
}
