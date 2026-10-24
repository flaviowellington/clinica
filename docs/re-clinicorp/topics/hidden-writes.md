# Hidden writes

Escritas que acontecem sem o usuário clicar em "Salvar".

| Where | Trigger | What is written | Scope | Evidence |
|---|---|---|---|---|
| Home (após login) | carregar a tela inicial | `POST /solution/api/plans/notify-expired-installments` (devolve contagem por forma: AUTOBILLET, CHARGECARD) | conta | [net EV-001] |
| Ficha do paciente | abrir a ficha ou trocar de aba | `POST /api/access_log` com `_AccessPath` (log de auditoria) | conta | [net EV-004] |
| Controle Protético | abrir a tela | `PUT /solution/api/smartboard/board/update` | quadro do kanban | [net EV-018] |
| Agenda | abrir um agendamento | nenhuma escrita observada (só GETs) | — | [net EV-016] |

## Not tested

- O que exatamente o `PUT board/update` altera (só o formato da URL foi gravado).
- Se a troca de visualização da agenda (Dia/Semana/Mês) ou as opções da engrenagem persistem por usuário (não foram alteradas, para não mudar preferências).

## Session s02 (Administrador)

| Where | Trigger | What is written | Scope | Evidence |
|---|---|---|---|---|
| Controle de Indicação / Protético | abrir a tela | `PUT /solution/api/smartboard/board/update` grava só LastInteraction e LastIndex | quadro | [net EV-025] |
| Contas a Pagar | abrir a aba | `POST /solution/api/fintech/bank_account/permissions_dda` (consulta via POST) | — | [net EV-022] |
| Configurações de Caixa | mudar opção | salvamento automático declarado na tela (não exercitado) | conta | [obs EV-024] |
