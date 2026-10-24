# Rules: Agenda

### R-020 Agenda tem visões Dia, Semana e Mês e filtro por profissional
- Given a tela Agenda
- When o usuário abre "Visualizar por"
- Then as opções são Dia, Semana e Mês; a lateral tem minicalendário mensal, filtro "Profissionais" (com "Todos") e a lista "Alertas de Retorno"
- Evidence: [obs EV-002, EV-009]
- Feature: F-001 · Screen: S-001

### R-021 Grade da agenda em intervalos definidos pela clínica
- Given a clínica com `SlotTime` e `WorkingDaysHours` por dia da semana
- When a agenda do dia carrega
- Then `get_day_slots` devolve horários com isFree/isAvailable/isDouble/isSelectable; a grade observada vai de 8:00 em passos de 15 min
- Evidence: [obs EV-002, EV-009] [net EV-003]
- Feature: F-001 · Screen: S-001

### R-022 "Novo" cria três tipos de item
- Given a Agenda
- When o usuário clica "Novo"
- Then o menu oferece "Novo agendamento", "Novo compromisso" e "Alerta de retorno"; o diálogo "Nova consulta" alterna entre Consulta e Compromisso e começa pela busca do paciente
- Evidence: [obs EV-002, EV-009]
- Feature: F-001, F-004 · Screen: S-001

### R-023 Cada agendamento guarda canais de confirmação e lembrete
- Given um agendamento
- When ele é lido pela API
- Then traz `AlertInfo` com flags Confirm*/Alert* para Schedule, CliniMe, Whats, Sms, Email e Agents, além de StatusId, CheckinTime, WaitStart/WaitEnds (sala de espera)
- Evidence: [net EV-003]
- Feature: F-001, F-002 · Screen: S-001

### R-024 Status de atendimento configuráveis com cor
- Given a lista de status da clínica
- When a agenda carrega
- Then `list_status` traz status com Type (ex.: CONFIRMED, ARRIVED, IN_SESSION), descrição e cor
- Evidence: [net EV-003]
- Feature: F-001 · Screen: S-001

### R-025 Preferências de exibição da agenda
- Given a Agenda
- When o usuário abre a engrenagem
- Then há opções: mostrar desmarcações, lista de espera, horário de almoço, sábado, domingo, cor de fundo do profissional, reduzir brilho de eventos passados, visualização detalhada na semana, Modo Conforto, "Outras opções"
- Evidence: [obs EV-002, EV-009]
- Feature: F-001 · Screen: S-001

### R-027 Confirmação e alerta da consulta vêm desligados ("Não enviar")
- Given o diálogo "Nova consulta" aberto a partir da ficha do paciente
- When o usuário não mexe nos campos Confirmação e Alerta de consulta
- Then os dois ficam em "-- Não enviar --", e o agendamento é criado com `AlertInfo` por canal (Whats, Sms, Email, CliniMe, Agents)
- Evidence: [net EV-014]
- Feature: F-001, F-002 · Screen: S-001

### R-028 Não há alerta automático para consulta no mesmo dia
- Given uma consulta marcada para hoje
- When o usuário olha a seção de alertas
- Then o sistema avisa que não é possível enviar alertas para agendamentos no mesmo dia, porque o envio automático roda às 7h da manhã
- Evidence: [net EV-014]
- Feature: F-002 · Screen: S-001

### R-029 Criar consulta grava paciente, profissional, horário, categoria e canais de aviso
- Given o diálogo "Nova consulta" com paciente, data e profissional preenchidos
- When o usuário escolhe um horário (botões de 15 em 15 minutos, 8:00–19:45) e clica "Confirmar consulta"
- Then `POST /api/appointment/create` grava data, fromTime/toTime, categoria (id, cor, descrição), observações e AlertInfo; aparece o toast "Consulta criada com sucesso!"
- Evidence: [net EV-014]
- Feature: F-001 · Screen: S-001

