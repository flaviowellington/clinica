-- Pedido de assinatura de um planejamento (ficha de especialidade).
ALTER TABLE "Autorizacao" ADD COLUMN "fichaId" INTEGER;
ALTER TABLE "Autorizacao" ADD CONSTRAINT "Autorizacao_fichaId_fkey" FOREIGN KEY ("fichaId") REFERENCES "FichaEspecialidade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ItemFichaEspecialidade" ADD COLUMN "autorizacaoId" INTEGER;
ALTER TABLE "ItemFichaEspecialidade" ADD CONSTRAINT "ItemFichaEspecialidade_autorizacaoId_fkey" FOREIGN KEY ("autorizacaoId") REFERENCES "Autorizacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A descrição vira a primeira observação.
ALTER TABLE "FichaEspecialidade" ADD COLUMN "notas" JSONB NOT NULL DEFAULT '[]';
UPDATE "FichaEspecialidade"
SET "notas" = jsonb_build_array(jsonb_build_object('id', 'n0', 'texto', "observacoes", 'em', "criadoEm", 'autor', NULL))
WHERE coalesce("observacoes", '') <> '';
ALTER TABLE "FichaEspecialidade" DROP COLUMN "observacoes";
