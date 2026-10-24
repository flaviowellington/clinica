# Comece aqui: sistema próprio da clínica

Leia este arquivo antes do `BUILD.md`. Ele traz as decisões do dono do projeto, que valem mais que o texto genérico do `BUILD.md`.

## O que construir

- Um sistema de gestão odontológica para **uma única clínica**: a que hoje usa o Clinicorp e foi estudada nesta base. Não é SaaS. Não há multi-clínica, multi-tenant, planos, cobrança de assinatura, marketplace nem cadastro de novos clientes.
- O objetivo é a clínica parar de depender do Clinicorp sem perder as funções que usa no dia a dia, principalmente o **prontuário**, e resolver as dores dela.
- Interface em português do Brasil. O dono do projeto é iniciante: explique decisões em linguagem simples.

## Como a clínica usa o sistema hoje (observado)

- Atende só particular: nenhuma tabela de convênio nem guia em 2026. TISS fica fora.
- Não usa fornecedores, alinhadores, controle de indicação nem agendamento online.
- Domingo fechado; agenda de 8:00 a 19:45 em intervalos de 15 minutos.
- Perfis em uso: Administrador, Profissional (~8 dentistas), Recepção (~3), Financeiro (1). Matriz em `data-model/permissions.md`.

## Ordem sugerida

1. Modelo de dados, autenticação e perfis (`data-model/`, `data-model/permissions.md`). Log de acesso à ficha do paciente desde o início.
2. Pacientes (cadastro, busca, inativar, excluir com lixeira).
3. Agenda (visões Dia/Semana/Mês, horários por dia da semana, status com check-in, arrastar com confirmação).
4. Prontuário: anamnese com alertas e histórico, odontograma por dente e face, plano e ficha clínica, fichas de especialidade, fotos, documentos (atestado e receitas a partir de modelos), notas e alerta de retorno.
5. Orçamento: itens por dente, desconto, parcelamento, aprovar, reprovar com motivo, duplicar, desaprovar com senha.
6. Financeiro do paciente (parcelas, recebimento, recibo) e da clínica (caixa, contas a pagar e receber, fluxo de caixa).
7. Controle protético (quadro com 5 colunas e ordem de serviço).
8. Relatórios e um painel com os indicadores de `rules/configuracoes.md` R-088.
9. **Importação dos dados do Clinicorp**: a clínica pode exportar pela tela "Exportar dados" (XLSX, F-030). Planeje o importador de pacientes, agenda e prontuário cedo, porque sem os dados antigos ninguém troca de sistema.

As regras de cada parte estão em `rules/`, e os testes de aceitação em `clone/parity.md`.

## Partes não testadas: deduza

Pagamentos, recibo, caixa, configurações gerais, envio de mensagens (WhatsApp, SMS, e-mail) e assinatura digital não foram testados de propósito. Projete versões simples com base no que existe na base e no que uma clínica precisa. Não espere evidência para isso.

## Corrija o que o original faz mal

Veja `findings.md`. Em especial:
- B-018 e B-019: na nova consulta, a busca sugere "Novo paciente" antes dos existentes, e escolher o paciente volta a data e o dentista. Mostre os existentes primeiro e preserve o que já foi escolhido.
- B-013: alerta de retorno e consulta assumem o primeiro dentista da lista; use o usuário logado.
- B-016 e B-020: exclusões por GET. Use DELETE ou POST com confirmação.
- B-008: telas sem URL própria. Dê uma URL a cada paciente e tela.

## Requisitos que não podem faltar

- LGPD: dado de saúde. Servidor no Brasil, backup diário, controle de acesso por perfil, registro de quem abriu cada ficha, nada de rastreadores nas telas clínicas (`clone/barriers.md` BR-002).
- Prontuário: nunca apagar de verdade; guardar histórico de alterações (BR-003).
- Não usar nome, logo, ícones nem textos do Clinicorp.

## Sugestão de tecnologia

Para uma clínica só, um único aplicativo web com banco relacional basta, por exemplo Next.js + PostgreSQL, hospedado no Brasil. Evite microsserviços e filas até haver necessidade real.
