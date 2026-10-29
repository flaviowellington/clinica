-- Foto do profissional (recortada e reduzida no servidor).
ALTER TABLE "Pessoa" ADD COLUMN "foto" BYTEA,
ADD COLUMN "fotoEm" TIMESTAMP(3);
