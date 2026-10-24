# Rules: Prontuário, documentos e agenda (s02c, testados com paciente fictício)

### R-058 Anamnese é preenchida pelo profissional ou pelo paciente e só grava ao salvar
- Given a aba Anamnese de um paciente
- When o usuário clica "Nova Anamnese"
- Then escolhe o tipo (Nova ou Última preenchida) e quem preenche (Paciente ou Profissional); o formulário traz o modelo da clínica com perguntas livres ou de escolha única, cada uma com switch "Alerta"; nada é gravado até "Salvar" (`new_anamnesis`), e há também "Solicitar assinatura"
- Evidence: [net EV-033]
- Feature: F-006 · Screen: S-003

### R-059 Resposta marcada como Alerta vira alerta do paciente
- Given uma anamnese salva com a pergunta de alergia respondida "Sim" e Alerta ligado
- When a ficha do paciente carrega
- Then `get_patient_alerts` devolve essa pergunta com Alert, AnswerOption e AnswerDescription, e o card Anamnese mostra "1 | Atual | Criada em …"
- Evidence: [net EV-033]
- Feature: F-006 · Screen: S-003

### R-060 Alerta de retorno vem com o primeiro profissional da lista, não com o usuário logado
- Given o diálogo "Novo alerta" de retorno
- When ele abre
- Then o Profissional já vem preenchido com o primeiro profissional em ordem alfabética; prazos: 1 mês (padrão), 2, 3, 6 meses, 1 ano ou data específica; ao confirmar, `appointment_ret/create` grava a data calculada (hoje + prazo)
- Evidence: [net EV-033]
- Feature: F-004 · Screen: S-003

### R-061 Procedimento executado direto no odontograma vai para a ficha clínica sem cobrança
- Given o diálogo "Adicionar procedimento" do odontograma
- When o usuário escolhe procedimento, status "Executado" e salva
- Then `create_executed_procedure` grava o procedimento; a Ficha Clínica mostra a linha Executado; o Financeiro do paciente não recebe lançamento; o dente é opcional e, quando escolhido, libera as faces V P M D O C; há opção de gerar alerta de retorno automático pelo prazo
- Evidence: [net EV-033] [obs EV-030]
- Feature: F-006 · Screen: S-003

### R-062 Documento é gerado de modelo com variáveis e só salva depois de uma edição
- Given a aba Documentos e o modelo "Atestado - Novo"
- When o usuário informa as variáveis (dentista, horário, dias/horas) e abre o editor
- Then o texto vem preenchido com dados do profissional e do paciente; o botão salvar fica desabilitado até haver alguma edição; ao salvar, `upload_document` envia o HTML para um bucket e o documento aparece na lista
- Evidence: [net EV-033] [obs EV-031]
- Feature: F-008, F-029 · Screen: S-003

### R-063 Compromisso pode bloquear um profissional ou a clínica inteira
- Given "Novo compromisso" na agenda
- When o usuário escolhe tipo Profissional (padrão) ou Clínica, horário e confirma
- Then `create_calendar_event` grava o evento (AllDay opcional, duração padrão de um intervalo); a exclusão pede confirmação irreversível e usa `delete_calendar_event`
- Evidence: [net EV-033]
- Feature: F-001 · Screen: S-001

### R-064 A visão da agenda (Dia/Semana/Mês) fica salva só no navegador
- Given a agenda em Dia
- When o usuário troca para Semana ou Mês
- Then `localStorage.clinicorp_calendar_view_preference` muda para week/month e nenhuma chamada ao servidor é feita; ao voltar, fica day
- Evidence: [obs EV-033]
- Feature: F-001 · Screen: S-001

### R-065 Desconto percentual calcula na hora e ignora valores acima de 100%
- Given um orçamento de R$ 300,00
- When o usuário aplica "Desc em %" de 10
- Then o valor final vira R$ 270,00 sem chamada ao servidor; digitar 150 faz o campo voltar para 0,00 sem mensagem
- Evidence: [obs EV-033]
- Feature: F-007 · Screen: S-004

| Probe | Input | Result | Evidence |
|---|---|---|---|
| 10% | 10,00 | R$ 270,00 | [obs EV-033] |
| 150% | 150,00 | 0,00 e R$ 300,00 | [obs EV-033] |

