# Implications for the clone

## Copy

| Area | Item | Why | Refs |
|---|---|---|---|
| Orçamento | Ciclo Em Aberto → Aprovado com efeitos automáticos (financeiro, plano, odontograma) | é o coração do faturamento da clínica | R-018, R-019 |
| Orçamento | Arredondamento exato das parcelas e forma por parcela | evita diferença de centavos | R-015, R-016 |
| Agenda | Status com check-in e tempo de espera | mede atendimento | R-030, R-031 |
| Segurança | Reautenticação para desfazer aprovação; bloqueio de exclusão após check-in | evita fraude e erro | R-034, R-037 |
| LGPD | Log de acesso à ficha | trilha de auditoria de dado de saúde | R-003 |

## Avoid

| Area | Item | Why | Refs |
|---|---|---|---|
| Privacidade | Pixel de marketing com dados de nome dentro do sistema clínico | risco LGPD | B-002 |
| Interface | Três bibliotecas de UI misturadas | comportamento inconsistente | B-003 |
| Sessão | Perder a sessão ao recarregar | frustra o usuário | B-004 |
| Navegação | Telas sem URL própria | sem link nem "voltar" | B-008 |
| Acessibilidade | Botões só com ícone sem nome | leitores de tela | B-001 |

## Improve

| Area | Item | How | Refs |
|---|---|---|---|
| Layout | Cartão da consulta fora da tela em janelas estreitas | posicionamento com colisão de bordas | B-005 |
| Orçamento | Vencimento ao trocar para à vista | recalcular a partir de hoje | B-006 |
| Odontograma | Clique no dente não seleciona | seleção direta no desenho, com teclado | B-007 |
| Convênios | TISS nativo | diferencial se o original não fizer (Q-002) | BR-001 |
