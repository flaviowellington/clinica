-- Exclusão lógica de orçamento em aberto ou reprovado.
ALTER TABLE "Orcamento" ADD COLUMN "excluidoEm" TIMESTAMP(3),
ADD COLUMN "excluidoPorId" INTEGER;
