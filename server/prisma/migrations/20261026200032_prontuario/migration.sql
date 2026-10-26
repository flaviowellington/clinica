-- CreateEnum
CREATE TYPE "StatusClinico" AS ENUM ('EXECUTADO', 'EXISTENTE');

-- CreateEnum
CREATE TYPE "Respondente" AS ENUM ('PACIENTE', 'PROFISSIONAL');

-- CreateEnum
CREATE TYPE "CategoriaArquivo" AS ENUM ('FOTO', 'EXAME');

-- CreateTable
CREATE TABLE "Alteracao" (
    "id" SERIAL NOT NULL,
    "tabela" TEXT NOT NULL,
    "registroId" INTEGER NOT NULL,
    "antes" JSONB NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alteracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcedimentoClinico" (
    "id" SERIAL NOT NULL,
    "pacienteId" INTEGER NOT NULL,
    "profissionalId" INTEGER NOT NULL,
    "procedimentoId" INTEGER,
    "nome" TEXT NOT NULL,
    "dente" TEXT,
    "faces" TEXT,
    "status" "StatusClinico" NOT NULL,
    "data" DATE NOT NULL,
    "observacao" TEXT,
    "observacaoPaciente" TEXT,
    "excluidoEm" TIMESTAMP(3),
    "excluidoPorId" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorId" INTEGER NOT NULL,
    "alteradoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcedimentoClinico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Anamnese" (
    "id" SERIAL NOT NULL,
    "pacienteId" INTEGER NOT NULL,
    "respondente" "Respondente" NOT NULL,
    "perguntas" JSONB NOT NULL,
    "observacoes" TEXT,
    "excluidoEm" TIMESTAMP(3),
    "excluidoPorId" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorId" INTEGER NOT NULL,
    "alteradoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Anamnese_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FichaEspecialidade" (
    "id" SERIAL NOT NULL,
    "pacienteId" INTEGER NOT NULL,
    "profissionalId" INTEGER NOT NULL,
    "especialidade" TEXT NOT NULL,
    "observacoes" TEXT,
    "excluidoEm" TIMESTAMP(3),
    "excluidoPorId" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorId" INTEGER NOT NULL,

    CONSTRAINT "FichaEspecialidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemFichaEspecialidade" (
    "id" SERIAL NOT NULL,
    "fichaId" INTEGER NOT NULL,
    "dente" TEXT NOT NULL,
    "procedimento" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "observacao" TEXT,
    "excluidoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alteradoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemFichaEspecialidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Arquivo" (
    "id" SERIAL NOT NULL,
    "pacienteId" INTEGER NOT NULL,
    "categoria" "CategoriaArquivo" NOT NULL,
    "pasta" TEXT,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "dados" BYTEA NOT NULL,
    "rotacao" INTEGER NOT NULL DEFAULT 0,
    "espelhado" BOOLEAN NOT NULL DEFAULT false,
    "excluidoEm" TIMESTAMP(3),
    "excluidoPorId" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorId" INTEGER NOT NULL,

    CONSTRAINT "Arquivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Documento" (
    "id" SERIAL NOT NULL,
    "pacienteId" INTEGER NOT NULL,
    "profissionalId" INTEGER,
    "modelo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "excluidoEm" TIMESTAMP(3),
    "excluidoPorId" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorId" INTEGER NOT NULL,
    "alteradoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Documento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nota" (
    "id" SERIAL NOT NULL,
    "pacienteId" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorId" INTEGER NOT NULL,

    CONSTRAINT "Nota_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Alteracao_tabela_registroId_idx" ON "Alteracao"("tabela", "registroId");

-- CreateIndex
CREATE INDEX "ProcedimentoClinico_pacienteId_idx" ON "ProcedimentoClinico"("pacienteId");

-- CreateIndex
CREATE INDEX "Anamnese_pacienteId_idx" ON "Anamnese"("pacienteId");

-- CreateIndex
CREATE INDEX "FichaEspecialidade_pacienteId_idx" ON "FichaEspecialidade"("pacienteId");

-- CreateIndex
CREATE INDEX "Arquivo_pacienteId_categoria_idx" ON "Arquivo"("pacienteId", "categoria");

-- CreateIndex
CREATE INDEX "Documento_pacienteId_idx" ON "Documento"("pacienteId");

-- CreateIndex
CREATE INDEX "Nota_pacienteId_idx" ON "Nota"("pacienteId");

-- AddForeignKey
ALTER TABLE "ProcedimentoClinico" ADD CONSTRAINT "ProcedimentoClinico_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcedimentoClinico" ADD CONSTRAINT "ProcedimentoClinico_profissionalId_fkey" FOREIGN KEY ("profissionalId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcedimentoClinico" ADD CONSTRAINT "ProcedimentoClinico_procedimentoId_fkey" FOREIGN KEY ("procedimentoId") REFERENCES "Procedimento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcedimentoClinico" ADD CONSTRAINT "ProcedimentoClinico_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anamnese" ADD CONSTRAINT "Anamnese_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anamnese" ADD CONSTRAINT "Anamnese_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FichaEspecialidade" ADD CONSTRAINT "FichaEspecialidade_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FichaEspecialidade" ADD CONSTRAINT "FichaEspecialidade_profissionalId_fkey" FOREIGN KEY ("profissionalId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FichaEspecialidade" ADD CONSTRAINT "FichaEspecialidade_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemFichaEspecialidade" ADD CONSTRAINT "ItemFichaEspecialidade_fichaId_fkey" FOREIGN KEY ("fichaId") REFERENCES "FichaEspecialidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Arquivo" ADD CONSTRAINT "Arquivo_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Arquivo" ADD CONSTRAINT "Arquivo_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_profissionalId_fkey" FOREIGN KEY ("profissionalId") REFERENCES "Pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nota" ADD CONSTRAINT "Nota_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nota" ADD CONSTRAINT "Nota_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
