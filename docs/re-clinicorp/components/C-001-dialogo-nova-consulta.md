# C-001 Diálogo "Nova consulta"
Used in: S-001, S-003 · Product alias: "Nova consulta" (Radix Dialog) · Status: draft

## Anatomy
Abas Consulta | Compromisso; cartão do paciente (celular, e-mail, Editar); checkboxes Primeira consulta e Múltiplos agendamentos; Observações; Adicionar procedimentos; Data; Profissional; Categoria; botões de horário de 15 min; Confirmação e Alerta de consulta (padrão "-- Não enviar --"); Enviar por; Cancelar | Confirmar consulta [obs EV-009] [net EV-014].

## Behavior
- Ao abrir, carrega clínica, dentistas, categorias, horários da manhã/tarde/dia e verifica campanha do paciente [net EV-014].
- Rules: R-022, R-027, R-028, R-029.

## Not tested
- Aba Compromisso, múltiplos agendamentos, procedimentos que mudam a duração, escolha de canal de envio (A5).