# E-009 Tabela de preços e preço de procedimento
Product term: Tabela / Price list / Procedimento · Parent: none · Status: draft

## Fields

| Field | Type | Required | Default | Constraints or enum | Source |
|---|---|---|---|---|---|
| PriceList.id, Name, Type, BillType, InternalCode, IsValid, ValidFrom, Version, ImportKey | | sim | | Type = PROCEDURE | [net EV-006] |
| Price.id, PriceListId | number | sim | | | [net EV-006] |
| Procedure_CharacteristicId, ProcedureName | number/string | sim | | | [net EV-006] |
| ProcedureExpertise_CharacteristicId, ProcedureExpertiseName | number/string | | | especialidade | [net EV-006] |
| Amount, OriginalAmount, ProcedureCost | number | sim | | preço e custo | [net EV-006] |
| Currency | string | sim | | | [net EV-006] |
| CompensationType | string | | | regra de comissão | [net EV-006] |
| HasSteps | string | | | procedimento em etapas | [net EV-006] |

## Relations

| Relation | Target | Cardinality | On delete | Source |
|---|---|---|---|---|
| itens | E-004 | 1:N | | [net EV-008] |

## Lifecycle
Versões com validade (ValidFrom, IsValid).

## System fields

| Field | Set when | Source |
|---|---|---|
| Version | nova versão | [net EV-006] |

## Rules

- R-012, R-013

## Not tested

- Criar tabela, importar tabela, tabela de convênio.