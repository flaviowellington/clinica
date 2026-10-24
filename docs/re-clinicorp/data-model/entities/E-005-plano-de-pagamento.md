# E-005 Plano de pagamento e parcelas
Product term: Forma de Pagamento / PaymentPlan / InstallmentList · Parent: E-003 · Status: draft

## Fields

| Field | Type | Required | Default | Constraints or enum | Source |
|---|---|---|---|---|---|
| id | number | sim | | | [net EV-013] |
| Type | enum | sim | | CHARGE (após aprovação) | [net EV-013] |
| PaymentType | enum | sim | | TOTAL, PROCEDURE | [net EV-008] [obs EV-009] |
| PaymentForm / PaymentForm_CharacteristicId | number | sim | | BOLETO, CREDIT_CARD, DEBIT_CARD, CHECK, CASH, PIX_CHARGE, TRANSFER; A Definir (-9); Múltiplas (-1) | [net EV-008] [obs EV-009] |
| InitialPayment | string | não | | entrada | [net EV-008] |
| InstallmentsCount | number | sim | 0 | | [net EV-008] |
| Amount, Discount, DiscountAmount | number | sim | 0 | | [net EV-008] |
| InstallmentList[] | array | | | {Sequence, Installment, DueDate, PaymentForm_CharacteristicId, Amount, Modified} | [net EV-008] |
| Approved, ApprovedDate, ApprovedOperations[] | | | | | [net EV-013] |
| PatientId, BusinessId, Date | | | | | [net EV-013] |
| z_Inserted_Date, z_LastChange_Date | iso-date | sim | | auditoria em todo registro | [net EV-004] |
| z_Inserted_UserId, z_LastChange_UserId | number | sim | | usuário | [net EV-004] |
| z_Inserted_Server_Tool, z_LastChange_Server_Tool, z_*_FingerPrintId | string/number | sim | | origem da escrita | [net EV-004] |

## Relations

| Relation | Target | Cardinality | On delete | Source |
|---|---|---|---|---|
| tratamento | E-003 | N:1 | cancelado com o tratamento | [net EV-013] [obs EV-020] |

## Lifecycle
Plano do orçamento → plano CHARGE na aprovação → lançamento "Lançamento de Tratamento" no financeiro [net EV-013].

## System fields

| Field | Set when | Source |
|---|---|---|
| ApprovedDate | aprovação | [net EV-013] |

## Rules

- R-015, R-016, R-019, R-026

## Not tested

- Entrada, Múltiplas, baixa de pagamento, recibo, boleto real (custo por uso).