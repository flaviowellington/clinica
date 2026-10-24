-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TipoPessoa" AS ENUM ('PACIENTE', 'PROFISSIONAL');

-- CreateEnum
CREATE TYPE "Perfil" AS ENUM ('ADMINISTRADOR', 'PROFISSIONAL', 'RECEPCAO', 'FINANCEIRO');

-- CreateEnum
CREATE TYPE "MotivoInativacao" AS ENUM ('FALECIMENTO', 'SOLICITACAO_PACIENTE', 'DESISTENCIA_TRATAMENTO', 'OUTROS');

-- CreateTable
CREATE TABLE "Pessoa" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoPessoa" NOT NULL,
    "nome" TEXT NOT NULL,
    "nomeBusca" TEXT NOT NULL,
    "nascimento" DATE,
    "apelido" TEXT,
    "cpf" TEXT,
    "rg" TEXT,
    "sexo" TEXT,
    "estadoCivil" TEXT,
    "observacoes" TEXT,
    "email" TEXT,
    "celular" TEXT,
    "telefone" TEXT,
    "comoConheceu" TEXT,
    "indicadoPor" TEXT,
    "nomeMae" TEXT,
    "nomePai" TEXT,
    "responsavelNome" TEXT,
    "responsavelCpf" TEXT,
    "responsavelParentesco" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "motivoInativacao" "MotivoInativacao",
    "motivoInativacaoDescricao" TEXT,
    "excluidoEm" TIMESTAMP(3),
    "excluidoPorId" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorId" INTEGER,
    "alteradoEm" TIMESTAMP(3) NOT NULL,
    "alteradoPorId" INTEGER,

    CONSTRAINT "Pessoa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" SERIAL NOT NULL,
    "login" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "perfis" "Perfil"[],
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "pessoaId" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogAcesso" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "pessoaId" INTEGER NOT NULL,
    "caminho" TEXT NOT NULL,
    "em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogAcesso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Pessoa_tipo_nomeBusca_idx" ON "Pessoa"("tipo", "nomeBusca");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_login_key" ON "Usuario"("login");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_pessoaId_key" ON "Usuario"("pessoaId");

-- CreateIndex
CREATE INDEX "LogAcesso_pessoaId_em_idx" ON "LogAcesso"("pessoaId", "em");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogAcesso" ADD CONSTRAINT "LogAcesso_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogAcesso" ADD CONSTRAINT "LogAcesso_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

