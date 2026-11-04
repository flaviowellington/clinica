import { expect, test } from '@playwright/test'
import dotenv from 'dotenv'

const env = dotenv.config({ path: 'server/.env', quiet: true }).parsed ?? {}

test('orçamento, recebimento, extrato, DRE e alerta de retorno', async ({ page }) => {
  page.on('dialog', (d) => d.accept()) // confirmações do navegador ("Aprovar este orçamento?")
  await page.goto('/')
  await page.getByLabel('Usuário').fill('admin')
  await page.getByLabel('Senha').fill(env.SEED_SENHA)
  await page.getByRole('button', { name: 'Entrar' }).click()
  const menu = page.getByRole('navigation')

  // Orçamento na ficha: adicionar procedimento, aprovar (R-010, R-012, R-018).
  await menu.getByRole('link', { name: 'Pacientes' }).click()
  const buscaPac = page.getByPlaceholder('Nome do paciente')
  await buscaPac.fill('joão fictício silva')
  await buscaPac.press('Enter')
  await page.getByRole('link', { name: 'João Fictício Silva', exact: true }).click()
  await page.getByRole('button', { name: 'Orçamentos', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Orçamentos e tratamentos' })).toBeVisible()
  await page.getByRole('button', { name: 'Novo orçamento' }).click()
  await expect(page.getByRole('button', { name: 'Aprovar' })).toHaveCount(0)
  await page.getByLabel('Buscar procedimento').fill('CANAL')
  await page.getByRole('checkbox', { name: /unirradicular/ }).check()
  await expect(page.getByText(/1 selecionado · Total:/)).toBeVisible()
  await page.getByRole('button', { name: 'Adicionar ao orçamento' }).click()
  await page.getByLabel(/^Dente ou região/).fill('11')
  await page
    .getByRole('dialog')
    .getByRole('combobox', { name: 'Profissional' })
    .selectOption({ label: 'Dr. Fictício Barros' })
  // Sem forma/parcelas na criação; desconto em % mostra o valor em reais.
  await expect(page.getByLabel('Forma de pagamento')).toHaveCount(0)
  await page.getByRole('button', { name: 'Porcentagem (%)' }).click()
  await page.getByLabel('Desconto (%)').fill('10')
  await expect(page.getByText(/= R\$\s[\d.,]+ de desconto/)).toBeVisible()
  await page.screenshot({ path: 'test-results/orcamento-editor.png', fullPage: true })
  await page.getByRole('button', { name: 'Aprovar' }).click()
  await page
    .getByRole('dialog')
    .filter({ hasText: 'Aprovar este orçamento?' })
    .getByRole('button', { name: 'Aprovar' })
    .click()
  await expect(page.getByText('Orçamento aprovado')).toBeVisible()
  await expect(
    page.getByRole('cell', { name: 'Tratamento de canal (unirradicular) (11)' }),
  ).toBeVisible()
  await page.screenshot({ path: 'test-results/ficha-orcamentos.png', fullPage: true })

  // Financeiro: abre em Orçamentos abertos; aprovar já registra o pagamento.
  await menu.getByRole('link', { name: 'Financeiro' }).click()
  await expect(page.getByRole('heading', { name: 'Orçamentos abertos' })).toBeVisible()
  await page.getByRole('button', { name: 'Confirmar pagamento e aprovar' }).click()
  await expect(page.getByText('Orçamento aprovado e pagamento registrado')).toBeVisible()
  // O aprovado na ficha aparece no Controle Financeiro do mês atual (padrão).
  await page.getByRole('tab', { name: 'Controle Financeiro' }).click()
  await expect(page.getByRole('link', { name: 'João Fictício Silva' }).first()).toBeVisible()
  // O calendário abre no botão do período. Trocar o mês do calendário não muda o intervalo;
  // "Ver todo o período" liga e fecha a janela.
  const botaoPeriodo = page.getByRole('button', { name: / – |Todo o período/ })
  await botaoPeriodo.click()
  await page.getByRole('button', { name: 'Próximo mês' }).click()
  await expect(page.getByRole('link', { name: 'João Fictício Silva' }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Ver todo o período' }).click()
  await expect(botaoPeriodo).toHaveText('Todo o período')
  await expect(page.getByRole('link', { name: 'João Fictício Silva' }).first()).toBeVisible()

  // DRE.
  await menu.getByRole('link', { name: 'Relatórios' }).click()
  await page.getByRole('button', { name: 'DRE', exact: true }).click()
  await expect(page.getByRole('cell', { name: '(=) Resultado do período' })).toBeVisible()
  await page.screenshot({ path: 'test-results/dre.png', fullPage: true })

  // Alerta de retorno pela agenda.
  await menu.getByRole('link', { name: 'Agenda', exact: true }).click()
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click()
  await page.getByRole('button', { name: 'Alerta de retorno' }).click()
  const alerta = page.getByRole('dialog')
  const busca = alerta.getByPlaceholder('Buscar por nome, telefone ou CPF')
  await busca.fill('conceição')
  await busca.press('Enter')
  await alerta
    .getByRole('button', { name: /Conceição Fictícia Silva/ })
    .first()
    .click()
  await alerta
    .getByLabel('Retornar em')
    .fill(
      new Date(Date.now() + 10 * 86_400_000)
        .toISOString()
        .slice(0, 10)
        .split('-')
        .reverse()
        .join('/'),
    )
  await alerta.getByLabel('Profissional').selectOption({ label: 'Dra. Fictícia Andrade' })
  await alerta.getByRole('button', { name: 'Criar alerta' }).click()
  await expect(page.getByText('Alerta de retorno criado')).toBeVisible()
  await expect(
    page.getByRole('complementary').getByRole('button', { name: /Conceição Fictícia Silva/ }),
  ).not.toHaveCount(0)
  await page.screenshot({ path: 'test-results/agenda-retornos.png', fullPage: true })
})
