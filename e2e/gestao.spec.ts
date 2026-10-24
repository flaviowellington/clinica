import { expect, test } from '@playwright/test'
import dotenv from 'dotenv'

const env = dotenv.config({ path: 'server/.env', quiet: true }).parsed ?? {}

test('Início, Profissionais, Financeiro, Relatórios e Conta digital', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Usuário').fill('admin')
  await page.getByLabel('Senha').fill(env.SEED_SENHA)
  await page.getByRole('button', { name: 'Entrar' }).click()

  // Início com os 6 cartões.
  await expect(page.getByRole('heading', { name: /Olá/ })).toBeVisible()
  const main = page.getByRole('main')
  for (const c of [
    'Agenda',
    'Pacientes',
    'Financeiro',
    'Profissionais',
    'Relatórios',
    'Conta digital',
  ])
    await expect(main.getByRole('link', { name: new RegExp(`^${c}`) })).toBeVisible()
  await page.screenshot({ path: 'test-results/inicio.png', fullPage: true })

  // Profissionais: cadastrar um novo.
  await main.getByRole('link', { name: /^Profissionais/ }).click()
  await expect(page.getByText('Dra. Fictícia Andrade')).toBeVisible()
  await page.getByRole('button', { name: 'Adicionar profissional' }).click()
  await page.getByLabel('Nome *').fill('Dr. Ponta a Ponta')
  await page.getByLabel('Especialidade').fill('Periodontia')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Profissional salvo')).toBeVisible()
  await expect(page.getByText('Dr. Ponta a Ponta')).toBeVisible()
  await page.screenshot({ path: 'test-results/profissionais.png', fullPage: true })

  // Financeiro > Conta Corrente: lançar R$ 150,00 digitando da direita para a esquerda (R-055).
  await page.getByRole('navigation').getByRole('link', { name: 'Financeiro' }).click()
  await page.screenshot({ path: 'test-results/financeiro-geral.png', fullPage: true })
  await page.getByRole('tab', { name: 'Conta Corrente' }).click()
  await page.getByRole('button', { name: 'Novo lançamento' }).click()
  const valor = page.getByLabel('Valor *')
  await valor.click()
  await valor.press('End')
  await valor.pressSequentially('15000')
  await expect(valor).toHaveValue(/150,00/)
  await page.getByLabel('Descrição *').fill('Recebimento de teste')
  await page.getByRole('button', { name: 'Registrar' }).click()
  await expect(page.getByText('Lançamento registrado')).toBeVisible()
  await expect(page.getByText(/lançamentos no período/)).toBeVisible()
  await page.screenshot({ path: 'test-results/conta-corrente.png', fullPage: true })

  // Relatórios: agenda geral.
  await page.getByRole('navigation').getByRole('link', { name: 'Relatórios' }).click()
  await page.getByRole('button', { name: 'Faixa etária' }).click()
  await expect(page.getByRole('columnheader', { name: 'Faixa etária' })).toBeVisible()
  // O menu rola sozinho; trocar de relatório não sobe a página nem volta o menu ao topo.
  const menuRel = page.getByRole('navigation', { name: 'Relatórios' })
  await menuRel.evaluate((el) => (el.scrollTop = el.scrollHeight))
  const rolagem = await menuRel.evaluate((el) => el.scrollTop)
  expect(rolagem).toBeGreaterThan(0)
  await menuRel.getByRole('button', { name: 'Procedimentos mais orçados' }).click()
  await expect(page.getByRole('heading', { name: 'Procedimentos mais orçados' })).toBeVisible()
  expect(await menuRel.evaluate((el) => el.scrollTop)).toBe(rolagem)
  expect(await page.evaluate(() => scrollY)).toBe(0)
  await page.screenshot({ path: 'test-results/relatorios.png' })

  // Conta digital: pedido de conta PJ.
  await page.getByRole('navigation').getByRole('link', { name: 'Conta digital' }).click()
  await page.getByRole('button', { name: /^Abrir conta/ }).click()
  await page.getByRole('button', { name: 'Próximo' }).click()
  await page.getByLabel('Razão social').fill('Clínica Fictícia Ltda')
  await page.getByLabel('CNPJ').fill('11.222.333/0001-81')
  await page.getByLabel('E-mail').fill('clinica@example.com')
  await page.getByLabel('Celular').fill('(11) 90000-0000')
  await page.getByRole('button', { name: 'Próximo' }).click()
  await page.getByRole('button', { name: 'Enviar pedido' }).click()
  await expect(page.getByText('Pedido de conta registrado')).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Aguardando parceiro de pagamentos' })).toBeVisible()
  await page.screenshot({ path: 'test-results/contas.png', fullPage: true })
})
