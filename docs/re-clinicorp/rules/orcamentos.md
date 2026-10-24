# Rules: Orçamentos

### R-010 Salvar e Aprovar só aparecem depois do primeiro procedimento
- Given o editor "Novo Orçamento" sem procedimentos
- When o usuário adiciona um procedimento
- Then aparecem os botões "Aprovar" e "Salvar" ao lado de "Cancelar"; antes só havia "Cancelar"
- Evidence: [obs EV-007, EV-009] [net EV-008]
- Feature: F-007 · Screen: S-004

### R-011 Adicionar procedimento é rascunho local até Salvar
- Given um orçamento aberto
- When o usuário escolhe procedimento, dente e clica "Adicionar"
- Then o item entra na lista com tabela, dentista, dente e valor, e nenhuma chamada de API é feita até "Salvar"
- Evidence: [net EV-008]
- Feature: F-007 · Screen: S-004

### R-012 Valor unitário vem da tabela de preços selecionada
- Given a tabela de preços padrão da clínica
- When o usuário escolhe "Restauração resina (adulto)"
- Then o valor unitário é preenchido com o `Amount` da tabela (R$ 300,00 na conta trial) e pode ser editado
- Evidence: [net EV-006] [obs EV-007, EV-009]
- Feature: F-007 · Screen: S-004

### R-013 Busca de procedimento casa com qualquer parte do nome
- Given o campo "Inserir Procedimento..."
- When o usuário digita "Restaura"
- Then a lista mostra itens que contêm o texto em qualquer posição, sem diferenciar maiúsculas (ex.: "Canal Decíduo posterior já restaurado")
- Evidence: [obs EV-007, EV-009]
- Feature: F-007 · Screen: S-004

### R-014 Dentes em numeração FDI, com dentição permanente ou decídua
- Given um procedimento sendo adicionado
- When o seletor de dentes aparece
- Then mostra os dentes 18–11, 21–28, 48–41, 31–38 (FDI) e um seletor "Dentição" com Permanente e Decídua; o campo "Dentes/Região" aceita texto
- Evidence: [obs EV-007, EV-009]
- Feature: F-007 · Screen: S-004

### R-015 Parcelamento divide em centavos com sobra nas últimas parcelas
- Given um orçamento de R$ 300,00, forma Boleto, "Parcelado/À prazo", sem entrada
- When o usuário define 7 parcelas
- Then as parcelas são 42,86 ×5 e 42,85 ×2 (soma exata 300,00); a 1ª vence um mês após a data do orçamento e as demais mensalmente no mesmo dia
- Evidence: [obs EV-009]
- Feature: F-007, F-010 · Screen: S-004

| Probe | Input | Result | Evidence |
|---|---|---|---|
| 7x sem entrada | 300,00 / 7 | 42,86 ×5 + 42,85 ×2; 22/11/2026 … 22/05/2027 | [obs EV-009] |

### R-016 Cada parcela tem sua própria forma de pagamento
- Given um parcelamento
- When a tabela de parcelas é exibida
- Then cada linha (Parcela, Data, Forma, Valor) tem um seletor de forma (Boleto, Cartão de Crédito, Cartão de Débito, Cheque, Dinheiro, Pix, Transferência)
- Evidence: [obs EV-009] [net EV-008]
- Feature: F-007 · Screen: S-004

### R-017 Orçamento salvo nasce com status OPEN ("Em Aberto")
- Given um orçamento com um procedimento
- When o usuário clica "Salvar"
- Then `POST /solution/api/appointment/save_treatment` devolve `Status: OPEN`, `EstimateVersion` e `CurrentEstimatePaymentPlanId`; a lista mostra "Em Aberto" com data, tratamento (procedimento + dente) e valor
- Evidence: [net EV-008]
- Feature: F-007 · Screen: S-004

