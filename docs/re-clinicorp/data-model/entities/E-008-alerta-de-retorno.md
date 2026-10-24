# E-008 Alerta de retorno
Product term: Alerta de Retorno · Parent: E-001 · Status: draft

## Fields

| Field | Type | Required | Default | Constraints or enum | Source |
|---|---|---|---|---|---|
| id | number | sim | | | [net EV-003] |
| Patient_PersonId, PatientName, PatientMobilePhone | number/string | sim | | | [net EV-003] |
| Dentist_PersonId | number | sim | | | [net EV-003] |
| Clinic_BusinessId | number | sim | | | [net EV-003] |
| AtomicDate, ReturnDateDesc | number/string | sim | | data de retorno (dd/mm na lateral) | [net EV-003] [obs EV-002] |
| Status | number | sim | | | [net EV-003] |
| Reason | string | não | | motivo | [net EV-003] |
| z_Inserted_Date, z_LastChange_Date | iso-date | sim | | auditoria em todo registro | [net EV-004] |
| z_Inserted_UserId, z_LastChange_UserId | number | sim | | usuário | [net EV-004] |
| z_Inserted_Server_Tool, z_LastChange_Server_Tool, z_*_FingerPrintId | string/number | sim | | origem da escrita | [net EV-004] |

## Relations

| Relation | Target | Cardinality | On delete | Source |
|---|---|---|---|---|
| paciente | E-001 | N:1 | | [net EV-003] |

## Lifecycle
Não testado.

## System fields

| Field | Set when | Source |
|---|---|---|
| SK_StatusAtomicDate | criação | [net EV-003] |

## Rules

- R-020

## Not tested

- Criar alerta, disparo automático, planos recorrentes (DefaultPlansList: CONTROLE IMPLANTES, CHECK-UP INFANTIL, PROFILAXIA) [net EV-004].