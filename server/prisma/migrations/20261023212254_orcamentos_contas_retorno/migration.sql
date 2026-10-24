-- CreateEnum
CREATE TYPE "StatusOrcamento" AS ENUM ('ABERTO', 'APROVADO', 'REPROVADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoContaFinanceira" AS ENUM ('PAGAR', 'RECEBER');

-- CreateEnum
CREATE TYPE "StatusContaFinanceira" AS ENUM ('ABERTA', 'PAGA', 'CANCELADA');

-- AlterTable
ALTER TABLE "Agendamento" ADD COLUMN     "desmarcadoEm" TIMESTAMP(3),
ADD COLUMN     "desmarcadoPorId" INTEGER,
ADD COLUMN     "motivoDesmarcacao" TEXT;

-- AlterTable
ALTER TABLE "Lancamento" ADD COLUMN     "categoria" TEXT,
ADD COLUMN     "conciliadoEm" TIMESTAMP(3),
ADD COLUMN     "contaBancariaId" INTEGER,
ADD COLUMN     "orcamentoId" INTEGER;

-- CreateTable
CREATE TABLE "AlertaRetorno" (
    "id" SERIAL NOT NULL,
    "pacienteId" INTEGER NOT NULL,
    "profissionalId" INTEGER NOT NULL,
    "data" DATE NOT NULL,
    "motivo" TEXT,
    "concluidoEm" TIMESTAMP(3),
    "excluidoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorId" INTEGER NOT NULL,

    CONSTRAINT "AlertaRetorno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Procedimento" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "nomeBusca" TEXT NOT NULL,
    "especialidade" TEXT,
    "valorCentavos" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Procedimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Orcamento" (
    "id" SERIAL NOT NULL,
    "pacienteId" INTEGER NOT NULL,
    "profissionalId" INTEGER NOT NULL,
    "status" "StatusOrcamento" NOT NULL DEFAULT 'ABERTO',
    "observacoes" TEXT,
    "descontoCentavos" INTEGER NOT NULL DEFAULT 0,
    "forma" TEXT,
    "parcelas" INTEGER NOT NULL DEFAULT 1,
    "primeiroVencimento" DATE,
    "motivoReprovacao" TEXT,
    "aprovadoEm" TIMESTAMP(3),
    "aprovadoPorId" INTEGER,
    "canceladoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorId" INTEGER NOT NULL,
    "alteradoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Orcamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemOrcamento" (
    "id" SERIAL NOT NULL,
    "orcamentoId" INTEGER NOT NULL,
    "procedimentoId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "dente" TEXT,
    "valorCentavos" INTEGER NOT NULL,
    "executadoEm" TIMESTAMP(3),
    "executadoPorId" INTEGER,

    CONSTRAINT "ItemOrcamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContaFinanceira" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoContaFinanceira" NOT NULL,
    "descricao" TEXT NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "vencimento" DATE NOT NULL,
    "forma" TEXT,
    "categoria" TEXT,
    "detalhes" TEXT,
    "pacienteId" INTEGER,
    "orcamentoId" INTEGER,
    "parcela" INTEGER,
    "totalParcelas" INTEGER,
    "status" "StatusContaFinanceira" NOT NULL DEFAULT 'ABERTA',
    "pagoEm" DATE,
    "lancamentoId" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorId" INTEGER NOT NULL,

    CONSTRAINT "ContaFinanceira_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContaBancaria" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "banco" TEXT,
    "agencia" TEXT,
    "numero" TEXT,
    "saldoInicialCentavos" INTEGER NOT NULL DEFAULT 0,
    "ativa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ContaBancaria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AlertaRetorno_data_idx" ON "AlertaRetorno"("data");

-- CreateIndex
CREATE INDEX "ContaFinanceira_tipo_status_vencimento_idx" ON "ContaFinanceira"("tipo", "status", "vencimento");

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "Orcamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertaRetorno" ADD CONSTRAINT "AlertaRetorno_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertaRetorno" ADD CONSTRAINT "AlertaRetorno_profissionalId_fkey" FOREIGN KEY ("profissionalId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertaRetorno" ADD CONSTRAINT "AlertaRetorno_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orcamento" ADD CONSTRAINT "Orcamento_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orcamento" ADD CONSTRAINT "Orcamento_profissionalId_fkey" FOREIGN KEY ("profissionalId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orcamento" ADD CONSTRAINT "Orcamento_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemOrcamento" ADD CONSTRAINT "ItemOrcamento_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "Orcamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemOrcamento" ADD CONSTRAINT "ItemOrcamento_procedimentoId_fkey" FOREIGN KEY ("procedimentoId") REFERENCES "Procedimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaFinanceira" ADD CONSTRAINT "ContaFinanceira_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "Pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaFinanceira" ADD CONSTRAINT "ContaFinanceira_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "Orcamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaFinanceira" ADD CONSTRAINT "ContaFinanceira_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "Lancamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaFinanceira" ADD CONSTRAINT "ContaFinanceira_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
