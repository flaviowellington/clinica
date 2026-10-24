# Production barriers: Clinicorp

Clone target market: see `00-charter.md`.
Not legal advice. A legal reading without a source is `[inf]` with a question for counsel in `questions.md`.

## Summary

Launch blockers first. One row per barrier; details below.

Market weight (peso no mercado) é estimativa do agente até Q-009 ser respondida. Prazos: a confirmar (Q-008).

| Barrier | Category | Severity | Market weight | Blocks | Lead time |
|---|---|---|---|---|---|
| BR-002 | Regulação (LGPD, dado de saúde) | blocks launch | required to sell | F-005, F-006 | a confirmar |
| BR-003 | Regulação (CFO, prontuário eletrônico) | blocks launch | required to sell | F-006 | a confirmar |
| BR-007 | Regulação fiscal (NFS-e nacional) | blocks feature | required to sell | F-011 | a confirmar |
| BR-006 | Pagamentos (BACEN) | blocks feature | important | F-010 | a confirmar |
| BR-001 | Convênios (TISS/ANS) | blocks feature | important | F-013 | a confirmar |
| BR-005 | Assinatura digital (ICP-Brasil) | adds cost | important | F-008 | a confirmar |
| BR-004 | Integração permissionada (WhatsApp/Meta) | adds lead time | required to sell | F-002, F-016, F-020 | a confirmar |
| BR-008 | Birô de crédito (SPC) | adds cost | minor | F-012 | a confirmar |
| BR-009 | Integrações de radiologia | blocks feature | minor | F-019 | a confirmar |
| BR-010 | Lojas de apps | adds lead time | important | F-022 | a confirmar |
| BR-012 | Crédito ao paciente (parceiro financeiro) | blocks feature | important | F-007, F-010 | a confirmar |
| BR-013 | Receita Saúde (recibos de saúde à Receita Federal) | adds lead time | important | F-028 | a confirmar |
| BR-011 | Dados e migração | moat | important | todas | — |

### BR-002 Dados de pacientes são dados sensíveis de saúde (LGPD)
- Category: regulation and licensing
- Blocks: F-005, F-006
- Gatekeeper: ANPD; a clínica (controladora) exige contrato de operador
- Severity: blocks launch
- Market weight: required to sell [inf] Q-009
- What it takes: contrato de operador com cada clínica, encarregado (DPO), registro de operações, controle de acesso e logs, criptografia; base para transferência internacional se hospedar fora do Brasil (Q-006)
- Lead time and cost: o Clinicorp se declara operador dos dados de pacientes e hospeda em US-EAST [doc SRC-005]; usa Google como provedor e não cita certificação [doc SRC-004]
- Mitigation: hospedar no Brasil (região São Paulo), DPA padrão desde o primeiro dia, logs de auditoria de acesso a prontuário
- Observado no sistema: log de acesso à ficha (`access_log`) [net EV-004]; pixel Meta com advanced matching disparado em cliques dentro do sistema logado (B-002) [net EV-019] — o clone não deve ter rastreadores de marketing nas telas clínicas
- Evidence: [doc SRC-004] [doc SRC-005] [net EV-004, EV-019]

### BR-003 Prontuário odontológico eletrônico segue normas do CFO
- Category: regulation and licensing
- Blocks: F-006
- Gatekeeper: CFO / CROs; SBIS (certificação de S-RES, opcional para eliminar papel)
- Severity: blocks launch
- Market weight: required to sell [inf] Q-009
- What it takes: atender os requisitos de segurança da CFO-SEC-91/2009 (baseados no manual SBIS/CFM); para prontuário sem papel, assinatura digital ICP-Brasil (NGS2) [inf] Q-003; prazo de guarda a confirmar [inf] Q-004
- Lead time and cost: [doc SRC-008] [doc SRC-009]
- Mitigation: começar com prontuário eletrônico + impressão/assinatura; planejar certificação SBIS depois
- Evidence: [doc SRC-008] [doc SRC-009]

### BR-007 NFS-e no padrão nacional
- Category: regulation and licensing
- Blocks: F-011
- Gatekeeper: Receita Federal / Comitê Gestor da NFS-e; prefeituras
- Severity: blocks feature
- Market weight: required to sell [inf] Q-009
- What it takes: integração com a API do Emissor Nacional (DPS em XML assinado), certificado digital A1 de cada clínica, parametrização por município
- Lead time and cost: padrão nacional obrigatório desde 01/2026 [doc SRC-011]; API documentada [doc SRC-010]
- Mitigation: usar um provedor de emissão fiscal (API de terceiros) no início
- Evidence: [doc SRC-010] [doc SRC-011]

### BR-006 Conta digital, maquininha e antecipação exigem instituição de pagamento
- Category: regulation and licensing
- Blocks: F-010
- Gatekeeper: Banco Central (instituição de pagamento) ou parceiro BaaS/subadquirente
- Severity: blocks feature
- Market weight: important [inf] Q-009
- What it takes: o Clinipay oferece conta digital, saques, antecipação D+1, Pix parcelado, maquininha [doc SRC-007] [doc SRC-006]; operar isso direto exige autorização do BACEN [inf] Q-005
- Lead time and cost: taxas observadas como referência de preço [doc SRC-007]
- Mitigation: lançar com gateway parceiro (boleto/Pix/cartão via API de um PSP) e só conciliar; conta digital própria fica para depois
- Evidence: [doc SRC-006] [doc SRC-007]

