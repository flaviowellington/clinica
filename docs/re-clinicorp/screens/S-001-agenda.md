# S-001 Agenda
Features: F-001, F-002, F-004 · URL: `/calendar` · Status: draft

## Purpose
Ver e operar o dia da clínica por profissional: marcar, mudar status (check-in) e excluir consultas, e ver alertas de retorno.

## Entry points
Menu lateral > Agenda; card "Agenda" na tela inicial [obs EV-009].

## Anatomy

![Anatomy](../evidence/EV-002-agenda-dia-masked.jpg)

| # | Region | Contents | Component | Evidence |
|---|---|---|---|---|
| 1 | Barra superior | Novo ▾, recolher lateral, ‹ Hoje ›, data, atualizar, Visualizar por (Dia/Semana/Mês), imprimir, engrenagem | — | [obs EV-009] |
| 2 | Lateral | minicalendário mensal, Profissionais (Todos + checkbox), Alertas de Retorno (nome + dd/mm) | — | [obs EV-002, EV-009] |
| 3 | Grade | uma coluna por profissional com "Pacientes: N"; linhas de 15 min a partir de 8:00; linha vermelha do horário atual | — | [obs EV-002, EV-017] |
| 4 | Cartão da consulta (popover) | paciente, telefone, Prontuário, faixa financeira, data e horário, profissional, editar/desmarcar/excluir, Categoria & Marcadores, "Agendado por…", status | C-005 | [obs EV-015, EV-019] |

## Data shown

| Element | Entity.field | Evidence |
|---|---|---|
| Bloco da consulta | E-002.PatientName, fromTime, toTime | [net EV-003] |
| Cor/categoria | E-002.CategoryDescription, CategoryColor | [net EV-014] |
| Status | E-002.StatusId → E-007 | [net EV-016] |
| Alertas de retorno | E-009.PatientName, ReturnDateDesc | [net EV-003] |

## States

| State | How to reach it | What it shows | Evidence |
|---|---|---|---|
| Empty | dia sem consultas | grade azul clara, "Pacientes: 0" | [obs EV-002] |
| Loading | — | não observado | — |
| Typical | 1 consulta | bloco "[nome], 17 - 17:15h" | [obs EV-015] |
| Many items | — | não testado | — |
| Long text | — | não testado | — |
| Error | — | não testado | — |
| No permission | — | não testado | — |
| Plan-gated | — | não observado | — |

## Interactions

| Trigger | Result | Request | Persistence scope | Evidence |
|---|---|---|---|---|
| Novo ▾ | menu: Novo agendamento, Novo compromisso, Alerta de retorno | — | — | [obs EV-009] |
| Clique na consulta | abre cartão | GET patient/get, list_overdue_payments, tag_template | — | [net EV-016] |
| Trocar status | grava status e, em "Em espera", check-in | POST /api/appointment/change_status | conta | [net EV-016] |
| Lixeira | confirmação "Excluir consulta" | não capturado | conta | [obs EV-019] |

## Keyboard and accessibility

| Check | Result | Evidence |
|---|---|---|
| Tab order | não testado | — |
| Arrow keys | não testado | — |
| Shortcuts | não observados | — |
| Focus visible | não testado | — |
| Escape | fecha menus e o cartão | [obs EV-009] |
| Unlabeled controls | ícones do cartão (editar, desmarcar, excluir) sem aria-label (B-001) | [obs EV-019] |

## Microcopy

| Element | Text | Evidence |
|---|---|---|
| Aviso de alerta | "Não é possível enviar alertas para agendamentos no mesmo dia, pois o envio automático ocorre às 7h da manhã." | [net EV-014] |
| Excluir | "Tem certeza que deseja excluir a consulta de [paciente]? Esta ação não pode ser desfeita." | [obs EV-019] |

## Rules

- R-020, R-021, R-022, R-023, R-024, R-025, R-027, R-028, R-029, R-030, R-031, R-032, R-033, R-034, R-035

## Realtime and performance

| Check | Result | Evidence |
|---|---|---|
| A change in a second tab appears without reload | não testado (recarregar derruba a sessão) | — |
| Loading pattern (skeleton, spinner, optimistic update) | não observado | — |
| Delays the user sees | toasts após ~1 s | [obs EV-014] |

## Responsive

| Width | Change | Evidence |
|---|---|---|
| 735px | lateral recolhível; cartão da consulta passa da borda direita (B-005) | [obs EV-019] |

## Not tested

- Visões Semana e Mês, arrastar consulta, consulta com procedimentos (duração), lista de espera, compromisso, alerta de retorno, impressão; persistência das opções da engrenagem (não alteradas).
- Endpoint de exclusão (gravador não pegou).
