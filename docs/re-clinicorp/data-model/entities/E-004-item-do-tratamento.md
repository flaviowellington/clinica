# E-004 Item do tratamento (procedimento)
Product term: procedimento do orçamento / ChargeOperation · Parent: E-003 · Status: draft

## Fields

| Field | Type | Required | Default | Constraints or enum | Source |
|---|---|---|---|---|---|
| id | number | sim | | | [net EV-013] |
| TreatmentId | number | sim | | → E-003 | [net EV-013] |
| Procedure_CharacteristicId, PriceId, PriceListId | number | sim | | → E-009 | [net EV-008, EV-013] |
| Tooth | numeric-string | não | | FDI (ex.: "16") | [net EV-008] |
| Surface | string | não | | face do dente | [net EV-008] |
| Amount, OriginalAmount, FinalAmount, MinimumProcedureAmount | number | sim | | valor da tabela e final | [net EV-013] |
| Dentist_PersonId | number | sim | | quem executa | [net EV-013] |
| Sequence | number | sim | | ordem | [net EV-013] |
| BillType | string | sim | | tipo de cobrança (particular) | [net EV-013] |
| Approved, Executed | boolean/string | sim | false | A realizar / Executado | [net EV-013] [obs EV-011] |
| StatusId | number | | | | [net EV-013] |
| PaymentPlanId, PaymentAccounted | number/string | | | | [net EV-013] |
| isVoucher, VoucherSaleId | boolean | | | vale/voucher | [net EV-008] |
| Existing | boolean | | | procedimento "Existente" | [net EV-013] |
| z_Inserted_Date, z_LastChange_Date | iso-date | sim | | auditoria em todo registro | [net EV-004] |
| z_Inserted_UserId, z_LastChange_UserId | number | sim | | usuário | [net EV-004] |
| z_Inserted_Server_Tool, z_LastChange_Server_Tool, z_*_FingerPrintId | string/number | sim | | origem da escrita | [net EV-004] |

## Relations

| Relation | Target | Cardinality | On delete | Source |
|---|---|---|---|---|
| tratamento | E-003 | N:1 | | [net EV-013] |
| preço | E-009 | N:1 | | [net EV-008] |

## Lifecycle
A realizar → Executado; "Existente" para o que já estava na boca [obs EV-011].

## System fields

| Field | Set when | Source |
|---|---|---|
| CreateDate | aprovação | [net EV-013] |

## Rules

- R-011, R-012, R-014, R-019

## Not tested

- Marcar como executado, sessões (ProcedureSessionConfig), procedimentos com etapas (HasSteps).