import { expect, test } from '@playwright/test'
import dotenv from 'dotenv'

const env = dotenv.config({ path: 'server/.env', quiet: true }).parsed ?? {}

test('orçamento, contas, fluxo, conciliação, recibo e alerta de retorno', async ({ page }) => {
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
  await page.getByRole('button', { name: /unirradicular/ }).click()
  await page.getByLabel(/^Dente ou região/).fill('11')
  await page
    .getByRole('dialog')
    .getByLabel('Profissional')
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

  // Contas a receber: o orçamento vira uma conta à vista e pode ser recebida.
  await menu.getByRole('link', { name: 'Financeiro' }).click()
  await page.getByRole('tab', { name: 'Contas a Receber' }).click()
  await page
    .getByLabel('Até')
    .fill(
      new Date(Date.now() + 70 * 86_400_000)
        .toISOString()
        .slice(0, 10)
        .split('-')
        .reverse()
        .join('/'),
    )
  await page.getByRole('button', { name: 'Listar' }).click()
  const linha = page
    .getByRole('row', { name: /Orçamento nº \d+/ })
    .filter({ has: page.getByRole('button', { name: 'Receber' }) })
    .first()
  await expect(linha).toBeVisible()
  await linha.getByRole('button', { name: 'Receber' }).click()
  await page.getByRole('button', { name: 'Confirmar' }).click()
  await expect(page.getByText('Recebimento registrado')).toBeVisible()
  await page.screenshot({ path: 'test-results/contas-receber.png', fullPage: true })

  // Conta a pagar exige conta do plano de contas (R-054).
  await page.getByRole('tab', { name: 'Contas a Pagar' }).click()
  await page.getByRole('button', { name: 'Nova conta a pagar' }).click()
  await page.getByLabel('Descrição *').fill('Energia elétrica')
  const valor = page.getByLabel('Valor total *')
  await valor.click()
  await valor.press('End')
  await valor.pressSequentially('32000')
  await page.getByRole('button', { name: 'Registrar' }).click()
  await expect(page.getByText('Escolha a conta do plano de contas.')).toBeVisible()
  await page.getByLabel('Conta do plano de contas *').selectOption('Água, luz, telefone e internet')
  await page.getByRole('button', { name: 'Registrar' }).click()
  await expect(page.getByText('Conta registrada')).toBeVisible()

  // Fluxo, extrato e conciliação.
  await page.getByRole('tab', { name: 'Fluxo de Caixa' }).click()
  await expect(page.getByRole('columnheader', { name: 'Saldo acumulado' })).toBeVisible()
  await page.screenshot({ path: 'test-results/fluxo.png', fullPage: true })
  await page.getByRole('tab', { name: 'Extrato' }).click()
  await expect(page.getByText('Saldo final')).toBeVisible()
  await page.getByRole('tab', { name: 'Conciliações Bancárias' }).click()
  const caixa = page.getByRole('checkbox', { name: /Conferido:/ }).first()
  await caixa.click()
  await expect(caixa).toBeChecked()
  await page.screenshot({ path: 'test-results/conciliacao.png', fullPage: true })

  // Recibo do recebimento.
  await page.getByRole('tab', { name: 'Conta Corrente' }).click()
  await page.locator('details summary').first().click()
  await page.getByRole('link', { name: 'Recibo' }).first().click()
  await expect(page.getByRole('heading', { name: 'Recibo' })).toBeVisible()
  await page.screenshot({ path: 'test-results/recibo.png', fullPage: true })

  // DRE.
  await menu.getByRole('link', { name: 'Relatórios' }).click()
  await page.getByRole('button', { name: 'DRE', exact: true }).click()
  await expect(page.getByRole('cell', { name: '(=) Resultado do período' })).toBeVisible()
  await page.screenshot({ path: 'test-results/dre.png', fullPage: true })

  // Alerta de retorno pela agenda.
  await menu.getByRole('link', { name: 'Agenda', exact: true }).click()
  await page.getByRole('button', { name: 'Novo ▾' }).click()
  await page.getByRole('button', { name: 'Alerta de retorno' }).click()
  const busca = page.getByPlaceholder('Nome ou sobrenome e ENTER')
  await busca.fill('conceição')
  await busca.press('Enter')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^Conceição Fictícia Silva/ })
    .click()
  await page
    .getByLabel('Retornar em')
    .fill(
      new Date(Date.now() + 10 * 86_400_000)
        .toISOString()
        .slice(0, 10)
        .split('-')
        .reverse()
        .join('/'),
    )
  await page.getByLabel('Profissional').selectOption({ label: 'Dra. Fictícia Andrade' })
  await page.getByRole('button', { name: 'Criar alerta' }).click()
  await expect(page.getByText('Alerta de retorno criado')).toBeVisible()
  await expect(
    page.getByRole('complementary').getByRole('link', { name: 'Conceição Fictícia Silva' }),
  ).not.toHaveCount(0)
  await page.screenshot({ path: 'test-results/agenda-retornos.png', fullPage: true })
})
