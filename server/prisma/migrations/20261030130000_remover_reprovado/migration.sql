-- Orçamento não tem mais "reprovado": os que existiam voltam a ficar em aberto.
-- O motivo da reprovação passa para as observações, para não se perder.
UPDATE "Orcamento"
SET "status" = 'ABERTO',
    "observacoes" = CONCAT_WS(E'\n', NULLIF("observacoes", ''), 'Motivo da reprovação: ' || "motivoReprovacao")
WHERE "status" = 'REPROVADO';

ALTER TABLE "Orcamento" DROP COLUMN "motivoReprovacao";

ALTER TYPE "StatusOrcamento" RENAME TO "StatusOrcamento_old";
CREATE TYPE "StatusOrcamento" AS ENUM ('ABERTO', 'APROVADO', 'CANCELADO');
ALTER TABLE "Orcamento" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Orcamento" ALTER COLUMN "status" TYPE "StatusOrcamento" USING ("status"::text::"StatusOrcamento");
ALTER TABLE "Orcamento" ALTER COLUMN "status" SET DEFAULT 'ABERTO';
DROP TYPE "StatusOrcamento_old";
