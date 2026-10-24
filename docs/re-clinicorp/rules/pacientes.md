# Rules: Pacientes

### R-001 Cadastro de paciente exige só Nome e Data de nascimento
- Given o formulário "Novo paciente" aberto
- When Nome e Data de nascimento estão vazios (ou só o Nome está preenchido)
- Then o botão "Cadastrar paciente" fica desabilitado; com Nome + Data de nascimento ele habilita, sem exigir CPF, telefone ou e-mail
- Evidence: [obs EV-005, EV-009] [net EV-004]
- Feature: F-005 · Screen: S-003

| Probe | Input | Result | Evidence |
|---|---|---|---|
| Vazio | nada | botão `disabled=true`, nenhuma chamada | [obs EV-005, EV-009] |
| Só nome | "[RE] Paciente Teste" | botão `disabled=true` | [obs EV-005, EV-009] |
| Nome + nascimento | + "01011990" | botão habilita; data formatada como dd/mm/aaaa | [obs EV-005, EV-009] |
| Salvar | clique | `POST /api/patient/create` com Name, BirthDate, NoEmail, CreatedAt; toast "Paciente cadastrado com sucesso"; abre a ficha | [net EV-004] |

### R-002 Paciente e dentista são a mesma entidade "pessoa" com Type
- Given um paciente e um dentista cadastrados
- When a ficha de cada um é carregada
- Then os dois registros têm os mesmos campos-base (Name, BirthDate, DocumentId, NameSearch, SK_BirthDay, comissões) e diferem por `Type` = PATIENT ou DENTIST
- Evidence: [net EV-004]
- Feature: F-005 · Screen: S-003

### R-003 Abrir a ficha de um paciente grava um log de acesso
- Given um usuário logado
- When abre a ficha de um paciente ou troca de aba nela
- Then o app chama `POST /api/access_log` com `_AccessPath` (trilha de auditoria de acesso a dado de saúde)
- Evidence: [net EV-004] [net EV-006]
- Feature: F-005 · Screen: S-003

### R-004 Busca de pacientes só dispara com ENTER; "%" antes busca por sobrenome
- Given a tela Pacientes
- When o usuário digita um nome
- Then a busca só roda ao pressionar ENTER; o texto de ajuda diz para digitar "%" antes para buscar pelo sobrenome
- Evidence: [obs EV-005, EV-009]
- Feature: F-005 · Screen: S-002
