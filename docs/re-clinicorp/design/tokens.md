# Design tokens

Theme(s) studied: claro (único observado). Window: 735x630 (painel do app, layout estreito). Fonte: [obs EV-017].

O produto mistura três camadas visuais: telas novas em Tailwind com variáveis no padrão shadcn/ui, componentes MUI e um editor de orçamento antigo em Angular Material [obs EV-017]. O clone deve usar **um** sistema só.

## Color

| Token | Light | Dark | Variable | Used for | Evidence |
|---|---|---|---|---|---|
| primary | #EC6726 (hsl 19.7 84% 53.7%) | não observado | `--primary`, `--variant-containedBg` | botão "Novo", "Hoje", dia selecionado, ações | [obs EV-017] |
| primary-soft | #FDF0E9 | — | — | fundos laranja claros (ícones da home, botão Consultar CPF) | [obs EV-017] |
| foreground | #0C0A09 | — | `--foreground`, `--cia-fg` | títulos | [obs EV-017] |
| text | #4B5563 / #333333 | — | — | texto comum | [obs EV-017] |
| muted-foreground | #78716C | — | `--muted-foreground` | textos secundários | [obs EV-017] |
| border | #E7E5E4 | — | `--border`, `--input` | bordas e campos | [obs EV-017] |
| surface | #F9FAFB / #FFFFFF | — | `--background`, `--card` | fundos | [obs EV-017] |
| calendar-slot | rgba(147,197,253,.2) | — | — | fundo da grade de horários livres | [obs EV-017] |
| destructive | hsl(0 65% 50.6%) | — | `--destructive` | erros, linha do "agora" | [obs EV-017] |
| success | #4CAF50 / faixa verde "Financeiro OK" | — | `--cia-success` | status positivo | [obs EV-015, EV-017] |
| ai-accent | #7B0CED | — | `--cia-accent` | recursos Clinicorp IA | [obs EV-017] |

## Typography

| Token | Family | Size | Weight | Line height | Used for | Evidence |
|---|---|---|---|---|---|---|
| body | Roboto | 14px | 400 | 20px | texto padrão | [obs EV-017] |
| body-strong | Roboto | 14px | 500 | 20px | rótulos | [obs EV-017] |
| caption | Roboto | 12px | 500 | 16px | horários da grade, legendas (mais frequente) | [obs EV-017] |
| title | Roboto | 18px | 600 | 28px | títulos de seção | [obs EV-017] |

## Spacing, radius, shadow

| Token | Value | Variable | Used for | Evidence |
|---|---|---|---|---|
| space-1 / 2 / 3 / 4 | 4 / 8 / 12 / 16 px | — | grade de 4px | [obs EV-017] |
| radius-sm / md / lg | 4 / 6 / 10 px | — | campos, botões, cartões | [obs EV-017] |
| radius-full | 9999px | — | avatares e pílulas | [obs EV-017] |
| shadow-sm | 0 1px 2px rgba(0,0,0,.05) | — | campos | [obs EV-017] |
| shadow | 0 1px 3px rgba(0,0,0,.1), 0 1px 2px -1px rgba(0,0,0,.1) | — | cartões | [obs EV-017] |
| shadow-xl | 0 20px 25px -5px rgba(0,0,0,.1), 0 8px 10px -6px rgba(0,0,0,.1) | — | popovers (cartão da consulta) | [obs EV-017] |

## Motion

| Token | Duration | Easing | Used for | Evidence |
|---|---|---|---|---|
| color | 150ms | cubic-bezier(.4,0,.2,1) | hover de cores | [obs EV-017] |
| transform | 200ms | cubic-bezier(.4,0,.2,1) | abrir/fechar | [obs EV-017] |

## Z-index layers

| Layer | Value | Used for | Evidence |
|---|---|---|---|
| não medido | — | — | — |

## Icons

| Name | Size | Where used | Evidence |
|---|---|---|---|
| Material Icons / Material Symbols Outlined (ligaduras como `add_circle`, `print`, `email`, `mode_edit`) | 24px | editor de orçamento, ações | [obs EV-009, EV-017] |

## Breakpoints and layout

| Width | Change | Evidence |
|---|---|---|
| 735px | layout já compacto: menu lateral vira gaveta ("Menu lateral"), agenda com lateral recolhível | [obs EV-002] |

## Not tested

- Tema escuro, estados de hover/foco, larguras 1440 e 390 px (não foi possível redimensionar o painel).
