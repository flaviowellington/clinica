# Findings

## Problems

| ID | Finding | Severity | Where | Evidence |
|---|---|---|---|---|
| B-001 | Botões só com ícone (editar, desmarcar, excluir no cartão da consulta) sem nome acessível (aria-label/title) | média (acessibilidade) | S-001, C-005 | [obs EV-019] |
| B-002 | Cliques dentro do sistema logado disparam evento do pixel Meta com "advanced matching" de nome (fn/ln) para um coletor na AWS — risco LGPD em sistema de saúde | alta | S-001 | [net EV-019] |
| B-003 | Três bibliotecas de interface convivem (Tailwind/shadcn, MUI, Angular Material): estilos e comportamento de menus diferentes entre telas | média | S-001, S-004 | [obs EV-017, EV-021] |
| B-004 | Recarregar a página (F5) derruba a sessão e volta ao login | média | todas | [obs EV-009] |
| B-005 | Em janela estreita (735px), o cartão da consulta passa da borda direita e esconde os botões de ação | baixa | S-001 | [obs EV-019] |
| B-006 | Ao trocar de parcelado para à vista, o vencimento herda a data da antiga 1ª parcela (+1 mês), não a data de hoje | baixa | C-003 | [net EV-013] |
| B-007 | Clicar no desenho do dente não preenche "Dentes/Região"; só digitando funcionou | baixa | C-004 | [obs EV-009] |
| B-009 | A lista de usuários (GET /security/user/list_user), carregada até na Agenda, devolve um campo Password ao navegador (valor não lido) | alta (segurança) | S-012, S-001 | [net EV-025] |
| B-010 | Configurações de Caixa salvam sozinhas a cada clique, sem confirmação nem desfazer | média | S-014 | [obs EV-024] |
| B-011 | Abrir um quadro kanban (Controle Protético, Indicação) grava LastInteraction no servidor | baixa | S-006, S-016 | [net EV-025] |
| B-012 | Depois de fechar o editor de orçamento, uma camada de carregando (loading-black-dark-div) fica travada e bloqueia a tela até recarregar (o que derruba a sessão, B-004) | média | S-004 | [obs EV-029] |
| B-013 | Novo alerta de retorno vem com o primeiro profissional da lista (não o usuário logado); fácil gravar alerta na agenda de outra pessoa | média | S-003 | [net EV-033] |
| B-014 | Desconto acima de 100% é zerado em silêncio, sem mensagem | baixa | S-004 | [obs EV-033] |
| B-015 | Escape fecha o diálogo de procedimento do odontograma sem confirmação e perde o que foi preenchido | baixa | S-003 | [obs EV-033] |
| B-016 | Exclusões de medicamento e especialidade são feitas por GET (delete_drug, characteristic/delete): links ou pré-carregamentos podem apagar dados | média (segurança) | S-014 | [net EV-038] |
| B-017 | Confirmação de exclusão de especialidade não diz qual registro será apagado | baixa | S-014 | [obs EV-038] |
| B-008 | Telas principais sem URL própria (Pacientes, ficha): não dá para compartilhar link nem usar "voltar" do navegador | média | S-002, S-003 | [obs EV-009] |
| B-018 | Na Nova consulta, a primeira sugestão da busca é "Novo paciente: <texto>": fácil escolher por engano e tentar duplicar o paciente | média | S-001 | [net EV-041] |
| B-019 | Escolher o paciente na Nova consulta volta a data para hoje e o profissional para o primeiro da lista, apagando o que o usuário já tinha escolhido | média | S-001 | [obs EV-041] |
| B-020 | Excluir consulta é feito por GET (`appointment/delete`) | média (segurança) | S-001 | [net EV-041] |
## Strengths

- Regras financeiras cuidadosas: arredondamento exato das parcelas (R-015), chave de idempotência na aprovação (R-018), aviso claro de efeitos ao cancelar (R-036).
- Proteções contra erro: confirmação para aprovar, check-in bloqueia exclusão (R-034), desaprovar pede senha (R-037).
- Log de acesso à ficha do paciente (R-003), útil para LGPD.
- Estados vazios com orientação clara em todas as abas da ficha [obs EV-010].
