-- Retificação do plano assinado: o Administrador altera e o paciente assina de novo.
ALTER TABLE "Autorizacao" ADD COLUMN "alteradoEm" TIMESTAMP(3);
ALTER TABLE "Autorizacao" ADD COLUMN "retificaId" INTEGER;
ALTER TABLE "Autorizacao" ADD CONSTRAINT "Autorizacao_retificaId_fkey" FOREIGN KEY ("retificaId") REFERENCES "Autorizacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
