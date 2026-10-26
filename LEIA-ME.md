# Leia-me: como começar

Esta pasta é o ponto de partida do sistema próprio da clínica. Ela já traz toda a especificação, tirada de um estudo do Clinicorp: telas, regras, banco de dados, permissões, design e testes de aceitação.

## O que tem aqui

| Item | O que é |
|---|---|
| `CLAUDE.md` | Instruções que o Claude Code lê sozinho ao abrir a pasta. |
| `docs/re-clinicorp/COMECE-AQUI.md` | Decisões do projeto: escopo, o que fica de fora, ordem de construção. **Leia primeiro.** |
| `docs/re-clinicorp/REPORT.html` | Relatório completo do estudo para ler no navegador. |
| `docs/re-clinicorp/rules/` | Regras de cada parte (agenda, pacientes, prontuário, orçamento, configurações). |
| `docs/re-clinicorp/clone/parity.md` | Lista de testes de aceitação: uma linha por regra. |
| `docs/re-clinicorp/data-model/` | Entidades, diagrama e permissões por perfil. |
| `docs/re-clinicorp/evidence/` | Capturas de tela e registros das chamadas do sistema original. |

## Passo a passo

1. Descompacte esta pasta onde vai ficar o projeto e, se quiser, inicie um repositório git nela.
2. Abra o REPORT.html no navegador para ter uma visão geral.
3. Abra a pasta no Claude Code e comece com:

   > Leia o CLAUDE.md, o docs/re-clinicorp/COMECE-AQUI.md e o docs/re-clinicorp/BUILD.md. Depois proponha a tecnologia e um plano da primeira etapa: banco de dados, login com perfis e cadastro de pacientes, com os testes do parity.md correspondentes.

4. Construa em etapas, na ordem do COMECE-AQUI.md, e valide cada etapa com a clínica antes de seguir.

## E-mail da clínica (confirmação de consultas)

O sistema envia o e-mail de confirmação pelo Nodemailer. Para ligar, preencha no `server/.env` (o modelo está em `server/.env.example`):

- `SMTP_USUARIO`: o e-mail da clínica.
- `SMTP_SENHA`: no Gmail, uma "senha de app" (Conta Google > Segurança > Verificação em duas etapas > Senhas de app), não a senha normal.
- `EMAIL_REMETENTE`: o nome e o e-mail que o paciente vê.
- `URL_PUBLICA`: o endereço do sistema na internet, usado no link de confirmação.

Reinicie o servidor e use Configurações > E-mail e mensagens > Enviar teste. WhatsApp e SMS já têm o código pronto, comentado, em `server/src/mensagens.ts`, à espera de um provedor contratado.

## Cuidados

- Nunca use dados reais de pacientes para testar.
- Não use nome, logo nem textos do Clinicorp.
- Dúvidas de negócio (como a clínica trabalha) vão para o responsável pelo projeto, não para suposições.
