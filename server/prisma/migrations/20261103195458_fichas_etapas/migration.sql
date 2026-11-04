-- AlterTable
ALTER TABLE "FichaEspecialidade" ADD COLUMN     "etapas" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "fim" DATE,
ADD COLUMN     "inicio" DATE,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'Em andamento';

-- AlterTable
ALTER TABLE "ItemFichaEspecialidade" ADD COLUMN     "data" DATE;
