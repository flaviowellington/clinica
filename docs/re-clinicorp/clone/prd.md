# Clone requirements: Clinicorp
Updated: 2026-10-23 · Status: draft (s01 a s02f)

## Problem and users

**Sistema para uma única clínica**: a clínica desta conta, sem multi-tenant, planos, cobrança de assinatura nem onboarding (decisão do usuário, 2026-10-23, ver 00-charter.md). Ela depende do Clinicorp para prontuário, agenda, orçamento e financeiro do dia a dia e quer um sistema próprio, focado nas dores dela. Usuários: dentistas da clínica, recepção, financeiro. O que não foi testado (pagamentos, caixa, configurações gerais, envios) é deduzido e projetado no clone.

Uso real observado nesta clínica: atende só particular (nenhuma tabela de convênio nem guia em 2026), nenhum caso de alinhador, não usa fornecedores, não tem agendamento online ligado, domingo fechado [obs EV-037] [obs EV-041].

## Launch blockers

From `clone/barriers.md`, severity `blocks launch` and `adds lead time`, with who clears each one and when.

| Barrier | Severity | Owner | Start by |
|---|---|---|---|
| BR-002 LGPD dado de saúde (operador, DPO, hospedagem, sem pixels nas telas clínicas) | blocks launch | jurídico + engenharia | mês 1 |
| BR-003 Prontuário eletrônico CFO (requisitos de segurança; ICP-Brasil para sem papel) | blocks launch | jurídico + engenharia | mês 1 |
| BR-004 WhatsApp oficial (Meta/BSP) para confirmações | adds lead time | produto | mês 1 |
| BR-010 Lojas de apps (se houver app) | adds lead time | produto | depois do MVP web |

## Core loop

1. Recepção cadastra o paciente (nome + data de nascimento bastam) — R-001.
2. Marca a consulta na agenda do profissional, em intervalos da clínica — R-021, R-029.
3. Paciente chega: status "Em espera" registra check-in — R-030, R-031.
4. Dentista monta o orçamento: procedimentos da tabela de preços, por dente (FDI), forma de pagamento e parcelas — R-011 a R-016.
5. Orçamento aprovado vira tratamento cobrável: lançamento financeiro, plano de tratamento, itens "A realizar" no odontograma — R-018, R-019.
6. Execução dos procedimentos e recebimento das parcelas (não observado nesta sessão).

## Scope by priority

| Priority | Feature | Rules | Screens | Notes |
|---|---|---|---|---|
| P1 | F-005 Pacientes | R-001, R-002, R-003, R-004 | S-002, S-003 | busca por nome; log de acesso |
| P1 | F-001 Agenda | R-020 a R-035 | S-001 | Dia/Semana/Mês, status, check-in |
| P1 | F-007 Orçamento | R-010 a R-019, R-026, R-036 a R-038 | S-004 | ciclo Em Aberto → Aprovado → Cancelado/Desaprovado |
| P1 | F-006 Prontuário e odontograma | R-019 | S-003 | anamnese e fichas a observar |
| P1 | F-009 Financeiro do paciente | R-019, R-032 | S-003 | lançamentos e saldo |
| P2 | F-010 Pagamentos | R-015, R-016 | S-004 | via PSP parceiro (BR-006) |
| P2 | F-002 Confirmações | R-027, R-028 | S-001 | depende de BR-004 |
| P2 | F-004 Alerta de retorno | R-020 | S-001 | |
| P3 | F-017 Controle protético | — | S-006 | kanban de 5 colunas |
| P2 | F-023 Usuários, perfis e permissões (115 permissões, 6 perfis) | R-040, R-041 | S-012 | matriz em EV-026 |
| P2 | F-009 Financeiro da clínica (contas a pagar/receber, fluxo de caixa, conciliação) | R-052, R-054, R-055 | S-009 | partidas dobradas |
| P2 | F-025 Configurações (bloqueios, segurança, campos obrigatórios) | R-039, R-046, R-047 | S-014 | |
| P3 | F-014 Relatórios (~40) e DRE | R-043 | S-010, S-011 | |
| P3 | F-011 NFS-e | R-053 | — | depois de BR-007 |
| — | F-013 Convênios/TISS, F-017 alinhadores, F-026 indicação, fornecedores | R-087, R-089 | — | fora: a clínica não usa (EV-041) |

## Non-goals

- Multi-clínica, multi-tenant, planos e cobrança de assinatura, marketplace, onboarding de novos clientes.
- Conta digital, maquininha e antecipação próprias (BR-006); crédito ao paciente (BR-012); IA; app nativo no lançamento; consulta SPC.
- Convênios/TISS (BR-001), enquanto a clínica não atender convênio.
- Copiar marca, ícones, textos ou o código do Clinicorp (clean room).

## Data model

See `data-model/erd.mmd` and `data-model/types.ts`. Decisão recomendada: manter "pessoa" única com papel (paciente/profissional) como no original (R-002), mas com tabelas de agenda, tratamento, itens e plano de pagamento normalizadas e colunas de auditoria em tudo.

## Build order

1. Start long lead-time approvals and launch blockers (they run in parallel): LGPD (DPA, DPO, hospedagem no Brasil), requisitos CFO/SBIS, verificação Meta/BSP, conta no PSP e no emissor de NFS-e.
2. Data model and persistence (E-001 a E-009, auditoria, log de acesso).
3. Core loop screens: pacientes, agenda, ficha com odontograma, orçamento.
4. Rules in `clone/parity.md`, P1 first.
5. Secondary features, after the barriers they depend on: confirmações WhatsApp, cobrança (boleto/Pix), NFS-e, convênios/TISS, controle protético.

## Open questions

See `questions.md` (principalmente Q-002 TISS, Q-003 assinatura, Q-007 outros perfis, Q-009 o que decide a compra).
