# S-002 Pacientes
Features: F-005 · URL: `/` (módulo, sem rota própria) · Status: draft

## Purpose
Buscar, cadastrar e abrir pacientes.

## Entry points
Menu > Pacientes; card "Pacientes" na home; busca global "Encontre pacientes ou funções do sistema" [obs EV-009].

## Anatomy

| # | Region | Contents | Component | Evidence |
|---|---|---|---|---|
| 1 | Cabeçalho | "Pacientes", subtítulo, botão "Novo paciente" | — | [obs EV-009] |
| 2 | Busca | "Pesquise por nome ou sobrenome…", ajuda sobre ENTER e "%" | — | [obs EV-009] |
| 3 | Resultado | tabela Nome, Celular / WhatsApp, Nascimento, Email, Como conheceu, Status; "N Registro"; linhas por página 10; paginação | — | [obs EV-009] |
| 4 | Formulário Novo paciente (diálogo) | ver EV-009 | — | [obs EV-009] |

## Data shown

| Element | Entity.field | Evidence |
|---|---|---|
| Linha | E-001.Name, MobilePhone, BirthDate, Email, Como conheceu, Active | [obs EV-009] [net EV-004] |

## States

| State | How to reach it | What it shows | Evidence |
|---|---|---|---|
| Empty | abrir a tela | só a busca, sem lista | [obs EV-009] |
| Typical | buscar "[RE]" + ENTER | 1 registro | [obs EV-009] |

## Interactions

| Trigger | Result | Request | Persistence scope | Evidence |
|---|---|---|---|---|
| Digitar + ENTER | busca | GET /gc-api/person/search?limit&name&onlyPatient | — | [obs EV-009] |
| Novo paciente > Cadastrar | cria e abre a ficha | POST /api/patient/create | conta | [net EV-004] |

## Keyboard and accessibility

| Check | Result | Evidence |
|---|---|---|
| ENTER dispara a busca | sim | [obs EV-009] |

## Microcopy

| Element | Text | Evidence |
|---|---|---|
| Ajuda da busca | "Digite o nome do paciente e pressione ENTER, para pesquisar pelo sobrenome digite % antes." | [obs EV-009] |
| Toast | "Paciente cadastrado com sucesso" | [net EV-004] |

## Rules

- R-001, R-002, R-004

## Not tested

- Validação de CPF, duplicidade de nome, telefone internacional, importação de pacientes, paginação com muitos registros, exclusão de paciente.
