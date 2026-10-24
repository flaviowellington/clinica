# Charter: Clinicorp
Date: 2026-10-22

| Item | Value |
|---|---|
| Goal | Estudar o Clinicorp (software de gestão para clínicas odontológicas) para reconstruir um produto equivalente para o mercado brasileiro |
| Requested by | Usuário (operador iniciante), via sessão de instalação do plugin RES |
| Scope | Ciclo principal da clínica: agenda, pacientes, prontuário/odontograma, orçamento e plano de tratamento, financeiro, relatórios; barreiras de produção (convênios/TISS-ANS, CFO, LGPD, assinatura digital, NFS-e, pagamentos) |
| Out of scope | Qualquer escrita no produto (criar, editar, excluir, enviar, salvar); integrações conectadas; cobrança e assinatura; app mobile |
| Clone target market | **Uma única clínica** (a clínica desta conta), sem multi-tenant nem escala. Decisão do usuário em 2026-10-23: "esse sistema nao vai ser escalavel. ele vai ser feito para uma unica clinica. pensando nas dores deles e focando em resolver as necessidades deles". Substitui a suposição anterior (clínicas pequenas e médias, mercado brasileiro) |
| Untested by decision | Pagamentos, recibo, caixa, configurações gerais, Clini.me, links de agendamento/indicação, envios: não testar; deduzir e projetar no clone (usuário, 2026-10-23: "dá para voce deduzir essas partes que faltam e adequar ao que ja temos e melhorar/criar sozinho") |
| Priorities | P1 agenda, pacientes, prontuário, orçamento/tratamento, financeiro; P1 barreiras (TISS/ANS, CFO, LGPD, assinatura digital, NFS-e) |
| Mode | Attended (o usuário acompanha a sessão) |
| Environment level | L1 desde 2026-10-22 (antes L4) — conta trial do usuário no navegador embutido do Claude (perfil separado do Chrome do usuário) |
| Write authorization | "pode mexer em tudo ai, criar funcoes, testar, te dou permissao L1 de segurança" (usuário, 2026-10-22). A5 continua proibido |
| KB language | Português do Brasil (rótulos de campos e IDs em inglês, conforme o formato do KB) |
| Terms of service | https://sistema.clinicorp.com/termos (atualizados em 28/02/2023), lidos no navegador em 2026-10-22 [doc SRC-015]: nenhuma cláusula explícita sobre engenharia reversa, cópia ou produto concorrente (busca por "engenharia", "revers", "cópia", "concorr", "scrap"). Seção "Propriedade intelectual": plataforma licenciada como SaaS, direitos da Clinicorp; proíbe usar a plataforma para "burlá-la, arruiná-la, sobrecarregá-la"; sem acesso ao código-fonte. Foro: Jaraguá do Sul/SC. O "Termo de Adesão" citado não foi lido (Q-001) |
| Session s02 (2026-10-22) | Conta **administrador**, nível L4 (somente observar). Pedido do usuário: "voce nao vai poder alterar dados, criar paciente teste ou qualquer coisa do tipo, quero que copie tudo, principalmente as funcionalidades, e tambem as funcionalidades que faltaram que nao tem acesso no perfil de dentista comum." |
| Session s02b (2026-10-22) | Testes com o perfil "flavio". Autorização: "pode testar as funcionalidades com esse perfil flavio, eu criei ele para teste mesmo". Como a clínica tem outros usuários ativos (Q-012), o estudo trata como L3: só registros [RE] fictícios, sem telefone/e-mail reais, nada enviado a ninguém, nenhum registro existente alterado, tudo removido no fim da sessão |
