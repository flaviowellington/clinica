# Rules: Configurações, Financeiro e Administração (perfil Administrador, s02, somente leitura)

Regras lidas das telas de configuração e do financeiro. Nenhuma foi exercitada (L4): elas descrevem o comportamento que a própria tela declara.

### R-039 Bloqueios por pendência têm quatro níveis por situação
- Given as situações Inadimplência, Financeiro em aberto e Pendências de contrato
- When o administrador configura Bloqueios para Agenda, Check-in ou Tratamento
- Then cada situação aceita um de quatro níveis: Não bloquear; Avisar situação e solicitar confirmação; Solicitar aprovação de administrador; Bloquear operação
- Evidence: [obs EV-024]
- Feature: F-025 · Screen: S-014

### R-040 Autenticação em dois fatores pode ser obrigatória para todos
- Given a tela Segurança
- When o administrador ativa "Obrigatório para todos os usuários"
- Then todos os usuários passam a precisar de 2FA (flag `Required2FA` também aparece na configuração do assinante)
- Evidence: [obs EV-024] [net EV-001]
- Feature: F-025 · Screen: S-014

### R-041 Imprimir e exportar podem exigir usuário e senha de administrador
- Given a tela Segurança
- When "Solicitar usuário e senha ao imprimir" ou "… ao exportar" está ativo
- Then a impressão ou exportação de dados pede credenciais de administrador antes de continuar
- Evidence: [obs EV-024]
- Feature: F-025 · Screen: S-014

### R-042 Recibos têm numeração sequencial ajustável só para frente
- Given a tela Recibos
- When o administrador define "Iniciar próximo recibo em"
- Then cada recibo emitido recebe o próximo número da sequência; a mudança vale só para os próximos, os já emitidos não mudam
- Evidence: [obs EV-024]
- Feature: F-009 · Screen: S-014

### R-043 DRE é montado por grupos de contas configurados
- Given a configuração do DRE
- When o administrador associa contas aos grupos (1 Receita Operacional Bruta, 2 Deduções, 4 Custos, 6 Despesas Operacionais, 8 Receitas e 9 Despesas não Operacionais) e informa alíquotas de IR e CSLL
- Then o relatório DRE soma as contas de cada grupo; grupo sem conta aparece zerado
- Evidence: [obs EV-024]
- Feature: F-014 · Screen: S-014

### R-044 Agenda pode ser organizada por profissional ou por cadeira
- Given Configurações > Agenda > Geral
- When o administrador escolhe "Tipo de agendamento"
- Then a agenda passa a ter colunas por Profissional ou por Cadeira; também há tempo de visualização (5/15/20/30 min), limite de agendamentos simultâneos por profissional, permissão para agendar fora da disponibilidade, cor por categoria e fuso horário por estado
- Evidence: [obs EV-024]
- Feature: F-001 · Screen: S-014

### R-045 Envio de confirmações e alertas tem custo por mensagem e canais padrão
- Given Configurações > Confirmações e alertas
- When o administrador escolhe plataformas (SMS, Email, WhatsApp) e canais padrão (SMS, Email, WhatsApp, Clini.Me)
- Then novos agendamentos já vêm com esses canais marcados; a tela informa custo de R$ 0,12 por WhatsApp e R$ 0,15 por SMS; há modelos de mensagem por tipo (SMS até 255 caracteres)
- Evidence: [obs EV-024, EV-025]
- Feature: F-002 · Screen: S-014, S-015

### R-046 Campos obrigatórios do cadastro de paciente são configuráveis
- Given Configurações > Prontuário > Geral
- When o administrador marca CPF ou Celular em "Campos obrigatórios no cadastro"
- Then esses campos passam a ser exigidos além de nome e nascimento (R-001 é o comportamento sem essa opção)
- Evidence: [obs EV-024]
- Feature: F-005 · Screen: S-014

### R-047 Prontuário tem número automático, sessões, retorno e trava de edição
- Given Configurações > Prontuário > Geral
- When as opções estão ativas
- Then cada prontuário recebe número sequencial; procedimentos podem ter sessões (e travar a duração do agendamento ao tempo da sessão), retorno e tempo de execução; a edição do prontuário pode ser travada
- Evidence: [obs EV-024] [net EV-001]
- Feature: F-006 · Screen: S-014

### R-048 Assinatura eletrônica tem três métodos com níveis de segurança jurídica
- Given Configurações > Assinatura Eletrônica
- When a clínica escolhe o método
- Then Link via WhatsApp ou SMS = nível Alto (coleta WhatsApp vinculado ao CPF, sessão, carimbo de tempo, log de auditoria, geolocalização, consentimento, evidência); QR-Code = Moderado; assinatura no celular ou na tela da clínica = Baixo; a tela cita a MP 2.200-2/2001
- Evidence: [obs EV-024]
- Feature: F-008 · Screen: S-014

