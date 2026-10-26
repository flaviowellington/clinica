-- CreateEnum
CREATE TYPE "EtapaProtetica" AS ENUM ('PRE_ENVIO', 'EM_LABORATORIO', 'RETORNO', 'AGENDAMENTO', 'INSTALADO');

-- CreateEnum
CREATE TYPE "StatusMensagem" AS ENUM ('ENVIADA', 'FALHOU');

-- AlterTable
ALTER TABLE "Agendamento" ADD COLUMN     "confirmadoEm" TIMESTAMP(3),
ADD COLUMN     "confirmadoPor" TEXT;

-- AlterTable
ALTER TABLE "Lancamento" ADD COLUMN     "caixaId" INTEGER;

-- CreateTable
CREATE TABLE "Configuracao" (
    "chave" TEXT NOT NULL,
    "valor" JSONB NOT NULL,
    "alteradoEm" TIMESTAMP(3) NOT NULL,
    "alteradoPorId" INTEGER,

    CONSTRAINT "Configuracao_pkey" PRIMARY KEY ("chave")
);

-- CreateTable
CREATE TABLE "Caixa" (
    "id" SERIAL NOT NULL,
    "abertoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "abertoPorId" INTEGER NOT NULL,
    "saldoInicialCentavos" INTEGER NOT NULL,
    "fechadoEm" TIMESTAMP(3),
    "fechadoPorId" INTEGER,
    "conferencia" JSONB,
    "observacoes" TEXT,

    CONSTRAINT "Caixa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrabalhoProtetico" (
    "id" SERIAL NOT NULL,
    "pacienteId" INTEGER NOT NULL,
    "profissionalId" INTEGER NOT NULL,
    "laboratorio" TEXT NOT NULL,
    "trabalho" TEXT NOT NULL,
    "dentes" TEXT,
    "cor" TEXT,
    "etapa" "EtapaProtetica" NOT NULL DEFAULT 'PRE_ENVIO',
    "prazo" DATE,
    "valorCentavos" INTEGER NOT NULL DEFAULT 0,
    "enviadoEm" DATE,
    "retornoEm" DATE,
    "instaladoEm" DATE,
    "observacoes" TEXT,
    "movidoEm" TIMESTAMP(3),
    "movidoPorId" INTEGER,
    "excluidoEm" TIMESTAMP(3),
    "excluidoPorId" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorId" INTEGER NOT NULL,

    CONSTRAINT "TrabalhoProtetico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mensagem" (
    "id" SERIAL NOT NULL,
    "agendamentoId" INTEGER,
    "canal" "Canal" NOT NULL,
    "tipo" TEXT NOT NULL,
    "destino" TEXT NOT NULL,
    "assunto" TEXT,
    "status" "StatusMensagem" NOT NULL,
    "erro" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviadoPorId" INTEGER,

    CONSTRAINT "Mensagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Importacao" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "arquivo" TEXT NOT NULL,
    "criados" INTEGER NOT NULL,
    "ignorados" INTEGER NOT NULL,
    "erros" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorId" INTEGER NOT NULL,

    CONSTRAINT "Importacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrabalhoProtetico_etapa_idx" ON "TrabalhoProtetico"("etapa");

-- CreateIndex
CREATE INDEX "Mensagem_agendamentoId_idx" ON "Mensagem"("agendamentoId");

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_caixaId_fkey" FOREIGN KEY ("caixaId") REFERENCES "Caixa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Caixa" ADD CONSTRAINT "Caixa_abertoPorId_fkey" FOREIGN KEY ("abertoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Caixa" ADD CONSTRAINT "Caixa_fechadoPorId_fkey" FOREIGN KEY ("fechadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrabalhoProtetico" ADD CONSTRAINT "TrabalhoProtetico_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrabalhoProtetico" ADD CONSTRAINT "TrabalhoProtetico_profissionalId_fkey" FOREIGN KEY ("profissionalId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrabalhoProtetico" ADD CONSTRAINT "TrabalhoProtetico_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mensagem" ADD CONSTRAINT "Mensagem_agendamentoId_fkey" FOREIGN KEY ("agendamentoId") REFERENCES "Agendamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Importacao" ADD CONSTRAINT "Importacao_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
