# Parity tests

One test per rule the clone must reproduce. A test passes when the clone shows the same behavior as the rule.

| Test | Rule | Feature | Summary | Clone status |
|---|---|---|---|---|
| PT-01 | R-001 | F-005 | "Cadastrar paciente" só habilita com nome e data de nascimento | todo |
| PT-02 | R-002 | F-005 | paciente e profissional compartilham o cadastro de pessoa com papel | todo |
| PT-03 | R-003 | F-005 | abrir a ficha grava log de acesso | todo |
| PT-04 | R-004 | F-005 | busca por nome; prefixo especial busca por sobrenome | todo |
| PT-10 | R-010 | F-007 | Salvar/Aprovar só aparecem com ao menos um procedimento | todo |
| PT-11 | R-011 | F-007 | adicionar procedimento não grava até Salvar | todo |
| PT-12 | R-012 | F-007 | valor unitário vem da tabela de preços | todo |
| PT-13 | R-013 | F-007 | busca de procedimento por trecho, sem diferenciar maiúsculas | todo |
| PT-14 | R-014 | F-007 | seletor de dentes FDI com dentição permanente/decídua | todo |
| PT-15 | R-015 | F-007 | 300,00 em 7x = 42,86 ×5 + 42,85 ×2; vencimentos mensais a partir de +1 mês | todo |
| PT-16 | R-016 | F-007 | cada parcela com forma própria | todo |
| PT-17 | R-017 | F-007 | orçamento salvo nasce "Em Aberto" | todo |
| PT-18 | R-018 | F-007 | aprovar pede confirmação e é idempotente | todo |
| PT-19 | R-019 | F-007 | aprovação cria lançamento, plano de tratamento e itens "A realizar" | todo |
| PT-20 | R-020 | F-001 | agenda Dia/Semana/Mês com filtro por profissional | todo |
| PT-21 | R-021 | F-001 | grade no intervalo da clínica (15 min) dentro do horário de funcionamento | todo |
| PT-22 | R-022 | F-001 | "Novo" oferece consulta, compromisso e alerta de retorno | todo |
| PT-23 | R-023 | F-002 | consulta guarda canais de confirmação e lembrete | todo |
| PT-24 | R-024 | F-001 | status configuráveis com cor | todo |
| PT-25 | R-025 | F-001 | preferências de exibição da agenda | todo |
| PT-26 | R-026 | F-007 | forma de pagamento persiste e pode ser editada | todo |
| PT-27 | R-027 | F-002 | confirmação e alerta vêm em "Não enviar" | todo |
| PT-28 | R-028 | F-002 | sem alerta automático para consulta no mesmo dia (envio às 7h) | todo |
| PT-29 | R-029 | F-001 | criar consulta grava horário, categoria e canais | todo |
| PT-30 | R-030 | F-001 | sete status de atendimento | todo |
| PT-31 | R-031 | F-001 | "Em espera" grava check-in e início da espera | todo |
| PT-32 | R-032 | F-009 | selo financeiro considera só parcelas vencidas | todo |
| PT-33 | R-033 | F-001 | duração padrão = um intervalo | todo |
| PT-34 | R-034 | F-001 | consulta com check-in não pode ser excluída | todo |
| PT-35 | R-035 | F-001 | excluir consulta pede confirmação | todo |
| PT-36 | R-036 | F-007 | cancelar orçamento aprovado é irreversível e gera estorno | todo |
| PT-37 | R-037 | F-007 | desaprovar exige reautenticação | todo |
| PT-38 | R-038 | F-007 | orçamento aprovado é somente leitura | todo |
| PT-39 | R-039 | F-025 | bloqueios por pendência com 4 níveis | todo |
| PT-40 | R-040 | F-025 | 2FA obrigatório para todos | todo |
| PT-41 | R-041 | F-025 | senha de admin para imprimir/exportar | todo |
| PT-42 | R-042 | F-009 | numeração de recibos só para frente | todo |
| PT-43 | R-043 | F-014 | DRE por grupos de contas e alíquotas | todo |
| PT-44 | R-044 | F-001 | agenda por profissional ou cadeira e demais opções | todo |
| PT-45 | R-045 | F-002 | canais padrão e custo por mensagem | todo |
| PT-46 | R-046 | F-005 | campos obrigatórios configuráveis | todo |
| PT-47 | R-047 | F-006 | número de prontuário, sessões, retorno, trava | todo |
| PT-48 | R-048 | F-008 | 3 métodos de assinatura com nível jurídico | todo |
| PT-49 | R-049 | F-031 | caixa com autosave e senha por operação | todo |
| PT-50 | R-050 | F-030 | restaurar registros excluídos | todo |
| PT-51 | R-051 | F-010 | multa e juros automáticos | todo |
| PT-52 | R-052 | F-009 | partidas dobradas com previsto e realizado | todo |
| PT-53 | R-053 | F-013 | tabelas Particular e Plano/Convênio | todo |
| PT-54 | R-054 | F-009 | conta a pagar exige Conta e gera débito/crédito | todo |
| PT-55 | R-055 | F-009 | máscara de valor por centavos | todo |
| PT-56 | R-056 | F-007 | desaprovar com token de autorização desfaz efeitos | todo |
| PT-57 | R-057 | F-005 | excluir paciente é exclusão lógica | todo |
| PT-58 | R-058 | F-006 | anamnese grava só ao salvar; responsável paciente ou profissional | todo |
| PT-59 | R-059 | F-006 | resposta com Alerta vira alerta do paciente | todo |
| PT-60 | R-060 | F-004 | prazos de retorno e data calculada | todo |
| PT-61 | R-061 | F-006 | executado no odontograma vai à ficha clínica sem cobrança | todo |
| PT-62 | R-062 | F-008 | documento de modelo com variáveis; salvar após edição | todo |
| PT-63 | R-063 | F-001 | compromisso de profissional ou clínica | todo |
| PT-64 | R-064 | F-001 | visão da agenda salva no navegador | todo |
| PT-65 | R-065 | F-007 | desconto % ao vivo; >100% rejeitado | todo |
| PT-66 | R-066 | F-007 | procedimento sem dente no orçamento | todo |
| PT-67 | R-067 | F-005 | editar cadastro com filiação e responsável | todo |
| PT-68 | R-068 | F-006 | ficha de especialidade com status por dente | todo |
| PT-69 | R-069 | F-006 | faces do dente na lista (16MO); editar/excluir | todo |
| PT-70 | R-070 | F-009 | excluir lançamento pede senha | todo |
| PT-71 | R-071 | F-005 | inativar exige motivo e bloqueia agenda | todo |
| PT-72 | R-072 | F-029 | medicamentos e especialidades na tabela de características | todo |
| PT-73 | R-073 | F-032 | CPF/CNPJ validado ao salvar | todo |
| PT-74 | R-074 | F-006 | pergunta obrigatória bloqueia salvar anamnese | todo |
| PT-75 | R-075 | F-006 | editar altera a mesma; nova vai para Atual e antiga para Histórico | todo |
| PT-76 | R-076 | F-006 | upload de foto por URL assinada | todo |
| PT-77 | R-077 | F-006 | girar foto grava na hora; excluir é permanente | todo |
| PT-78 | R-078 | F-006 | duas observações no procedimento | todo |
| PT-79 | R-079 | F-007 | reprovar exige motivo; duplicar abre editor preenchido | todo |
| PT-80 | R-080 | F-005 | Clini.me exige CPF; links exigem agendamento online | todo |
| PT-81 | R-081 | F-005 | impressão com seções e pré-visualização | todo |
| PT-82 | R-082 | F-017 | card protético com ordem de serviço, mover e excluir | todo |
| PT-83 | R-083 | F-001 | horários por expediente do dia da semana | todo |
| PT-84 | R-084 | F-001 | criar paciente na consulta com aviso de nome repetido | todo |
| PT-85 | R-085 | F-001 | arrastar consulta com confirmação | todo |
| PT-86 | R-086 | F-001 | excluir consulta com confirmação | todo |
| PT-87 | R-087 | F-013 | guias por status de faturamento | todo |
| PT-88 | R-088 | F-014 | painéis do dashboard | todo |
| PT-89 | R-089 | F-005 | origem do paciente | todo |