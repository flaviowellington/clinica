-- Odontograma: dentes sem coroa e dentes removidos, marcados pelos botões (não são procedimentos).
ALTER TABLE "Pessoa" ADD COLUMN "dentesSemCoroa" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Pessoa" ADD COLUMN "dentesRemovidos" TEXT[] DEFAULT ARRAY[]::TEXT[];
