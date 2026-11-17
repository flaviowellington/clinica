-- Observação interna e para o paciente viram um campo só: o detalhamento ("observacao").
UPDATE "ProcedimentoClinico" SET "observacao" = CASE
  WHEN "observacao" IS NULL OR "observacao" = '' THEN "observacaoPaciente"
  WHEN "observacaoPaciente" IS NULL OR "observacaoPaciente" = '' OR "observacaoPaciente" = "observacao" THEN "observacao"
  ELSE "observacao" || E'\n' || "observacaoPaciente" END;
UPDATE "ItemOrcamento" SET "observacao" = CASE
  WHEN "observacao" IS NULL OR "observacao" = '' THEN "observacaoPaciente"
  WHEN "observacaoPaciente" IS NULL OR "observacaoPaciente" = '' OR "observacaoPaciente" = "observacao" THEN "observacao"
  ELSE "observacao" || E'\n' || "observacaoPaciente" END;

ALTER TABLE "ProcedimentoClinico" DROP COLUMN "observacaoPaciente";
ALTER TABLE "ItemOrcamento" DROP COLUMN "observacaoPaciente";
