-- AlterTable
ALTER TABLE "Pessoa" ADD COLUMN     "horariosIndisponiveis" TEXT[] DEFAULT ARRAY[]::TEXT[];
