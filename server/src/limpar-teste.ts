// Esvazia as tabelas do banco de TESTE. Recusa qualquer banco cujo nome não termine em "_teste".
import { fileURLToPath } from 'node:url'

export function exigirBancoDeTeste(url = process.env.DATABASE_URL ?? '') {
  const nome = new URL(url).pathname.slice(1)
  if (!nome.endsWith('_teste')) throw new Error(`Recusado: "${nome}" não é um banco de teste.`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  exigirBancoDeTeste()
  const { db } = await import('./db')
  await db.$executeRaw`TRUNCATE "Alteracao", "ItemFichaEspecialidade", "FichaEspecialidade", "ProcedimentoClinico", "Anamnese", "Arquivo", "Documento", "Nota", "ContaFinanceira", "ItemOrcamento", "AlertaRetorno", "Lancamento", "Orcamento", "Procedimento", "ContaBancaria", "Agendamento", "ContaDigital", "LogAcesso", "Usuario", "Pessoa" RESTART IDENTITY CASCADE`
  await db.$disconnect()
}
