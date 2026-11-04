-- AlterTable
ALTER TABLE "ItemOrcamento" ADD COLUMN     "autorizacaoId" INTEGER,
ADD COLUMN     "observacao" TEXT,
ADD COLUMN     "observacaoPaciente" TEXT;

-- AlterTable
ALTER TABLE "ProcedimentoClinico" ADD COLUMN     "autorizacaoId" INTEGER;

-- CreateTable
CREATE TABLE "Autorizacao" (
    "id" SERIAL NOT NULL,
    "pacienteId" INTEGER NOT NULL,
    "conteudo" JSONB NOT NULL,
    "token" TEXT NOT NULL,
    "assinadoEm" TIMESTAMP(3),
    "assinanteNome" TEXT,
    "assinatura" TEXT,
    "ip" TEXT,
    "navegador" TEXT,
    "canceladoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorId" INTEGER NOT NULL,

    CONSTRAINT "Autorizacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Autorizacao_token_key" ON "Autorizacao"("token");

-- CreateIndex
CREATE INDEX "Autorizacao_pacienteId_idx" ON "Autorizacao"("pacienteId");

-- AddForeignKey
ALTER TABLE "ItemOrcamento" ADD CONSTRAINT "ItemOrcamento_autorizacaoId_fkey" FOREIGN KEY ("autorizacaoId") REFERENCES "Autorizacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcedimentoClinico" ADD CONSTRAINT "ProcedimentoClinico_autorizacaoId_fkey" FOREIGN KEY ("autorizacaoId") REFERENCES "Autorizacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Autorizacao" ADD CONSTRAINT "Autorizacao_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Autorizacao" ADD CONSTRAINT "Autorizacao_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
