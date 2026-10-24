# S-003 Ficha do paciente
Features: F-005, F-006, F-008, F-009 · URL: `/` (sem rota própria) · Status: draft

## Purpose
Prontuário completo: cadastro, orçamentos, financeiro, fotos, plano e ficha clínica, odontograma, anamnese, documentos, exames, recibos, agendamentos e indicações.

## Entry points
Lista de pacientes; botão "Prontuário" no cartão da consulta; criação de paciente [obs EV-009, EV-015].

## Anatomy

![Anatomy](../evidence/EV-005-paciente-visao-geral.jpg)

| # | Region | Contents | Component | Evidence |
|---|---|---|---|---|
| 1 | Cabeçalho | iniciais, nome, telefone, badge Ativo, Consultar CPF, ⋮ | — | [obs EV-005] |
| 2 | Abas | Visão Geral, Orçamentos, Financeiro, Fotos, Plano e Ficha Clínica, Fichas Especialidades, Odontograma, Anamnese, Documentos, Exames, Recibos, Agendamentos, Indicações | — | [obs EV-009, EV-010] |
| 3 | Visão Geral | Informações (Cadastro/Contato/Complemento), Crédito SPC Serasa, Próximo agendamento, Anamnese, Alerta de retorno, Orçamentos em aberto, Notas Gerais | — | [obs EV-009] |

## Data shown

| Element | Entity.field | Evidence |
|---|---|---|
| Cadastro | E-001 (Apelido, BirthDate+idade, CPF, RG, Estado civil, Sexo, E-mail, Telefone, Como conheceu, Plano, Nº Plano, Cadastrado em, Observações) | [obs EV-009] |
| Financeiro | lançamentos: Lançamento, Hora, Descrição, Contrato, Valor a Pagar, Valor Pago, Saldo, Forma Pagto., Parcelas, Pagamento, Status | [obs EV-010, EV-013] |
| Odontograma | E-004 por dente, legenda A realizar / Executado / Existente | [obs EV-011] [net EV-013] |

## States

| State | How to reach it | What it shows | Evidence |
|---|---|---|---|
| Empty | paciente novo | cada aba com estado vazio e chamada à ação | [obs EV-010] |
| Typical | após aprovar orçamento | Financeiro, Plano e Odontograma preenchidos | [net EV-013] |
| Integração ausente | aba Exames | "Centro Radiológico não integrado." | [obs EV-010] |

## Interactions

| Trigger | Result | Request | Persistence scope | Evidence |
|---|---|---|---|---|
| Abrir ficha/aba | grava log de acesso | POST /api/access_log | conta | [net EV-004] |
| Trocar de aba | carrega dados da aba | ver EV-010 | — | [net EV-010] |

## Keyboard and accessibility

| Check | Result | Evidence |
|---|---|---|
| Abas roláveis com setas ‹ › | sim, em largura estreita | [obs EV-011] |

## Microcopy

| Element | Text | Evidence |
|---|---|---|
| Odontograma vazio | "Clique no botão adicionar procedimento ou clique 2x em um dente para começar." | [obs EV-011] |

## Rules

- R-001, R-002, R-003, R-019

## Not tested

- Anamnese (criar), fichas de especialidade, upload de fotos e documentos, assinatura eletrônica, recibos, notas, alerta de retorno, consulta de CPF/SPC (pago por uso), edição do cadastro, exclusão do paciente.
