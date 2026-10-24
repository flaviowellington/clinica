# E-006 Clínica (unidade)
Product term: Clínica / Business · Parent: none · Status: draft

## Fields

| Field | Type | Required | Default | Constraints or enum | Source |
|---|---|---|---|---|---|
| id | number | sim | | | [net EV-003] |
| Type | enum | sim | | CLINIC | [net EV-003] |
| Name | string | sim | | | [net EV-003] |
| Email | email | não | | | [net EV-003] |
| Active | string | sim | | | [net EV-003] |
| SlotTime | number | sim | | tamanho do intervalo da agenda (15 min observado) | [net EV-003] [obs EV-002] |
| WorkingDaysHours | object | sim | | general.monday…saturday {from, to} | [net EV-003] |
| ProfessionalRequired | string | não | | | [net EV-003] |
| z_Inserted_Date, z_LastChange_Date | iso-date | sim | | auditoria em todo registro | [net EV-004] |
| z_Inserted_UserId, z_LastChange_UserId | number | sim | | usuário | [net EV-004] |
| z_Inserted_Server_Tool, z_LastChange_Server_Tool, z_*_FingerPrintId | string/number | sim | | origem da escrita | [net EV-004] |

## Relations

| Relation | Target | Cardinality | On delete | Source |
|---|---|---|---|---|
| agendamentos | E-002 | 1:N | | [net EV-003] |

## Lifecycle
Ativa.

## System fields

| Field | Set when | Source |
|---|---|---|
| z_Inserted_* | criação | [net EV-003] |

## Rules

- R-021

## Not tested

- Múltiplas unidades, horário de almoço, feriados.