### R-066 Procedimento no orçamento não exige dente
- Given o editor de orçamento
- When o usuário adiciona um procedimento sem preencher Dentes/Região
- Then o item entra no orçamento com tabela, profissional e valor
- Evidence: [obs EV-032, EV-033]
- Feature: F-007 · Screen: S-004

### R-067 Edição do cadastro envia o paciente inteiro e cobre filiação e responsável legal
- Given a ficha de um paciente
- When o usuário clica Editar em Informações do paciente e salva
- Then o diálogo tem três abas (Dados cadastrais, Contato, Dados complementares com filiação e responsável legal) e `patient/update` recebe o objeto completo; a Visão Geral mostra os dados novos e a idade calculada
- Evidence: [net EV-038]
- Feature: F-005 · Screen: S-003

### R-068 Ficha de especialidade tem status por dente
- Given a aba Fichas Especialidades
- When o usuário cria uma ficha (Alinhadores, Endodontia, Implantes, Ortodontia, Ortopédica, Periodontia, Toxina Botulínica Estética ou Terapêutica)
- Then `create_clinical_sheet` cria a ficha e o app também grava o odontograma; na Endodontia cada dente tem status Em Avaliação, Em Tratamento, Executado, Suspenso ou Finalizado, e o procedimento da ficha exige dente
- Evidence: [net EV-038] [obs EV-034, EV-035]
- Feature: F-006 · Screen: S-003

### R-069 Faces do dente ficam junto ao número na lista do odontograma
- Given um procedimento salvo no dente 16 com faces M e O
- When a lista do odontograma carrega
- Then mostra "16MO"; o menu do item oferece Editar (`update_executed_procedure`), Mais informações e Excluir (`delete_executed_procedure`, com confirmação)
- Evidence: [net EV-038]
- Feature: F-006 · Screen: S-003

### R-070 Excluir lançamento financeiro exige reautenticação
- Given um lançamento manual de R$ 1,00 no financeiro do paciente
- When o usuário escolhe Excluir Lançamento e confirma
- Then abre "Autorizar" pedindo usuário e senha; com autorização, `delete_single_post` remove o lançamento e o saldo volta a zero; Recibo e Cancelar Pagamento ficam desativados enquanto não há pagamento
- Evidence: [net EV-038] [obs EV-036]
- Feature: F-009 · Screen: S-003

### R-071 Inativar paciente exige motivo e bloqueia novas consultas
- Given um paciente ativo
- When o usuário escolhe Inativar paciente
- Then precisa escolher motivo (Falecimento, Solicitação do Paciente, Desistência do Tratamento, Outros com descrição); o paciente fica "Inativo", continua acessível, não pode receber novas consultas, e o menu passa a oferecer "Ativar paciente"
- Evidence: [obs EV-038]
- Feature: F-005 · Screen: S-003

### R-072 Medicamentos e especialidades são cadastros da tabela genérica de características
- Given Configurações > Medicamentos ou Especialidades
- When o usuário adiciona e depois exclui um item
- Then a criação usa `characteristic/create_drug` ou `characteristic/create`; a exclusão pede confirmação e é feita por GET (`delete_drug`, `delete?alwaysDelete`)
- Evidence: [net EV-038]
- Feature: F-029, F-024 · Screen: S-014

### R-073 CPF/CNPJ de fornecedor é validado ao salvar
- Given o formulário de fornecedor
- When o usuário salva com 000.000.000-00
- Then aparece "CPF ou CNPJ inválido" e nada é gravado
- Evidence: [obs EV-038]
- Feature: F-032 · Screen: S-009

### R-074 Pergunta obrigatória na anamnese bloqueia o salvamento
- Given uma anamnese com pergunta marcada como Obrigatória (tipos Descritiva, Sim/Não, Opções)
- When o usuário salva sem responder
- Then o campo mostra "Preenchimento obrigatório", aparece o aviso "Preencha todas as respostas obrigatórias antes de continuar." e nada é gravado
- Evidence: [obs EV-040]
- Feature: F-006 · Screen: S-003

