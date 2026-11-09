-- Remove o cadastro de medicamentos das configurações.
DELETE FROM "Configuracao" WHERE "chave" = 'medicamentos';