### R-049 Caixa salva sozinho e pode exigir senha por operação
- Given Configurações de Caixa
- When o administrador muda uma opção
- Then a alteração é salva automaticamente (sem botão Salvar); opções: desabilitar o Caixa, pedir aprovação por senha nas operações, formas aceitas (Dinheiro, Cheque, Débito, Crédito, Pix, Boleto, Transferência)
- Evidence: [obs EV-024]
- Feature: F-031 · Screen: S-014

### R-050 Registros excluídos podem ser listados e restaurados
- Given Configurações > Administração de Dados
- When o administrador escolhe um tipo (ex.: Profissional) e clica Listar
- Then aparecem os registros excluídos daquele tipo para restauração (exclusão lógica)
- Evidence: [obs EV-024]
- Feature: F-030 · Screen: S-014

### R-051 Multa e juros automáticos sobre atraso
- Given Taxas - Formas de Pagamento
- When o administrador configura multa (porcentagem ou valor fixo), juros (%) e ciclo de cobrança (Mensal)
- Then a multa e os juros são aplicados automaticamente ao paciente em atraso; cada forma de pagamento tem taxa e desconto, com faixas de parcelamento (2–6, 7–12)
- Evidence: [obs EV-024]
- Feature: F-010 · Screen: S-014

### R-052 Financeiro é contabilidade de partidas dobradas por conta
- Given o Fluxo de Caixa
- When um período é listado
- Then cada dia traz entradas e saídas realizadas e previstas (IN, IN_FORECAST, OUT, OUT_FORECAST), saldo e saldo acumulado; cada lançamento tem conta, tipo CREDIT/DEBIT, lançamento de origem (TriggerBookEntryId), conciliação e forma de pagamento
- Evidence: [net EV-022]
- Feature: F-009 · Screen: S-009

### R-053 Tabelas de preço são Particular ou Plano/Convênio
- Given Procedimentos > Tabelas de preço
- When o administrador filtra
- Then as tabelas aparecem como Particular ou Plano/Convênio; o Financeiro tem "Controle de Planos" com guia, procedimentos e confirmação por tabela
- Evidence: [obs EV-022, EV-024]
- Feature: F-013 · Screen: S-009, S-014

### R-054 Conta a pagar exige Conta do plano de contas e gera débito e crédito
- Given o formulário "Nova Conta a Pagar" com valor e descrição
- When o usuário salva sem escolher "Conta"
- Then aparece "Campo(s) de preenchimento obrigatório: Conta"; com a conta escolhida, `create_account_to_pay` cria um lançamento de DEBIT e um de CREDIT (conta do tipo EXPENSE) e o sistema pergunta se quer confirmar o pagamento agora
- Evidence: [net EV-028] [obs EV-027]
- Feature: F-009 · Screen: S-009

| Probe | Input | Result | Evidence |
|---|---|---|---|
| sem Conta | Salvar | erro de campo obrigatório | [obs EV-028] |
| completo | Salvar | "Conta a pagar criada com sucesso!" + "Deseja confirmar o pagamento da conta agora?" | [net EV-028] |
| excluir | lixeira > Ok | "Tem certeza que deseja realmente excluir essa Conta?"; some da lista | [obs EV-028] |

### R-055 Campo de valor monta centavos da direita para a esquerda
- Given o campo Valor vazio
- When o usuário digita "1" e depois "00"
- Then o campo mostra 0,01 e depois 1,00; digitar sobre um valor existente concatena (ex.: vira 1.000,00)
- Evidence: [obs EV-028]
- Feature: F-009 · Screen: S-009

### R-087 Controle de Planos acompanha guias por status de faturamento
- Given Financeiro > Controle de Planos
- When o usuário filtra por período, tabela de preço e tipo
- Then lista guias (Data, Status, Paciente, Guia, Procedimentos, Confirmação, Ações) com os tipos Em Aberto, Recurso, Glosa, Pagamento Parcial e Pago; não há exportação XML/lote nesta tela
- Evidence: [net EV-041] [obs EV-041]
- Feature: F-013 · Screen: S-009

### R-088 Dashboard analítico reúne 15 painéis de gestão
- Given o Dashboard Analítico
- When o usuário escolhe período e clica Listar
- Then carrega 15 painéis (caixa, notas e recibos, inadimplência, faltas, desmarcações, ocupação da agenda, categorias, vendas e conversão, vendas por especialidade, metas de faltas e vendas, orçamentos), cada um com sua chamada `analytics-dashboard/v2/*`
- Evidence: [net EV-041]
- Feature: F-014 · Screen: S-010

### R-089 Origem do paciente ("Como conheceu?") tem 14 opções e não cria cartão de indicação
- Given o cadastro do paciente
- When o usuário escolhe "Controle de Indicação" (com "Indicado por" opcional) e salva
- Then só o campo `HowDidMeet` é gravado; o quadro de indicação não ganha cartão (os cartões parecem vir do link de indicação) [inf] Q-015
- Evidence: [net EV-041]
- Feature: F-026, F-005 · Screen: S-003