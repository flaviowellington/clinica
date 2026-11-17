-- Foto do usuário (recortada e reduzida no servidor).
ALTER TABLE "Usuario" ADD COLUMN "foto" BYTEA,
ADD COLUMN "fotoEm" TIMESTAMP(3);