### R-075 Editar anamnese altera a mesma; nova anamnese manda a anterior para o Histórico
- Given um paciente com anamnese "Atual"
- When o usuário abre e salva a anamnese, ou cria uma nova
- Then salvar a aberta usa `update_anamnesis_new` (sem nova versão); criar uma nova a torna "Atual" e a anterior vai para "Histórico"; "Última preenchida" copia só as perguntas, não as respostas nem as observações
- Evidence: [net EV-040]
- Feature: F-006 · Screen: S-003

### R-076 Fotos sobem direto para o storage por URL assinada
- Given a aba Fotos do paciente
- When o usuário cria uma pasta e adiciona uma foto (jpeg, png, webp, bmp ou gif)
- Then `create_folder` cria a pasta; `create_picture` devolve `uploadSignedUrl` e `uploadThumbSignedUrl`; o navegador envia o arquivo direto ao storage e confirma com `ensure_picture_exists`
- Evidence: [net EV-040]
- Feature: F-006 · Screen: S-003

### R-077 Girar foto grava na hora; excluir foto é permanente e feito por GET
- Given uma foto aberta no visualizador
- When o usuário gira ou espelha a foto, ou a exclui
- Then girar ou espelhar grava na hora com `update_pic_info` (`OrientationImg`), sem botão salvar; excluir pede confirmação ("será removida permanentemente") e usa `GET delete_picture`
- Evidence: [net EV-040] [obs EV-039]
- Feature: F-006 · Screen: S-003

### R-078 Procedimento tem duas observações: interna e para o documento do paciente
- Given o diálogo de procedimento da Ficha Geral
- When o usuário preenche as observações
- Then há uma observação interna (não aparece no documento de assinatura) e outra que aparece no documento de assinatura do paciente, com 1500 caracteres cada
- Evidence: [obs EV-040]
- Feature: F-006 · Screen: S-003

### R-079 Reprovar orçamento exige motivo; Duplicar abre um editor preenchido
- Given um orçamento Em Aberto
- When o usuário escolhe ⋮ > Reprovar, ou ⋮ > Duplicar
- Then Reprovar pede um motivo em texto livre e grava com `reject_estimate`, e o orçamento passa a "Reprovado"; Duplicar abre um segundo editor com os mesmos itens, que só grava se o usuário salvar; Follow Up não fez nada neste plano
- Evidence: [net EV-040]
- Feature: F-007 · Screen: S-004

### R-080 Código Clini.me exige CPF; links de agendamento e indicação exigem Agendamento Online ativo
- Given um paciente sem CPF numa clínica sem Agendamento Online
- When o usuário escolhe em Ações do paciente: Gerar código Clini.me, Link para agendamento online ou Gerar link de indicação
- Then Clini.me avisa que precisa de CPF; os dois links avisam que a clínica não tem Agendamento Online ativo (Configuração > Clínicas); nada é gerado
- Evidence: [obs EV-040]
- Feature: F-005, F-003 · Screen: S-003

### R-081 Imprimir dados do paciente escolhe seções com pré-visualização
- Given a ficha do paciente
- When o usuário escolhe Imprimir dados do paciente
- Then abre um diálogo com seções marcáveis (Dados Básicos, Contato, Endereço, Dados Adicionais, Observações, todas marcadas) e pré-visualização ao lado
- Evidence: [obs EV-040]
- Feature: F-005 · Screen: S-003

### R-082 Serviço protético é um card de quadro kanban com ordem de serviço e regras automáticas
- Given o Controle Protético (colunas Pré-envio, Envio/Em laboratório, Retorno à clínica, Agendamento do paciente, Instalado)
- When o usuário adiciona um serviço na primeira coluna, preenche a ordem de serviço, arrasta o card e o exclui
- Then o card é criado com `smartboard/item` ligado ao paciente; a ordem de serviço (profissional, clínica, laboratório, trabalho, prazo, valor e datas) vai em `SmartProps`; cada ação chama `trigger-card`, que avalia regras do quadro; mover grava `LaneId`, `LastLaneId`, `Moved` e `MovedBy`; excluir pede confirmação e usa `DELETE item/:id`
- Evidence: [net EV-040]
- Feature: F-017 · Screen: S-006