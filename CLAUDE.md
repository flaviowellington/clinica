# Sistema da clínica

Sistema de gestão odontológica próprio para **uma única clínica**, para substituir o Clinicorp que ela usa hoje. Não é SaaS: sem multi-clínica, planos ou cobrança de assinatura.

## Especificação

A especificação completa está em `docs/re-clinicorp/`, um estudo do Clinicorp feito por engenharia reversa.
- Comece por `docs/re-clinicorp/COMECE-AQUI.md`: decisões do projeto, escopo e ordem de construção. Ele vale mais que o `BUILD.md`.
- Depois leia `docs/re-clinicorp/BUILD.md`, que indica a ordem de leitura do resto.
- As regras de comportamento estão em `docs/re-clinicorp/rules/`, e os testes de aceitação em `docs/re-clinicorp/clone/parity.md`.
- `docs/` é material de referência: não edite. O código fica fora de `docs/`.

## Regras do projeto

- Interface e mensagens em português do Brasil.
- Não use o nome, a logo, os ícones nem os textos do Clinicorp. Reproduza o comportamento, não a marca nem o código.
- Dados de saúde (LGPD): nunca use dados reais de pacientes em desenvolvimento ou testes; use dados fictícios. Registre quem abriu cada ficha. Prontuário nunca é apagado de verdade.
- Escreva o teste de `parity.md` antes de implementar cada regra.
- Prefira soluções simples: um único aplicativo web e um banco relacional. Sem microsserviços.
- O que a especificação marca como não testado (pagamentos, caixa, mensagens, assinatura digital) deve ser projetado de forma simples; pergunte ao responsável quando houver dúvida de negócio.
