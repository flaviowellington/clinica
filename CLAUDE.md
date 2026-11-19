# Sistema da clínica

Sistema de gestão odontológica próprio para **uma única clínica**, para substituir o Clinicorp que ela usa hoje. Não é SaaS: sem multi-clínica, planos ou cobrança de assinatura.

## Tecnologia e pastas

Monorepo npm (workspaces `server` e `web`), Node 22 (`.nvmrc`), TypeScript em tudo.
- `server/`: API Express 5 + Prisma 7 sobre PostgreSQL. Um arquivo por módulo em `server/src/` (agenda, pacientes, prontuario, financeiro…), montados em `app.ts`. Schema e migrações em `server/prisma/`. O cliente gerado (`server/src/generated/`) não vai para o git: sai do `postinstall`.
- `web/`: React 19 + Vite + Tailwind 4, TanStack Router/Query e Zustand. Telas em `web/src/paginas/`, peças reutilizáveis em `web/src/componentes/`.
- `shared/`: regras, validações (zod), máscaras e permissões usadas pelo servidor e pelo front. Regra de negócio que os dois precisam fica aqui, não duplicada.
- `server/test/`: testes Vitest da API (rodam no banco de teste). `e2e/`: testes Playwright.

## Comandos (na raiz)

- `npm run dev`: sobe API (porta 3001) e front (5173) juntos.
- `npm test`: testes da API. `npm run test:permissoes`: conferência de permissões por perfil.
- `npm run e2e`: Playwright; sobe sozinho API na 3101 e front na 5199 com o banco do e2e (pode rodar junto com o `npm test`).
- `npm run lint` e `npm run format` (ESLint + Prettier).
- Banco (`-w server`): `db:migrar` (nova migração), `db:seed` (dados fictícios), `db:seed:logins` (um login por perfil), `db:reset` (apaga e recria com seed).

## Configuração

Tudo em `server/.env` (modelo em `server/.env.example`, fora do git). `DATABASE_URL` é o banco de desenvolvimento; `DATABASE_URL_TESTE` é o dos testes da API e `DATABASE_URL_E2E` o do Playwright; os dois são apagados a cada rodada, então nunca aponte dois deles para o mesmo banco. A senha dos usuários do seed vem de `SEED_SENHA_ADMIN` e afins. E-mail (SMTP), WhatsApp, SMS e n8n também são configurados ali; o `LEIA-ME.md` explica o e-mail.

## Regras do projeto

- Interface e mensagens em português do Brasil.
- Não use o nome, a logo, os ícones nem os textos do Clinicorp. Reproduza o comportamento, não a marca nem o código.
- Dados de saúde (LGPD): nunca use dados reais de pacientes em desenvolvimento ou testes; use dados fictícios. Registre quem abriu cada ficha. Prontuário nunca é apagado de verdade.
- Escreva o teste antes de implementar cada regra.
- Toda tela nova ou alterada segue o padrão de celular de `web/RESPONSIVIDADE.md` (seção 2) e passa na conferência do fim dele.
- Prefira soluções simples: um único aplicativo web e um banco relacional. Sem microsserviços.
- Pagamentos, caixa, mensagens e assinatura digital devem ser projetados de forma simples; pergunte ao responsável quando houver dúvida de negócio.
