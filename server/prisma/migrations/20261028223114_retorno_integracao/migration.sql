-- CreateEnum
CREATE TYPE "SituacaoRetorno" AS ENUM ('AGUARDANDO_ENVIO', 'ENVIADO', 'FALHOU', 'RESPONDEU', 'CONFIRMADO', 'DESMARCADO');

-- AlterEnum
ALTER TYPE "StatusMensagem" ADD VALUE 'RECEBIDA';

-- AlterTable
ALTER TABLE "AlertaRetorno" ADD COLUMN     "situacao" "SituacaoRetorno" NOT NULL DEFAULT 'AGUARDANDO_ENVIO';

-- AlterTable
ALTER TABLE "Mensagem" ADD COLUMN     "retornoId" INTEGER,
ADD COLUMN     "texto" TEXT;

-- CreateIndex
CREATE INDEX "Mensagem_retornoId_idx" ON "Mensagem"("retornoId");

-- AddForeignKey
ALTER TABLE "Mensagem" ADD CONSTRAINT "Mensagem_retornoId_fkey" FOREIGN KEY ("retornoId") REFERENCES "AlertaRetorno"("id") ON DELETE SET NULL ON UPDATE CASCADE;
