# Coverage

Values: `todo`, `partial`, `done`, `blocked`, `n/a`. The work queue is this table, top to bottom.

| Feature | Anatomy | States | Interactions | Rules | Data | Network | Keyboard and a11y | Persistence | Design | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| F-001 Agenda | done | done | done | done | done | done | partial | done | done | consulta, status, check-in, compromisso, visões, arrastar com confirmação, horários por dia da semana (R-063, R-064, R-083 a R-086) |
| F-006 Prontuário e odontograma | done | done | done | done | done | done | todo | partial | partial | anamnese (obrigatória, edição, histórico), fotos (pasta, upload, girar, excluir), ficha de especialidade, faces, ficha geral (R-058 a R-078) |
| F-007 Orçamento / plano de tratamento | done | done | done | done | done | done | partial | partial | partial | criar, parcelar, aprovar, desaprovar, desconto %, reprovar, duplicar (R-065, R-066, R-079); Follow Up sem efeito |
| F-005 Pacientes | done | partial | done | done | done | done | todo | todo | partial | criar, editar, inativar, imprimir, excluir; Clini.me exige CPF (R-080, R-081) |
| F-009 Financeiro | done | partial | partial | partial | partial | done | todo | todo | partial | hub de 12 abas lido (admin); conta a pagar criada e excluída; pagamento bloqueado pela proteção do agente |
| F-010 Pagamentos (Clinipay) | partial | partial | blocked | partial | partial | partial | todo | todo | todo | portal, taxas e configurações lidos; operações reais A5 |
| F-013 Convênios / TISS | partial | partial | partial | partial | partial | done | n/a | n/a | todo | Controle de Planos listado: sem guias nem tabelas de convênio; sem XML (R-087); fora do clone |
| F-008 Documentos e assinaturas | done | partial | partial | partial | partial | done | todo | todo | partial | atestado gerado de modelo (R-062); assinatura não enviada (A5) |
| F-011 NFS-e | blocked | blocked | blocked | blocked | blocked | blocked | blocked | blocked | blocked | Premium (blocked: plan) |
| F-002 Confirmação de consulta | done | partial | blocked | done | done | done | todo | todo | todo | tela e configurações lidas; envio é A5 |
| F-003 Agendamento online | partial | todo | blocked | todo | partial | partial | todo | todo | todo | configuração lida; habilitar é A4 com efeito público |
| F-004 Alerta de retorno | done | partial | done | done | done | done | todo | todo | todo | criado e removido com o paciente (R-060) |
| F-014 Dashboard e relatórios | done | partial | done | done | partial | done | todo | todo | todo | catálogo e filtros; DRE; relatório Alertas de Retorno; dashboard com 15 painéis (R-088) |
| F-012 SPC | partial | todo | blocked | todo | todo | todo | todo | todo | todo | pago por uso |
| F-015 Estoque e metas | blocked | blocked | blocked | blocked | blocked | blocked | blocked | blocked | blocked | Premium (blocked: plan); permissões de relatório de estoque existem |
| F-016 CRM / CRC | blocked | blocked | blocked | blocked | blocked | blocked | blocked | blocked | blocked | Premium (blocked: plan) |
| F-017 Protético e alinhadores | done | partial | done | done | done | done | todo | done | todo | card criado, ordem de serviço, mover e excluir testados (R-082); alinhadores só lidos |
| F-018 Acessos e unidades | partial | todo | todo | todo | partial | partial | todo | todo | todo | ver F-023 |
| F-019 Integrações radiologia | partial | partial | blocked | todo | todo | partial | todo | todo | todo | conectar é A5 |
| F-020 IA | blocked | blocked | blocked | blocked | blocked | blocked | blocked | blocked | blocked | combo pago |
| F-021 Assinatura e plano | partial | blocked | blocked | blocked | partial | partial | blocked | blocked | blocked | catálogo de módulos lido; billing é A5 |
| F-022 Apps | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | fora do escopo (app mobile) |
| F-023 Usuários e perfis | done | partial | blocked | partial | done | done | todo | todo | todo | 6 perfis e 115 permissões lidos; trocar perfil bloqueado pela proteção do agente (feito pelo usuário) |
| F-024 Profissionais | partial | todo | todo | todo | done | done | todo | todo | todo | lista e formato da API |
| F-025 Configurações gerais | done | todo | blocked | done | partial | partial | todo | todo | todo | 25 telas lidas; não alteradas para não afetar a clínica |
| F-026 Controle de Indicação | done | partial | partial | partial | partial | done | todo | todo | todo | kanban; "Como conheceu?" não cria cartão (R-089); fora do clone |
| F-027 Planos de assinatura | partial | n/a | blocked | todo | partial | partial | todo | todo | todo | módulo não contratado (blocked: plan) |
| F-028 Receita Saúde | partial | partial | blocked | todo | todo | partial | todo | todo | todo | indisponível para CNPJ |
| F-029 Medicamentos e documentos | partial | todo | todo | todo | todo | partial | todo | todo | todo | listas lidas |
| F-030 Exportar e restaurar dados | partial | todo | todo | partial | todo | todo | todo | todo | todo | telas lidas |
| F-031 Caixa | partial | todo | blocked | partial | todo | todo | todo | todo | todo | configurações lidas; autosave |
| F-032 Contas bancárias e conciliação | partial | partial | todo | todo | todo | partial | todo | todo | todo | sem conta cadastrada |
