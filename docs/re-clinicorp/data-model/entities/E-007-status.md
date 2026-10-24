# E-007 Status configurável
Product term: Status (agenda e orçamento) · Parent: none · Status: draft

## Fields

| Field | Type | Required | Default | Constraints or enum | Source |
|---|---|---|---|---|---|
| id | number | sim | | | [net EV-003] |
| Type | enum | sim | | agenda: CONFIRMED, ARRIVED, IN_SESSION…; orçamento: OPEN, APPROVED | [net EV-003, EV-006] |
| Description | string | sim | | rótulo exibido (Agendado, Confirmado, Em espera, Em atendimento, Atendido, Atrasado, Faltou) | [net EV-003] [obs EV-015] |
| Reference, ReferenceType | string | sim | | a que objeto o status se aplica | [net EV-006] |
| Color | hex-color | não | | | [net EV-003] |
| Active | string | sim | | | [net EV-003] |

## Relations

| Relation | Target | Cardinality | On delete | Source |
|---|---|---|---|---|
| agendamentos | E-002 | 1:N | | [net EV-016] |

## Lifecycle
Configuração da conta.

## System fields

| Field | Set when | Source |
|---|---|---|
| z_LastChange_* | edição | [net EV-003] |

## Rules

- R-024, R-030

## Not tested

- Criar/editar status (perfil Dentista sem acesso a Configurações).