### R-018 Aprovar pede confirmação e transforma o orçamento em tratamento cobrável
- Given um orçamento "Em Aberto" com forma de pagamento definida
- When o usuário clica "Aprovar" e confirma "Confirma a aprovação do Orçamento?"
- Then `POST /solution/api/treatment/approve_estimate` (com `IdempotencyKey` uuid) devolve o tratamento com `PaymentPlan` do tipo CHARGE e `ChargeOperations` (um por procedimento, com dente, valor e status); a lista mostra "Aprovado" e um toast "Orçamento Aprovado"
- Evidence: [obs EV-012] [net EV-013]
- Feature: F-007 · Screen: S-004

### R-019 Aprovação gera lançamento financeiro, plano de tratamento e item "A realizar" no odontograma
- Given um orçamento de R$ 300,00 (Dinheiro, à vista) recém-aprovado
- When o usuário abre as abas Financeiro, Plano e Ficha Clínica e Odontograma
- Then Financeiro mostra "Lançamento de Tratamento" R$ 300,00 a pagar (saldo -R$ 300,00); Plano mostra um plano aprovado "Em aberto" com valor total; Odontograma lista o procedimento no dente 16 como "A realizar"
- Evidence: [net EV-013]
- Feature: F-007, F-009, F-006 · Screen: S-004

### R-026 A forma de pagamento escolhida fica gravada no orçamento
- Given um orçamento salvo com "Boleto, Parcelado, 7 parcelas"
- When o usuário reabre o orçamento
- Then o resumo mostra "Boleto, Parcelado, 7 Parcela(s)" e o botão vira "Editar Forma de Pagamento"; ao trocar para Dinheiro à vista, o vencimento mantém a data da antiga 1ª parcela (22/11/2026)
- Evidence: [net EV-013]
- Feature: F-007 · Screen: S-004

### R-036 Cancelar orçamento aprovado é irreversível e deixa rastro contábil
- Given um orçamento aprovado
- When o usuário escolhe "Cancelar Orçamento" no menu ⋮
- Then o sistema consulta `check_disapprove_estimate` e abre um aviso: o orçamento fica "Cancelado" e permanece no sistema, as parcelas e os tratamentos vinculados são cancelados, a venda continua registrada e é gerado um lançamento de cancelamento no conta corrente; é preciso marcar "Estou ciente de que esta ação é irreversível"
- Evidence: [obs EV-020, EV-021]
- Feature: F-007, F-009 · Screen: S-004

### R-037 Desaprovar orçamento exige reautenticação com senha
- Given um orçamento aprovado
- When o usuário escolhe "Desaprovar Orçamento"
- Then abre "Autorizar" pedindo usuário e senha de acesso; só depois o orçamento volta a ser editável, sem lançamento de cancelamento
- Evidence: [obs EV-020, EV-021]
- Feature: F-007 · Screen: S-004

### R-038 Orçamento aprovado fica somente leitura
- Given um orçamento aprovado aberto pela lista
- When o editor carrega
- Then os campos ficam cinza e não editáveis; as ações passam para o menu ⋮ (Imprimir, Email, descontos, Reprovar, Follow Up, Duplicar, Desaprovar, Cancelar)
- Evidence: [obs EV-021]
- Feature: F-007 · Screen: S-004

### R-056 Desaprovar usa um token de autorização de uso único e desfaz os efeitos da aprovação
- Given um orçamento aprovado que gerou lançamento financeiro e plano de tratamento
- When o usuário escolhe Desaprovar e informa usuário e senha
- Then `authorize-execution` devolve {Authorized, Token}; `reverse_approve_estimate` recebe TreatmentId, PaymentPlanId e o Token; o orçamento volta a "Em Aberto", o lançamento vai para "Lançamentos Excluídos" e o plano de tratamento fica vazio
- Evidence: [net EV-029]
- Feature: F-007, F-009 · Screen: S-004

### R-057 Excluir paciente pede confirmação com o nome e é exclusão lógica
- Given a ficha de um paciente
- When o usuário escolhe Ações do paciente > Excluir paciente e confirma
- Then aparece "Paciente excluído com sucesso.", o paciente some da busca, e o registro pode ser restaurado em Configurações > Administração de Dados
- Evidence: [obs EV-029, EV-024]
- Feature: F-005, F-030 · Screen: S-003