### BR-001 Faturamento de convênios no padrão TISS (ANS)
- Category: regulation and licensing
- Blocks: F-013
- Gatekeeper: ANS (padrão TISS) e cada operadora (credenciamento, portal ou webservice)
- Severity: blocks feature
- Market weight: important [inf] Q-009
- What it takes: CNES da clínica, registro ANS de cada operadora, versão TISS vigente, guias odontológicas (GTO), lotes XML [doc SRC-012]; se o Clinicorp faz isso, não está confirmado [inf] Q-002
- Lead time and cost: [doc SRC-012]
- Mitigation: lançar com "convênio" como tabela de preços e relatório; TISS XML numa segunda fase
- Evidence: [doc SRC-012] [doc SRC-002]

### BR-005 Assinatura digital de documentos e receitas
- Category: regulation and licensing
- Blocks: F-008
- Gatekeeper: ICP-Brasil (AC credenciadas) ou provedor de assinatura eletrônica
- Severity: adds cost
- Market weight: important [inf] Q-009
- What it takes: Clinicorp cobra assinatura digital e contratos "conforme utilização" e oferece certificado digital [doc SRC-002] [doc SRC-001]
- Lead time and cost: custo por envelope/assinatura de um provedor
- Mitigation: integrar um provedor de assinatura eletrônica com API; ICP-Brasil para receitas
- Evidence: [doc SRC-001] [doc SRC-002]

### BR-004 WhatsApp exige Meta WhatsApp Business Platform
- Category: permissioned integration
- Blocks: F-002, F-016, F-020
- Gatekeeper: Meta (verificação da empresa, templates aprovados, cobrança por conversa)
- Severity: adds lead time
- Market weight: required to sell (confirmação por WhatsApp é destaque do produto) [doc SRC-001]
- What it takes: Clinicorp oferece confirmação via WhatsApp e agentes IA no WhatsApp [doc SRC-001]; o caminho oficial é a API da Meta ou um BSP
- Lead time and cost: [doc SRC-001]
- Mitigation: começar via BSP (provedor oficial); "WhatsApp Web" por automação de navegador é rota não oficial com risco de banimento
- Evidence: [doc SRC-001] [doc SRC-002]

### BR-008 Consulta e negativação no SPC Brasil
- Category: regulation and licensing
- Blocks: F-012
- Gatekeeper: SPC Brasil (contrato comercial)
- Severity: adds cost
- Market weight: minor [inf] Q-009
- What it takes: contrato com birô de crédito; Clinicorp cobra por uso [doc SRC-002]
- Lead time and cost: [doc SRC-002]
- Mitigation: deixar para depois do lançamento
- Evidence: [doc SRC-002]

### BR-009 Integrações com centros de radiologia
- Category: permissioned integration
- Blocks: F-019
- Gatekeeper: Image2Doc, Idoc, Cfaz (parcerias comerciais)
- Severity: blocks feature
- Market weight: minor [inf] Q-009
- What it takes: acordos de parceria com cada fornecedor [doc SRC-001]
- Lead time and cost: [doc SRC-001]
- Mitigation: upload manual de imagens no lançamento
- Evidence: [doc SRC-001]

### BR-010 Apps do profissional e do paciente nas lojas
- Category: distribution gatekeeper
- Blocks: F-022
- Gatekeeper: Apple App Store, Google Play
- Severity: adds lead time
- Market weight: important [inf] Q-009
- What it takes: contas de desenvolvedor, revisão das lojas, política de dados de saúde [doc SRC-013]
- Lead time and cost: [doc SRC-013]
- Mitigation: web responsiva (PWA) no lançamento
- Evidence: [doc SRC-013]

### BR-011 Dados, base instalada e migração
- Category: data, content and network effects
- Blocks: aquisição de clientes
- Gatekeeper: o próprio mercado
- Severity: moat
- Market weight: important [inf] Q-009
- What it takes: Clinicorp afirma 100 mil+ usuários e oferece migração paga de outros sistemas (cadastros, fichas, financeiro) [doc SRC-003]
- Lead time and cost: [doc SRC-003]
- Mitigation: importadores de planilha e dos sistemas concorrentes desde o lançamento
- Evidence: [doc SRC-003]

### BR-012 Crédito/financiamento ao paciente depende de parceiro autorizado
- Category: regulation and licensing
- Blocks: F-007, F-010 (financiar tratamento dentro do orçamento)
- Gatekeeper: Banco Central (instituição financeira ou correspondente bancário) e o parceiro de crédito
- Severity: blocks feature
- Market weight: important [inf] Q-009
- What it takes: o editor de orçamento consulta empréstimos e contas de "loan_partner" do paciente [net EV-006]; oferecer crédito exige parceria com instituição autorizada [inf] Q-010
- Lead time and cost: a confirmar (Q-008)
- Mitigation: lançar sem crédito próprio; integrar um parceiro de financiamento odontológico depois
- Evidence: [net EV-006]

### BR-013 Integração Receita Saúde para recibos de profissionais pessoa física
- Category: regulation and licensing
- Blocks: F-028
- Gatekeeper: Receita Federal (Receita Saúde)
- Severity: adds lead time
- Market weight: important [inf] Q-009
- What it takes: o Financeiro tem a aba Integração Receita Saúde, indisponível para clínicas com CNPJ (voltada a profissional pessoa física) [obs EV-022]; detalhes da integração oficial a confirmar [inf] Q-014
- Lead time and cost: a confirmar (Q-008)
- Mitigation: recibos em PDF no lançamento; integração na segunda fase
- Evidence: [obs EV-022]