### R-030 Status da consulta segue um ciclo de atendimento com sete estados
- Given uma consulta "Agendado"
- When o usuário abre o seletor de status no cartão
- Then as opções são Agendado, Confirmado, Em espera, Em atendimento, Atendido, Atrasado e Faltou; a troca chama `POST /api/appointment/change_status` com id e StatusId
- Evidence: [obs EV-015] [net EV-016]
- Feature: F-001 · Screen: S-001

### R-031 "Em espera" registra a chegada (check-in) e o início da espera
- Given uma consulta "Agendado"
- When o status muda para "Em espera"
- Then o agendamento ganha CheckinTime e WaitStart (epoch ms) e Waiting, usados para medir tempo de espera
- Evidence: [net EV-016]
- Feature: F-001 · Screen: S-001

### R-032 Selo "Financeiro OK" olha só parcelas vencidas
- Given um paciente com R$ 300,00 a pagar e nada vencido
- When o cartão da consulta abre
- Then mostra a faixa verde "Financeiro OK" (o app consulta `list_overdue_payments`)
- Evidence: [obs EV-015] [net EV-016]
- Feature: F-001, F-009 · Screen: S-001

### R-033 Duração padrão da consulta é um intervalo da grade
- Given uma consulta criada escolhendo só o horário de início 17:00, sem procedimentos
- When ela aparece na agenda
- Then ocupa 17:00–17:15 (um intervalo de 15 min)
- Evidence: [obs EV-015]
- Feature: F-001 · Screen: S-001

### R-034 Consulta com check-in não pode ser desmarcada nem excluída
- Given uma consulta com status "Em espera" (check-in feito)
- When o usuário abre o cartão
- Then os ícones de desmarcar e excluir ficam cinza e inativos; voltando o status para "Agendado", a lixeira volta a funcionar
- Evidence: [obs EV-019]
- Feature: F-001 · Screen: S-001

### R-035 Excluir consulta pede confirmação irreversível
- Given uma consulta "Agendado"
- When o usuário clica na lixeira
- Then abre "Excluir consulta" com o nome do paciente e o aviso "Esta ação não pode ser desfeita"; ao confirmar, a consulta some da grade e o contador "Pacientes" diminui
- Evidence: [obs EV-019]
- Feature: F-001 · Screen: S-001

### R-083 Horários disponíveis vêm do expediente do dia da semana
- Given o diálogo Nova consulta
- When o usuário escolhe uma data
- Then o app busca `get_morning_slots` e `get_afternoon_slots` para aquele dia da semana; num dia sem expediente (domingo nesta clínica) os 48 botões de horário ficam desativados, sem mensagem
- Evidence: [net EV-041] [obs EV-041]
- Feature: F-001 · Screen: S-001

### R-084 A busca de paciente na consulta oferece criar paciente novo, com aviso de nome repetido
- Given o campo de paciente da Nova consulta
- When o usuário digita um nome
- Then a primeira sugestão é "Novo paciente: <texto>" e depois vêm os pacientes existentes; se confirmar com a primeira e o nome já existir, o servidor devolve `AlertExistingName` e o app pergunta "Criar mesmo assim" (`IgnoreSameName`)
- Evidence: [net EV-041]
- Feature: F-001, F-005 · Screen: S-001

### R-085 Arrastar consulta pede confirmação com horário antigo e novo
- Given uma consulta na visão Dia
- When o usuário arrasta o cartão para outro horário
- Then aparece "Deseja mover o agendamento X de HH:MM - HH:MM para HH:MM - HH:MM?"; ao confirmar, `change_datetime_dentist` grava data, horário, dentista e cadeira
- Evidence: [net EV-041]
- Feature: F-001 · Screen: S-001

### R-086 Excluir consulta é feito por GET
- Given o cartão da consulta aberto
- When o usuário clica no ícone vermelho e confirma "Esta ação não pode ser desfeita"
- Then a consulta some da agenda via `GET /api/appointment/delete`
- Evidence: [net EV-041]
- Feature: F-001 · Screen: S-001