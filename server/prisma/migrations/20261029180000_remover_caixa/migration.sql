-- Remove o módulo Caixa (F-031).
ALTER TABLE "Lancamento" DROP CONSTRAINT "Lancamento_caixaId_fkey";
ALTER TABLE "Lancamento" DROP COLUMN "caixaId";
DROP TABLE "Caixa";
