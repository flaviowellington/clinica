# Permissions

Perfis observados no formulário "Novo Usuário": Administrador, Auxiliar Técnico, Profissional, Financeiro, Gestor de Relacionamento, Recepcionista [obs EV-025]. A API devolve `RoleList` e uma `PermissionList` com os menus e rotas de cada usuário (`accessList`: Label, Route, Icon, Level, ParentMenuId) [net EV-001]; o menu é montado a partir dela.

| Action | Dentista (s01) | Administrador (s02) | Outros perfis | Evidence |
|---|---|---|---|---|
| Agenda, Pacientes, Controle Protético | sim | sim | não testado | [obs EV-009, EV-025] |
| Criar paciente, orçamento, consulta; aprovar orçamento | sim | não exercitado (L4) | não testado | [net EV-004, EV-013, EV-014] |
| Desaprovar orçamento | sim, com nova senha | não testado | não testado | [obs EV-021] |
| Financeiro da clínica (12 abas) | não | sim | não testado | [obs EV-022] |
| Relatórios e Dashboard Analítico | não | sim | não testado | [obs EV-023] |
| Clinipay (conta, extrato, recebíveis) | não | sim | não testado | [obs EV-025] |
| Confirmação e Alertas, Controle de Indicação, Alinhadores, Planos | não | sim | não testado | [obs EV-025] |
| Profissionais, Usuários e Permissões | não | sim | não testado | [obs EV-025] |
| Configurações (25 telas) | não abria | sim | não testado | [obs EV-024] |

## Uso real nesta clínica (s02f, só leitura)

- Um usuário pode ter **vários perfis ao mesmo tempo** (a lista mostra "Administrador, Auxiliar Técnico, Financeiro, …" na mesma linha) [obs EV-041]. A API de perfis (`GET /security/user/list_role`) devolve só nomes; as permissões vêm por usuário (`get_role_by_user_id`).
- Perfis em uso: Profissional (~8 usuários), Recepcionista (~3), Financeiro (1), Administrador (1, sem contar o usuário de teste). Auxiliar Técnico e Gestor de Relacionamento não aparecem em nenhum usuário real → o clone pode começar com 4 perfis: Administrador, Profissional, Recepção, Financeiro.
- Abrir o menu de ações de um usuário foi bloqueado pela proteção do agente (Permission Grant); não contornado.

## Matriz para o clone (deduzida)

Base: catálogo de 115 permissões em 14 grupos [obs EV-026]; Profissional observado no usuário de teste antes da promoção (Agenda 3/4, Controle Protético 1/1, Financeiro 2/16, Pacientes 31/33, Relatórios 0/49, Configurações 0/1) [obs EV-026]; menu do Dentista na s01 [obs EV-009]; descrições oficiais dos perfis [obs EV-026]. Recepcionista e Financeiro são dedução a partir das descrições e do trabalho de cada função [inf] Q-007.

| Grupo (nº de permissões) | Administrador | Profissional | Recepção | Financeiro |
|---|---|---|---|---|
| Agenda (4) | tudo | tudo menos "Somente visualização" | tudo (é quem mais usa) | só visualizar |
| Pacientes: cadastro, telefone, agendamentos, documentos | tudo | sim | sim | ver |
| Pacientes: prontuário clínico (anamnese, odontograma, plano e ficha clínica, fichas de especialidade, exames, fotos) | tudo | sim | não (no máximo ver anamnese e fotos) | não |
| Pacientes: orçamento (criar, valores, ordem) | tudo | sim | criar e ver valores | ver valores |
| Pacientes: aprovar orçamento | sim | sim | sim | sim |
| Pacientes: cancelar orçamento aprovado; autorizar alterações no financeiro | sim | **não** | não | sim |
| Pacientes: financeiro do paciente (parcelas, recibos, checkout) | tudo | ver | receber pagamento e emitir recibo | tudo |
| Pacientes: excluir ou inativar paciente | sim | sim | não | não |
| Controle Protético (1) | sim | sim | sim | não |
| Financeiro da clínica (16): caixa, contas a pagar/receber, conciliação, fluxo de caixa | tudo | não (2/16 no teste) | abrir caixa e caixa | tudo |
| Relatórios (49) | tudo | só os de tratamento dele | agendamentos e pacientes | financeiros e de pagamentos |
| Dashboard Analítico | sim | não | não | sim |
| Profissionais (6): agenda de trabalho, comissões | tudo | só os próprios dados | agenda de trabalho | comissões |
| Usuários e Permissões, Configurações | sim | não (só a própria senha) | não | não |

Regras de permissão que o clone deve manter:
- Um usuário pode ter vários perfis; a permissão final é a soma deles.
- Cada usuário pode ter permissões ajustadas além do perfil, com botão "restaurar padrão".
- Horário de acesso ao sistema por usuário ("Controle de Horário de Acesso").
- Ações sensíveis pedem senha de quem autoriza (desaprovar orçamento, excluir lançamento) [obs EV-029, EV-038].
- "Exibir número de telefone" é uma permissão separada (agenda e prontuário): útil para LGPD.

## Not tested

- A matriz de permissões de cada perfil (o menu ⋮ do usuário não abriu por automação); perfis Recepcionista, Financeiro, Auxiliar Técnico e Gestor de Relacionamento; permissões por unidade.