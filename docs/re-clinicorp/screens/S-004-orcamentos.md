# S-004 Orçamentos do paciente
Features: F-007, F-010 · URL: aba da ficha (sem rota) · Status: draft

## Purpose
Criar, precificar, parcelar, aprovar e cancelar orçamentos (planos de tratamento propostos).

## Entry points
Ficha > Orçamentos; Visão Geral > Ver orçamentos [obs EV-009].

## Anatomy

![Anatomy](../evidence/EV-007-orcamento-seletor-dentes.jpg)

| # | Region | Contents | Component | Evidence |
|---|---|---|---|---|
| 1 | Lista | Agrupar Oportunidades, Novo Orçamento; colunas STATUS, DATA, TRATAMENTO, RESPONSÁVEL, CONTRATO, VALOR | — | [obs EV-009] |
| 2 | Editor | criado por, observações (0/11320), tabela de preços, inserir procedimento | C-002 | [obs EV-009] |
| 3 | Procedimento | dentes/região, dentição, odontograma FDI, dentista, valor unitário, Adicionar | C-004 | [obs EV-007] |
| 4 | Painel "Orçamento" | itens, Total Particular, forma de pagamento, Consultar CPF, Aprovar/Cancelar/Salvar | C-003 | [obs EV-009, EV-012] |

## Data shown

| Element | Entity.field | Evidence |
|---|---|---|
| Linha da lista | E-003.Status, CreateDate, itens (procedimento + dente), Dentist, valor | [net EV-008] |
| Item | E-004.Procedure, Tooth, Surface, Amount, Dentist | [net EV-008] |
| Pagamento | E-005 | [net EV-008, EV-013] |

## States

| State | How to reach it | What it shows | Evidence |
|---|---|---|---|
| Empty | paciente novo | "Crie o primeiro orçamento para este paciente." | [obs EV-009] |
| Em Aberto | salvar | status OPEN | [net EV-008] |
| Aprovado | aprovar | somente leitura, menu ⋮ | [net EV-013] [obs EV-021] |

## Interactions

| Trigger | Result | Request | Persistence scope | Evidence |
|---|---|---|---|---|
| Salvar | cria orçamento | POST /solution/api/appointment/save_treatment | conta | [net EV-008] |
| Aprovar > Confirmar | aprova | POST /solution/api/treatment/approve_estimate | conta | [net EV-013] |
| ⋮ > Cancelar/Desaprovar | aviso / pede senha | GET check_disapprove_estimate | — | [obs EV-020, EV-021] |

## Keyboard and accessibility

| Check | Result | Evidence |
|---|---|---|
| Menus Angular Material só respondem a clique real | sim | [obs EV-021] |

## Microcopy

| Element | Text | Evidence |
|---|---|---|
| Confirmação | "Confirma a aprovação do Orçamento?" | [obs EV-012] |
| Sucesso | "Orçamento Aprovado" | [net EV-013] |

## Rules

- R-010 a R-019, R-026, R-036, R-037, R-038

## Not tested

- Descontos (% e R$), limite de desconto com aprovação, Reprovar, Follow Up, Duplicar, contrato após orçamento, envio por e-mail (A5), impressão, "Agrupar Oportunidades", faces do dente (Surface), procedimentos por sessão, Simular taxas de cartões.
