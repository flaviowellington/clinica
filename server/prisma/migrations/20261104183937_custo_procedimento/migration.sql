-- AlterTable
ALTER TABLE "ItemOrcamento" ADD COLUMN     "custoCentavos" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Procedimento" ADD COLUMN     "custoCentavos" INTEGER NOT NULL DEFAULT 0;
