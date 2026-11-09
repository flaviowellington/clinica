# Responsividade no celular

Revisão feita em 09/11/2026, em 375×812, com o usuário `admin` e os dados fictícios do seed.
A segunda parte é o **padrão obrigatório** para toda tela nova.

## 1. Resultado da revisão

Medido em cada tela: transbordo horizontal da página, áreas com rolagem interna, tamanho dos alvos de toque, tamanho do texto e dos campos.

### Ruim (corrigir)

| Tela | Problema medido |
| --- | --- |
| **Ficha do paciente** (as 10 seções) | A página transborda 36 px: o grupo "Clínico" do menu de seções não quebra linha (`Ficha.tsx:247`) e corta "Odontograma". Com o transbordo, a página fica com 411 px e a **barra de navegação de baixo sai da tela**. Cabeçalho + menu ocupam ~800 px antes do conteúdo. |
| Ficha › Orçamentos | Tabela de 850 px num espaço de 297 px: só nº, data e situação aparecem. |
| **Painel** | Transborda 235 px: as 14 seções de gráfico ficam com 594 px. 100 textos abaixo de 12 px. |
| **Profissional** (detalhe) | Transborda 115 px: campos e o botão Salvar ficam cortados à direita. |
| Configurações › Laboratórios | Transborda 165 px: título e formulário cortados. |
| **Relatórios** | Botões de filtro sobrepostos (rótulos ilegíveis). O índice fica num cartão com rolagem própria no topo. "Agendamentos › Geral" desenha 1.280 linhas de uma vez: 111.000 px de altura. Tabelas com rolagem lateral. |
| **Pacientes** (lista) | Tabela de 800 px em 329 px: só nome e celular visíveis; o nome quebra em 3–4 linhas. |
| Usuários | Tabela de 871 px em 329 px: Editar e Trocar senha ficam fora da tela. |

### Regular (funciona, mas cansa)

| Tela | Problema medido |
| --- | --- |
| Agenda (`/agenda`) | ~900 px de calendário, profissionais e alertas antes da grade. A grade do dia tem 1.083 px em 317 px, com rolagem vertical e horizontal dentro de um cartão. Setas do mês com 20 px. `/agenda-2` (filtros no topo) é melhor: 1.042 px de altura contra 1.746. |
| Financeiro › Gráficos | Cartão do gráfico vaza 4 px; botões de 28 px; 51 textos abaixo de 12 px (eixos). |
| Ficha › Odontograma | Desenho de 651 px em 297 px (rolagem contida); faces do dente com 7 px de largura para tocar. |
| Configurações › Horários (e agenda do profissional) | Grade de 440 px em 289 px; 288 botões de 68×28 px. |
| Configurações › Procedimentos | Tabela de 707 px em 317 px (rolagem contida). |
| Lixeira | Tabela de 640 px em 341 px (rolagem contida). |
| Confirmações | Cartões bons, mas 95 de uma vez (19.000 px de altura) e botões de 28 px. |

### Bom

- Navegação: barra de baixo com 4 abas + "Mais".
- Entrar, Início, Protético (colunas com encaixe ao arrastar), Profissionais (lista), Importação.
- Financeiro › Orçamentos abertos e Controle Financeiro.
- Configurações › Clínica, Especialidades, Anamnese, Modelos de documento, E-mail e mensagens.
- Ficha › Visão Geral, Agendamentos, Anamnese, Plano e Ficha Clínica, Documentos, Exames, Fotos, Indicações: o **conteúdo** está bom (listas em cartões); o defeito é o menu da ficha, acima.
- Janelas "Novo paciente" e "Nova consulta": cabem na largura, rodapé fixo com a ação.

### Não testado

- Confirmar presença e Autorizar plano (links do paciente): só abertos com token inválido. No código são feitos para celular primeiro.
- Demais janelas (orçamento, anamnese, recorte de foto, documentos) e o tema claro.
- Aparelho real: tudo foi medido em emulação no Chromium.

### Problemas que valem para o app inteiro

1. **Campos com fonte de 14 px.** No iPhone, o Safari dá zoom na página ao focar campo com menos de 16 px.
2. **Alvos pequenos:** `.botao-pequeno` (24–28 px), checkbox (20 px), o × das janelas.
3. **Avisos atrás da barra de baixo** (lido no código, não reproduzido): em `main.tsx` os avisos ficam em `fixed right-4 bottom-4` sem `z-index`; a barra é `z-30` no mesmo lugar.
4. **Causa comum dos transbordos:** filho de `grid`/`flex` sem `min-w-0` guardando uma tabela com `min-w-[…]`. Painel, Profissional e Laboratórios são o mesmo defeito.

## 2. Padrão obrigatório para telas novas

Escreva a tela para 375 px primeiro; `md:` (768) e `lg:` (1024) só acrescentam.

1. **A página nunca rola para o lado.** Só um bloco interno pode, com `overflow-x-auto`. Todo filho de `grid` ou `flex` que guarda tabela, gráfico ou texto longo leva `min-w-0`.
2. **Listas viram cartões no celular.** Tabela só a partir de `md:`. No cartão: o que identifica a linha em cima, 2–3 dados embaixo, ações no pé. Modelo: Confirmações e Financeiro › Controle. Tabela com rolagem lateral só para relatório de conferência, com a 1ª coluna fixa.
3. **Listas longas têm paginação** (ou "carregar mais"). Nada de centenas de linhas de uma vez.
4. **Uma rolagem vertical só: a da página.** Sem cartão com altura fixa e rolagem própria no celular (`lg:h-[…]`, nunca sem prefixo).
5. **Alvo de toque com no mínimo 44×44 px**, 8 px entre alvos. `.botao-pequeno` e `.botao-icone` só a partir de `md:`.
6. **Campos com fonte de 16 px no celular** (`text-base md:text-sm`), um por linha, com o `type`/`inputMode` certo (`tel`, `email`, `numeric`).
7. **Texto com no mínimo 12 px.**
8. **Filtros e grupos de botões quebram linha** (`flex-wrap`) ou ficam numa faixa com `overflow-x-auto`. Muitos filtros: recolha num botão "Filtros".
9. **O conteúdo principal aparece na primeira tela.** Filtros, calendários e menus secundários vêm recolhidos ou depois dele.
10. **Subnavegação** (abas, seções) usa o componente `Abas` (já rola de lado). Não crie outro menu.
11. **Janelas** usam `Dialogo`; a ação principal fica no rodapé fixo.
12. **Reserve a barra de baixo:** nada fixo no pé sem `z-index` acima dela e sem subir 6 rem; o `main` já tem `pb-28`.
13. **Nada depende de passar o mouse** (balão, ação que só aparece no hover) nem de arrastar sem alternativa por botão.

### Conferência antes de entregar a tela

Abra em 375×812 e rode no console; tem de dar `true`:

```js
document.documentElement.scrollWidth <= innerWidth
```

Depois confira: a ação principal aparece sem rolar; nenhum botão com menos de 44 px; nenhum campo com fonte menor que 16 px; a barra de baixo continua visível; lista com 100+ itens pagina.
