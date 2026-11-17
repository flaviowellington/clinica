# Responsividade no celular

Primeira revisão em 09/11/2026; **segunda em 17/11/2026**, em 375×812, com o usuário `admin` e os dados fictícios do seed (todas as telas, abas, janelas e pop-ups). A segunda parte é o **padrão obrigatório** para toda tela nova.

## 1. Resultado da revisão

Medido em cada tela: transbordo horizontal da página, áreas com rolagem interna, alvos de toque (< 44 px), texto (< 12 px), fonte dos campos (< 16 px) e onde aparece a ação principal.

### Corrigido em 17/11/2026

Peças compartilhadas (valem para o app inteiro):

- **Campos:** `.campo` com 16 px e 44 px de altura no celular (`index.css`).
- **Botões:** `.botao*` com no mínimo 44 px no celular; `.botao-pequeno` e `.botao-icone` só encolhem do `md` em diante. Abas (`Abas`) com 44 px.
- **Janelas:** × com 44×44 px (`Dialogo`). Rodapé fixo com a classe `.rodape-janela` em Nova consulta/compromisso, Novo/Editar usuário, Trabalho protético, Anamnese e Paciente.
- **Avisos:** no celular sobem acima da barra de baixo, com `z-40` (`main.tsx`).
- **Filtros suspensos** (`Suspenso`): descem de linha em vez de espremer o rótulo; o painel não passa da tela.
- **Listas longas:** `useAosPoucos` (`componentes/CarregarMais.tsx`) mostra aos poucos com "Carregar mais".

Por tela:

| Tela                                          | Antes                                                                           | Agora                                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Ficha (cabeçalho)                             | 858 px; alertas da anamnese numa coluna de ~64 px, cortados                     | 453 px; alertas na largura toda; menu de seções numa faixa que rola de lado e mostra a seção aberta |
| Ficha › Orçamentos                            | Tabela de 850 px; excluir só no hover                                           | Cartões; lixeira sempre à vista                                                                     |
| Ficha › Odontograma / Plano                   | Lista de procedimentos com 8.820 px (e 13.112 px dentro de uma caixa de 284 px) | 20 blocos por vez, sem caixa com rolagem no celular                                                 |
| Janela Novo orçamento                         | Rolava de lado (413 px em 349)                                                  | Cabe na largura                                                                                     |
| Relatórios                                    | Filtros sobrepostos; índice com rolagem própria; 850 linhas (74.946 px)         | Filtros um por linha; índice atrás de "Outros relatórios"; 50 linhas por vez; 1ª coluna fixa        |
| Agenda                                        | Pop-up Retornos saía da tela (−72 px); grade com rolagem vertical própria       | Pop-up na largura da tela; grade rola só de lado                                                    |
| Confirmações                                  | 21.642 px; botões de 28 px                                                      | 30 cartões por vez; botões de 44 px                                                                 |
| Usuários                                      | Tabela de 871 px; ações de 24 px fora da tela                                   | Cartões                                                                                             |
| Lixeira                                       | Tabela de 768 px                                                                | Cartões                                                                                             |
| Financeiro › Orçamentos abertos e Aprovações  | Lista numa caixa de 533 px                                                      | Lista na página, 20 por vez                                                                         |
| Configurações, Nota fiscal                    | Listas com altura fixa (`max-h` sem prefixo)                                    | Altura fixa só do `lg` em diante                                                                    |
| Painel, Profissional, Laboratórios, Pacientes | Transbordavam (revisão de 09/11)                                                | Corrigidos antes desta revisão                                                                      |

### Ainda pendente

| Tela                                              | Problema medido                                                                                                                                                                     |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agenda                                            | Horários da grade e setas feitos à mão, abaixo de 44 px. Sobram 160 px de rolagem na grade: uma consulta do seed passa do último horário. `/agenda-2`: a grade só começa em 954 px. |
| Configurações › Horários e Profissional (detalhe) | Grade de 440 px em ~300 px; 252 botões de 68×28 px; texto de 10 px (`GradeSemana`).                                                                                                 |
| Ficha › Odontograma                               | Desenho de 1.012 px (rolagem contida); faces do dente pequenas para tocar.                                                                                                          |
| Ficha › Plano e Ficha Clínica                     | Mover e remover etapa só aparecem ao passar o mouse (`Clinico.tsx`, etapas).                                                                                                        |
| Ficha (cabeçalho)                                 | Etiquetas de alerta clicáveis com 20–36 px.                                                                                                                                         |
| Ficha › Agendamentos                              | 81 consultas (14.147 px) sem paginação; ano em 11 px.                                                                                                                               |
| Painel e Financeiro › Gráficos                    | ~100 e ~43 textos abaixo de 12 px (eixos); alças de mover arrastando.                                                                                                               |
| Janela Exportar gráficos                          | Rola de lado (375 px em 339).                                                                                                                                                       |
| Configurações › Procedimentos                     | Tabela de 723 px (rolagem contida); deveria virar cartões.                                                                                                                          |
| Caixas de marcar                                  | 20 px; onde não há `label` em volta, o alvo fica pequeno.                                                                                                                           |

