---
target: Agenda.tsx
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
target_identity: "file:D:\\VSCode projects\\sistema-clinica\\web\\src\\paginas\\Agenda.tsx"
target_fingerprint: "sha256:763b4d2c47e926d99ee5710b66da65e87d9a8206cc986ccc893b6d5a69944753"
target_path: "D:\\VSCode projects\\sistema-clinica\\web\\src\\paginas\\Agenda.tsx"
timestamp: 2026-10-31T01-09-45Z
slug: web-src-paginas-agenda-tsx
---
Method: dual-agent (A: design review, B: detector + browser). Combined critique of Pacientes, Ficha and Agenda.

Scores: Pacientes 24/40, Ficha 24/40, Agenda 23/40 (Acceptable).
Weak heuristics: 7 Efficiency (Ficha 1, Agenda 1), 9 Error recovery (Pacientes 1).

Priority issues:
1. [P1] Deleting too easy: Confirmar.tsx:71 autofocuses the destructive button in danger mode; "Excluir paciente" always visible in the Ficha header (Ficha.tsx:156). Fix: focus "Voltar"; move Excluir/Ativar into a "Mais ações" menu. -> harden
2. [P1] Colour overloaded and failing contrast: Agendamentos status tags (Em espera 2.7:1, Agendado 4.0, Confirmado 4.2, hardcoded colours outside tokens); agenda chip text 4.2-4.4 on professional tints; placeholders 3.5:1 (suave/70); tooth root colours clash with status legend; agenda uses 3 colour encodings. -> colorize + audit
3. [P1] Keyboard/screen reader impractical: ~288 Tab stops in Agenda grid (Agenda.tsx:696), ~380 in odontogram (Clinico.tsx:275/324); status of short chips and tooth faces not announced. Fix: roving tabindex, accessible names with status, skip link. -> harden
4. [P1] Patient search weaker than backend: help text hides CPF/phone (Pacientes.tsx:100), Enter does nothing, no isError state, BuscaPaciente lists "Novo paciente" first (BuscaPaciente.tsx:162), no combobox, no search in Agenda. -> clarify + harden
5. [P2] Ficha overflows to 642px at 375px (tab groups Ficha.tsx:226/237 don't wrap); missing anamnese shows no header alert; blank Agenda first render, bare "Carregando…" on Ficha. -> adapt + onboard

Detector false positives: side-tab x3 (agenda status bars, neutral blockquote), repeating-stripes-gradient (closed-day hatching), ai-color-palette (brand #340972), nested-cards (Ficha tab groups).

Minor: temporary palette switcher overlaps content (main.tsx:83); "Agenda" vs "Agenda 2"; "encerrado" in danger red; past returns red without "vencido"; Ficha sections alphabetical; budget delete icon hover-only; notes single-line input.
