-- O sistema não tem despesas: some conta a pagar, saída de caixa e custo de procedimento.
DELETE FROM "ContaFinanceira" WHERE "tipo" = 'PAGAR';
UPDATE "ContaFinanceira" SET "lancamentoId" = NULL
  WHERE "lancamentoId" IN (SELECT "id" FROM "Lancamento" WHERE "tipo" = 'SAIDA');
DELETE FROM "Lancamento" WHERE "tipo" = 'SAIDA';

ALTER TYPE "TipoLancamento" RENAME TO "TipoLancamento_old";
CREATE TYPE "TipoLancamento" AS ENUM ('VENDA', 'CANCELAMENTO', 'ENTRADA');
ALTER TABLE "Lancamento" ALTER COLUMN "tipo" TYPE "TipoLancamento" USING ("tipo"::text::"TipoLancamento");
DROP TYPE "TipoLancamento_old";

ALTER TYPE "TipoContaFinanceira" RENAME TO "TipoContaFinanceira_old";
CREATE TYPE "TipoContaFinanceira" AS ENUM ('RECEBER');
ALTER TABLE "ContaFinanceira" ALTER COLUMN "tipo" TYPE "TipoContaFinanceira" USING ("tipo"::text::"TipoContaFinanceira");
DROP TYPE "TipoContaFinanceira_old";

ALTER TABLE "ItemOrcamento" DROP COLUMN "custoCentavos";
ALTER TABLE "Procedimento" DROP COLUMN "custoCentavos";
