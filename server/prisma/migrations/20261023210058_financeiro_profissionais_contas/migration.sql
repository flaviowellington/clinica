-- CreateEnum
CREATE TYPE "TipoLancamento" AS ENUM ('VENDA', 'CANCELAMENTO', 'ENTRADA', 'SAIDA');

-- CreateEnum
CREATE TYPE "TipoConta" AS ENUM ('PESSOA_FISICA', 'PESSOA_JURIDICA');

-- CreateEnum
CREATE TYPE "StatusConta" AS ENUM ('PENDENTE', 'ATIVA', 'CANCELADA');

-- AlterTable
ALTER TABLE "Pessoa" ADD COLUMN     "corAgenda" TEXT,
ADD COLUMN     "cro" TEXT,
ADD COLUMN     "especialidade" TEXT;

-- CreateTable
CREATE TABLE "Lancamento" (
    "id" SERIAL NOT NULL,
    "data" DATE NOT NULL,
    "tipo" "TipoLancamento" NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "forma" TEXT,
    "pacienteId" INTEGER,
    "excluidoEm" TIMESTAMP(3),
    "excluidoPorId" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorId" INTEGER NOT NULL,

    CONSTRAINT "Lancamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContaDigital" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoConta" NOT NULL,
    "nome" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "celular" TEXT NOT NULL,
    "status" "StatusConta" NOT NULL DEFAULT 'PENDENTE',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorId" INTEGER NOT NULL,
    "alteradoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContaDigital_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lancamento_data_idx" ON "Lancamento"("data");

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "Pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaDigital" ADD CONSTRAINT "ContaDigital_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