### Bom

- Navegação: barra de baixo com 4 abas + "Mais".
- Início, Pacientes, Profissionais (lista), Mensagens, Protético, Importação.
- Financeiro › Controle Financeiro, Orçamentos abertos e Aprovações.
- Configurações › Clínica, Especialidades, Anamnese, Modelos de documento, E-mail e mensagens, Permissões.
- Ficha › Visão Geral, Nota Fiscal, Anamnese, Documentos, Exames, Fotos, Indicações.
- Janelas: Novo/Editar paciente, Nova consulta, Novo compromisso, Usuário, Trocar senha, Trabalho protético, Alerta de retorno, Novo planejamento, Novo documento, Adicionar procedimento, Novo procedimento, Documento padrão, Enviar para todos, "Mais".

### Não testado

- Confirmar presença e Autorizar plano (links do paciente), tela de entrar (usa `.campo`, então já tem 16 px).
- Janelas de foto/recorte e "Adicionar gráfico personalizado"; tema escuro.
- Aparelho real: tudo foi medido em emulação no Chromium.

## 2. Padrão obrigatório para telas novas

Escreva a tela para 375 px primeiro; `md:` (768) e `lg:` (1024) só acrescentam.

1. **A página nunca rola para o lado.** Só um bloco interno pode, com `overflow-x-auto`. Todo filho de `grid` ou `flex` que guarda tabela, gráfico ou texto longo leva `min-w-0`.
2. **Listas viram cartões no celular.** Tabela só a partir de `md:`. No cartão: o que identifica a linha em cima, 2–3 dados embaixo, ações no pé. Modelo: Confirmações e Financeiro › Controle. Tabela com rolagem lateral só para relatório de conferência, com a 1ª coluna fixa.
3. **Listas longas têm paginação** (ou "carregar mais", com `useAosPoucos` de `componentes/CarregarMais.tsx`). Nada de centenas de linhas de uma vez.
4. **Uma rolagem vertical só: a da página.** Sem cartão com altura fixa e rolagem própria no celular (`lg:h-[…]`, nunca sem prefixo).
5. **Alvo de toque com no mínimo 44×44 px**, 8 px entre alvos. `.botao-pequeno` e `.botao-icone` só a partir de `md:`.
6. **Campos com fonte de 16 px no celular** (`text-base md:text-sm`), um por linha, com o `type`/`inputMode` certo (`tel`, `email`, `numeric`).
7. **Texto com no mínimo 12 px.**
8. **Filtros e grupos de botões quebram linha** (`flex-wrap`) ou ficam numa faixa com `overflow-x-auto`. Muitos filtros: recolha num botão "Filtros".
9. **O conteúdo principal aparece na primeira tela.** Filtros, calendários e menus secundários vêm recolhidos ou depois dele.
10. **Subnavegação** (abas, seções) usa o componente `Abas` (já rola de lado). Não crie outro menu.
11. **Janelas** usam `Dialogo`; a ação principal fica no rodapé fixo (classe `.rodape-janela`, último filho do formulário).
12. **Reserve a barra de baixo:** nada fixo no pé sem `z-index` acima dela e sem subir 6 rem; o `main` já tem `pb-28`.
13. **Nada depende de passar o mouse** (balão, ação que só aparece no hover) nem de arrastar sem alternativa por botão.

### Conferência antes de entregar a tela

Abra em 375×812 e rode no console; tem de dar `true`:

```js
document.documentElement.scrollWidth <= innerWidth
```

Depois confira: a ação principal aparece sem rolar; nenhum botão com menos de 44 px; nenhum campo com fonte menor que 16 px; a barra de baixo continua visível; lista com 100+ itens pagina.
