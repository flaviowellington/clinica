# Leia-me

## E-mail da clínica (confirmação de consultas)

O sistema envia o e-mail de confirmação pelo Nodemailer. Para ligar, preencha no `server/.env` (o modelo está em `server/.env.example`):

- `SMTP_USUARIO`: o e-mail da clínica.
- `SMTP_SENHA`: no Gmail, uma "senha de app" (Conta Google > Segurança > Verificação em duas etapas > Senhas de app), não a senha normal.
- `EMAIL_REMETENTE`: o nome e o e-mail que o paciente vê.
- `URL_PUBLICA`: o endereço do sistema na internet, usado no link de confirmação.

Reinicie o servidor e use Configurações > E-mail e mensagens > Enviar teste. WhatsApp e SMS já têm o código pronto, comentado, em `server/src/mensagens.ts`, à espera de um provedor contratado.
