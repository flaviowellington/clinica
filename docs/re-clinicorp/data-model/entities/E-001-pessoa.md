# E-001 Pessoa (paciente ou dentista)
Product term: Paciente / Dentista / Profissional · Parent: none · Status: draft

## Fields

| Field | Type | Required | Default | Constraints or enum | Source |
|---|---|---|---|---|---|
| id | number | sim | | | [net EV-004] |
| Type | enum | sim | | PATIENT, DENTIST | [net EV-004] |
| Name | string | sim | | | [net EV-004] |
| NameSearch | string | sim | | nome normalizado para busca | [net EV-004] |
| BirthDate | iso-date | sim (paciente) | | máscara dd/mm/aaaa na UI | [net EV-004] [obs EV-009] |
| SK_BirthDay | number | sim | | chave para aniversariantes | [net EV-004] |
| NoEmail | string | não | | "Não possui e-mail" | [net EV-004] |
| Email | email | não | | | [net EV-003] |
| MobilePhone | string | não | | celular/WhatsApp com país (+55) | [net EV-003] [obs EV-009] |
| DocumentId | numeric-string | não | | CPF (máscara 000.000.000-00) | [net EV-003] [obs EV-009] |
| OtherDocumentId, OtherDocumentIdSearch | numeric-string | não | | RG | [net EV-003] |
| Sex / Sex-1 | string | não | | Masculino, Feminino, Outro | [net EV-004] [obs EV-009] |
| CivilStatus | string | não | | estado civil | [net EV-003] |
| Active | string | sim | | badge "Ativo" | [net EV-004] [obs EV-005] |
| CreatedAt, CreateAtomicDate | iso-date / number | sim | | | [net EV-004] |
| numero_carteirinha | string | não | null | nº da carteirinha do plano/convênio | [net EV-004] |
| GeneralComission, PlanComission, DiscountTaxPercentage | number | não | null | comissões (dentista) e desconto | [net EV-004] |
| Color | hex-color | não | | cor do dentista na agenda | [net EV-003] |
| CRO, Council | string | não | | registro no conselho (dentista) | [net EV-003] |
| Specialties | array {id, Description} | não | | especialidades (dentista) | [net EV-004] |
| UserName | string | não | | login do dentista | [net EV-003] |
| City, state | string | não | | UF | [net EV-003] |
| z_Inserted_Date, z_LastChange_Date | iso-date | sim | | auditoria em todo registro | [net EV-004] |
| z_Inserted_UserId, z_LastChange_UserId | number | sim | | usuário | [net EV-004] |
| z_Inserted_Server_Tool, z_LastChange_Server_Tool, z_*_FingerPrintId | string/number | sim | | origem da escrita | [net EV-004] |

Campos só da UI de cadastro (nome do campo na API não confirmado): Apelido, Telefone fixo, Como conheceu (Google, Instagram, Facebook, Indicado por, Escola, Outdoor, Panfleto, Placa, Plano/Convênio, Rádio, TV, Revista, Outros), Indicado por, Observações [obs EV-009].

## Relations

| Relation | Target | Cardinality | On delete | Source |
|---|---|---|---|---|
| agendamentos | E-002 | 1:N | não testado | [net EV-003] |
| orçamentos/tratamentos | E-003 | 1:N | não testado | [net EV-008] |
| alertas de retorno | E-008 | 1:N | não testado | [net EV-003] |

## Lifecycle
Ativo (único estado observado).

## System fields

| Field | Set when | Source |
|---|---|---|
| CreatedAt, z_Inserted_* | criação | [net EV-004] |

## Rules

- R-001, R-002, R-003

## Not tested

- Inativação, exclusão, mesclagem de duplicados, campos de endereço (aba Complemento).