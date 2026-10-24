# Screens

| ID | Screen | URL pattern | Entry points | Features | File |
|---|---|---|---|---|---|
| S-001 | Agenda (Dia/Semana/Mês) | /calendar | Menu > Agenda; card "Agenda" na home | F-001, F-002, F-004 | screens/S-001-agenda.md |
| S-002 | Pacientes (busca e lista) | / (módulo Pacientes, sem rota própria) | Menu > Pacientes; card "Pacientes" | F-005 | screens/S-002-pacientes.md |
| S-003 | Ficha do paciente (13 abas) | / (sem rota própria; "Voltar para Pacientes") | linha da lista; busca global; cartão da consulta > Prontuário | F-005, F-006, F-009, F-008 | screens/S-003-ficha-paciente.md |
| S-004 | Orçamentos do paciente | aba da ficha | Ficha > Orçamentos; Visão Geral > Ver orçamentos | F-007, F-010 | screens/S-004-orcamentos.md |
| S-005 | Início | / | após login | — | — |
| S-006 | Controle Protético (kanban) | /prosthetic_control | Menu > Controle Protético | F-017 | — |
| S-007 | Login | /auth/login?from | sessão expirada ou recarregar a página | F-018 | — |
| S-008 | Termos de Uso | /termos | link público | — | — |
| S-009 | Financeiro (12 abas) | / (sem rota própria) | Menu > Financeiro (Administrador) | F-009, F-010, F-028, F-032 | — |
| S-010 | Relatórios (~40) | /reports, /reports/appointment/general | Menu > Relatórios | F-014 | — |
| S-011 | Dashboard Analítico | /group/analytic_dashboard | Menu > Dashboard Analítico | F-014 | — |
| S-012 | Usuários e Permissões | /management/users | Menu > Usuários e Permissões | F-023 | — |
| S-013 | Profissionais | /professionals | Menu > Profissionais | F-024 | — |
| S-014 | Configurações (25 telas) | /settings/* (blocks, schedule-general, online-scheduling, confirmations-alerts, business-hours, electronic-signature, clinic-general, google-profile, clinipay, teller, bank-accounts, data-export, data-admin, drugs, estimate, expertise, price-lists, record-general, anamnesis, radiology-centers, digital-diagnosis, documents, receipts, reports, security, payment-fees) | Menu > Configurações | F-025, F-029, F-030, F-031 | — |
| S-015 | Confirmação e Alertas | /alert_confirmation_control | Menu > Confirmação e Alertas | F-002 | — |
| S-016 | Controle de Indicação | /referral_control | Menu > Controle de Indicação | F-026 | — |
| S-017 | Gestão de Alinhadores | /marketplace/aligners-management | Menu > Gestão de Casos de Alinhadores | F-017 | — |
| S-018 | Planos (upsell) | /plans_upsell | Menu > Planos | F-027 | — |
| S-019 | Clinipay (portal) | /fintech/account_management_v2/portal | Menu > Clinipay | F-010 | — |
