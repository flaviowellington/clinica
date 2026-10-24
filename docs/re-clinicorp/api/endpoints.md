# Endpoints

IDs in paths are `:id`. Shapes and types only; no real values. Base: `https://api.clinicorp.com` (prefixos `/api`, `/solution/api`, `/security`, `/servicedesk`, `/gc-api`). Microfrontends servidos em `/mfe/<nome>/current/mf-manifest.json` (Module Federation) [net EV-001].

## Autenticação e sessão

| Method | Template | Triggered by | Request shape | Response shape | Evidence |
|---|---|---|---|---|---|
| POST | /security/user/login | Entrar | username, password, clientId (uuid), authMethod, loginType, tzoffset | user {id, namespace, SubscriptionType, SubscriptionStatus, Demo, ClinicList, token, refreshToken…} | [net EV-001] |
| POST | /security/user/get_user_permissions_access | após login | user_id | Demo, RoleList, Config (~224 feature flags), PermissionList[].accessList (menus e rotas) | [net EV-001] |
| GET | /api?_AccessPath&_onlyLogAccess | navegação | — | {ok} | [net EV-001] |
| POST | /api/access_log | abrir ficha/aba | _onlyLogAccess, _AccessPath, AddInfo | {ok} | [net EV-004] |

## Agenda

| Method | Template | Triggered by | Request shape | Response shape | Evidence |
|---|---|---|---|---|---|
| GET | /api/appointment/list?_AccessPath&canceled&clinic_id&from&to&without_status | abrir agenda | — | {list: Agendamento[]} | [net EV-003] |
| GET | /api/appointment/get_day_slots?clinic_id | agenda / nova consulta | — | [{time, isFree, isAvailable, isDouble, isSelectable, slotTime, toTime}] | [net EV-003] |
| GET | /api/appointment/get_morning_slots, get_afternoon_slots ?clinic_id&wd | nova consulta | — | horários | [net EV-014] |
| GET | /api/appointment/list_categories | nova consulta | — | {list: [{id, Description, Color, default}]} | [net EV-003] |
| GET | /api/status/list_status?reference | agenda | — | {list: Status[]} | [net EV-003] |
| GET | /api/appointment_ret/list?Limit&clinic_id&status&to | lateral da agenda | — | {alerts: AlertaRetorno[], cursor} | [net EV-003] |
| GET | /api/dentist/list_active?professionalToBeDefined | agenda | — | {list: Pessoa(DENTIST)[]} | [net EV-003] |
| GET | /api/business/list | agenda | — | Clinica[] | [net EV-003] |
| POST | /api/appointment/create | Confirmar consulta | Agendamento sem id + IgnoreSameName | Agendamento | [net EV-014] |
| POST | /api/appointment/change_status | seletor de status | id, StatusId | Agendamento (+CheckinTime, WaitStart) | [net EV-016] |
| GET | /api/crm/appointment_campaign/check?PatientName&PersonId | nova consulta | — | não capturado | [net EV-014] |
| GET | /api/payment/list_overdue_payments?person_id | cartão da consulta | — | não capturado | [net EV-016] |
| — | exclusão de consulta | lixeira | não capturado | — | [obs EV-019] |

## Pacientes

| Method | Template | Triggered by | Request shape | Response shape | Evidence |
|---|---|---|---|---|---|
| GET | /gc-api/person/search?limit&name&onlyPatient | busca + ENTER | — | lista | [obs EV-009] |
| POST | /api/patient/create | Cadastrar paciente | Name, BirthDate, NoEmail, CreatedAt, _AccessPath | Pessoa | [net EV-004] |
| GET | /solution/api/patient/get?id | abrir ficha | — | Pessoa | [net EV-004] |
| GET | /api/patient/next_appointments?fromAtomicDate&patientId | Visão Geral | — | {list} | [net EV-004] |
| GET | /api/patient_note/list?PatientId | Visão Geral | — | {list} | [net EV-004] |
| GET | /api/anamnesis_new/list_new_anamnesis?PatientId | Anamnese | — | [] | [net EV-004] |
| GET | /api/patient_odontogram/get_patient_odontogram?PatientId | Odontograma | — | não capturado | [net EV-010] |
| GET | /api/patient/document_list?id&removeSTL&withDeleted | Documentos | — | não capturado | [net EV-010] |
| GET | /api/payment/list_payments?PatientId; /api/accounting/list?person_id | Financeiro | — | {list} | [net EV-010] |
| GET | /api/patient/picture_list?id; list_picture_folders; get-pictures-by-kind | Fotos | — | não capturado | [net EV-010] |
| POST | /solution/api/diagnostic_partner_integration/person_diagnostic/check_association | Exames | — | não capturado | [net EV-010] |

## Orçamentos e tratamento

| Method | Template | Triggered by | Request shape | Response shape | Evidence |
|---|---|---|---|---|---|
| GET | /api/treatment/list_estimates?patient_id | aba Orçamentos | — | {list} | [net EV-004] |
| GET | /solution/api/price/list_pricelist; /solution/api/price/list_price?price_list_id&valid | editor | — | tabelas e preços | [net EV-006] |
| GET | /solution/api/characteristic/get_form_payment | editor | — | {list: formas (Type PAYMENT_FORM)} | [net EV-006] |
| GET | /solution/api/treatment/get_estimate_details?id | abrir orçamento | — | não capturado | [net EV-013] |
| POST | /solution/api/appointment/save_treatment | Salvar | ver EV-008 (estimateOperations, estimatePayment, …) | Tratamento (Status OPEN) | [net EV-008] |
| POST | /solution/api/treatment/approve_estimate | Aprovar > Confirmar | igual a save_treatment + id, ApprovedDate, IdempotencyKey | {treatment{PaymentPlan[], ChargeOperations[]}, SK_TriggerEventEventKey, addInfo.handler} | [net EV-013] |
| GET | /solution/api/core/treatment/check_disapprove_estimate?treatmentId | Desaprovar / Cancelar | — | não capturado | [obs EV-021] |
| GET | /api/loan_partner/loan/get_patient_loans?patientId; /solution/api/loan_partner/loan_account/get_enabled_accounts | Orçamentos | — | [] | [net EV-006] |

## Outros

| Method | Template | Triggered by | Request shape | Response shape | Evidence |
|---|---|---|---|---|---|
| POST | /solution/api/plans/notify-expired-installments | carregar a home | {} | {countByForm{AUTOBILLET, CHARGECARD}} | [net EV-001] |
| GET | /solution/api/core/notification_feed?legacy&limit; /unread_count | home | — | {items, cursor, atEnd} / {unread} | [net EV-001] |
| GET | /servicedesk/api/cliniDesk/message/get_unread_messages | home | — | {list} | [net EV-001] |
| GET/PUT | /solution/api/smartboard/* (board, lane, item, entities-data) | Controle Protético, Indicações | — | kanban | [net EV-018, EV-010] |

## Terceiros observados

Google Ads/Analytics/DoubleClick (home) [net EV-001]; endpoint de eventos em AWS us-west-2 com pixel Meta e advanced matching em cliques [net EV-019]; CliniChat em `servicedesk.clinicorp.tech` (iframe) [obs EV-009].
