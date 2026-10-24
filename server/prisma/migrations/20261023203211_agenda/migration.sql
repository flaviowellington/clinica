-- CreateEnum
CREATE TYPE "TipoAgendamento" AS ENUM ('CONSULTA', 'COMPROMISSO');

-- CreateEnum
CREATE TYPE "StatusAgenda" AS ENUM ('AGENDADO', 'CONFIRMADO', 'EM_ESPERA', 'EM_ATENDIMENTO', 'ATENDIDO', 'ATRASADO', 'FALTOU');

-- CreateEnum
CREATE TYPE "Canal" AS ENUM ('NAO_ENVIAR', 'WHATSAPP', 'SMS', 'EMAIL');

-- CreateTable
CREATE TABLE "Agendamento" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoAgendamento" NOT NULL DEFAULT 'CONSULTA',
    "data" DATE NOT NULL,
    "inicio" TEXT NOT NULL,
    "fim" TEXT NOT NULL,
    "profissionalId" INTEGER NOT NULL,
    "pacienteId" INTEGER,
    "titulo" TEXT,
    "categoria" TEXT,
    "observacoes" TEXT,
    "primeiraConsulta" BOOLEAN NOT NULL DEFAULT false,
    "status" "StatusAgenda" NOT NULL DEFAULT 'AGENDADO',
    "checkinEm" TIMESTAMP(3),
    "esperaInicio" TIMESTAMP(3),
    "confirmacao" "Canal" NOT NULL DEFAULT 'NAO_ENVIAR',
    "alerta" "Canal" NOT NULL DEFAULT 'NAO_ENVIAR',
    "excluidoEm" TIMESTAMP(3),
    "excluidoPorId" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorId" INTEGER NOT NULL,
    "alteradoEm" TIMESTAMP(3) NOT NULL,
    "alteradoPorId" INTEGER,

    CONSTRAINT "Agendamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Agendamento_data_profissionalId_idx" ON "Agendamento"("data", "profissionalId");

-- CreateIndex
CREATE INDEX "Agendamento_pacienteId_idx" ON "Agendamento"("pacienteId");

-- AddForeignKey
ALTER TABLE "Agendamento" ADD CONSTRAINT "Agendamento_profissionalId_fkey" FOREIGN KEY ("profissionalId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agendamento" ADD CONSTRAINT "Agendamento_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "Pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agendamento" ADD CONSTRAINT "Agendamento_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
