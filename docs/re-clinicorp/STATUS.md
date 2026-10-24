# Status: Clinicorp
Updated: 2026-10-23 · Session: s02f · Phase: 7 Close (estudo parcial) · Clone: **uma única clínica** (ver charter)
Environment: s01 L1 (Dentista) · s02 L4 (Administrador) · s02b testes com usuário de teste promovido a Administrador · Open ledger rows: 0

## Summary
- Covered: ciclo clínico completo testado com pacientes fictícios (cadastro, agenda com consulta e compromisso, anamnese com alerta, nota, alerta de retorno, odontograma, atestado, orçamento com parcelamento, desconto, aprovação e desaprovação, conta a pagar, fotos, reprovar e duplicar orçamento, controle protético); módulos de Administrador lidos (Financeiro, ~40 relatórios, 25 configurações, 115 permissões). 77 regras, 32 funcionalidades, 19 telas, 13 barreiras.
- Not covered: pagamentos, mudança de configurações gerais e de permissões (bloqueados pela proteção do agente ou evitados para não afetar a clínica); NFS-e, estoque, CRM (Premium); envios a pacientes (proibidos).
- Decide: devolver o usuário de teste ao perfil Profissional (L-008); confirmar se a conta é uma clínica em produção (Q-012).

## Next actions
1. Mapear perfis Recepcionista, Financeiro, Auxiliar Técnico e Gestor de Relacionamento (Q-007), se o usuário trocar o perfil do flavio para cada um.
2. Começar o clone para esta clínica: modelo de dados, pacientes, agenda, prontuário, orçamento (PRD atualizado).
3. Pagamentos, caixa e configurações gerais: não testar; projetar por dedução (decisão do usuário).

## Needs human
- **Voltar o usuário flavio para o perfil Profissional e restaurar as permissões padrão** (L-008): Usuários e Permissões > flavio > Perfil de Usuário > Editar > Profissional; aba Configurações de permissão > restaurar padrão.
- Q-012: a conta parece ser uma clínica em uso (vários usuários, acessos hoje). Os testes deixaram só registros excluídos logicamente (paciente de teste, conta a pagar de teste), que podem aparecer em Administração de Dados e em "Lançamentos Excluídos".
- Termo de Adesão não lido (Q-001). Perguntas para advogado: Q-004, Q-006. Perguntas de mercado: Q-008, Q-009.

## Blocked
- Pagamento de conta, troca de perfil: bloqueados pela proteção do agente.
- Configurações gerais (bloqueios, 2FA, horários, confirmações, numeração de recibos): não alteradas para não afetar a operação da clínica.
- F-011, F-015, F-016, F-020, F-027: plano Standard ou módulo não contratado (blocked: plan).
- Envios a pacientes, Clinipay, integrações, SPC: A5.

## Last session
- s02f: guias de convênio (nenhuma; clínica só particular), agenda (horários por dia, criar com paciente existente, arrastar com confirmação, excluir), dashboard (15 painéis), indicação, alinhadores (zero casos); tudo excluído e conferido.
- s02e: anamnese (obrigatória, edição, histórico), fotos (pasta, upload, girar, excluir), ficha geral, reprovar e duplicar orçamento, ações do paciente (Clini.me, links, impressão), controle protético (criar, mover, excluir), relatório de alertas de retorno; tudo excluído e conferido.
- s02d: edição de cadastro, ficha de Endodontia, faces do odontograma, receituário controlado, lançamento manual (excluído com senha do usuário), inativação, medicamento e especialidade [RE]; tudo excluído e conferido.
- s02c: testes de prontuário, documentos e agenda com [RE] Paciente Teste 2; tudo excluído e conferido. Ver log/2026-10-23-s02.md.
- s02: leitura completa do perfil Administrador (L4) e s02b: testes com o usuário de teste promovido; limpeza da s01. Ver log/2026-10-23-s02.md.

## Residuals
- [RE] Paciente Teste 5: excluído (lógico); a consulta de 30/12: excluída.
- [RE] Paciente Teste 4 (anamneses, pasta, orçamento reprovado): excluído (lógico); foto e card protético: excluídos.
- [RE] Paciente Teste 3 (com ficha de Endodontia) e o lançamento de R$ 1: excluídos (lógico); medicamento e especialidade [RE]: excluídos.
- [RE] Paciente Teste 2 e tudo criado nele (anamnese, nota, alerta de retorno, procedimento, atestado): excluídos logicamente.
- Paciente "[RE] Paciente Teste" e seu orçamento: excluídos logicamente (restauráveis em Configurações > Administração de Dados).
- Lançamento financeiro do orçamento: em "Lançamentos Excluídos" do paciente.
- Conta a pagar "[RE] Teste conta a pagar": excluída (não verificado se há lixeira).
- Gravações automáticas do próprio app ao abrir telas (LastInteraction em quadros kanban, logs de acesso) — inevitáveis, sem dados novos.
- Perfil do usuário flavio: Administrador até o usuário restaurar (L-008).
