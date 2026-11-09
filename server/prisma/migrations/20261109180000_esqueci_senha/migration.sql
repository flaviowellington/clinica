-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "codigoExpira" TIMESTAMP(3),
ADD COLUMN     "codigoHash" TEXT,
ADD COLUMN     "codigoTentativas" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "email" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");
