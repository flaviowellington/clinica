-- Controle protético não tem mais a etapa "Retorno à clínica": os cartões nela vão para "Agendar instalação".
UPDATE "TrabalhoProtetico" SET "etapa" = 'AGENDAMENTO' WHERE "etapa" = 'RETORNO';

ALTER TYPE "EtapaProtetica" RENAME TO "EtapaProtetica_old";
CREATE TYPE "EtapaProtetica" AS ENUM ('PRE_ENVIO', 'EM_LABORATORIO', 'AGENDAMENTO', 'INSTALADO');
ALTER TABLE "TrabalhoProtetico" ALTER COLUMN "etapa" DROP DEFAULT;
ALTER TABLE "TrabalhoProtetico" ALTER COLUMN "etapa" TYPE "EtapaProtetica" USING ("etapa"::text::"EtapaProtetica");
ALTER TABLE "TrabalhoProtetico" ALTER COLUMN "etapa" SET DEFAULT 'PRE_ENVIO';
DROP TYPE "EtapaProtetica_old";
