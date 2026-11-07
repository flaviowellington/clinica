import { expect, test } from '@playwright/test'
import dotenv from 'dotenv'

const env = dotenv.config({ path: 'server/.env', quiet: true }).parsed ?? {}

test('Início, Profissionais, Financeiro, e Relatórios', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Usuário').fill('admin')
  await page.getByLabel('Senha').fill(env.SEED_SENHA_ADMIN)
  await page.getByRole('button', { name: 'Entrar' }).click()

  // Início com os cartões.
  await expect(page.getByRole('heading', { name: /Olá/ })).toBeVisible()
  const main = page.getByRole('main')
  for (const c of ['Agenda', 'Pacientes', 'Financeiro', 'Profissionais', 'Relatórios'])
    await expect(main.getByRole('link', { name: new RegExp(`^${c}(?! \\d)`) })).toBeVisible()
  await page.screenshot({ path: 'test-results/inicio.png', fullPage: true })

  // Profissionais: cadastrar um novo.
  await main.getByRole('link', { name: /^Profissionais/ }).click()
  await expect(page.getByText('Dra. Fictícia Andrade')).toBeVisible()
  await page.getByRole('button', { name: 'Adicionar profissional' }).click()
  await page.getByLabel('Nome *').fill('Dr. Ponta a Ponta')
  await page.getByLabel('Especialidade').fill('Perio')
  await page.getByRole('button', { name: 'Periodontia' }).click()
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Profissional salvo')).toBeVisible()
  await expect(page.getByText('Dr. Ponta a Ponta')).toBeVisible()
  await page.screenshot({ path: 'test-results/profissionais.png', fullPage: true })

  // Procedimento novo exige o custo; valor digitado da direita para a esquerda (R-055).
  await page.getByRole('navigation').getByRole('link', { name: 'Configurações' }).click()
  await page.getByRole('tab', { name: 'Procedimentos e preços' }).click()
  await page.getByRole('button', { name: 'Novo procedimento' }).click()
  await page.getByLabel('Nome *').fill('Faceta de teste')
  const custo = page.getByLabel('Custo *')
  await custo.click()
  await custo.press('End')
  await custo.pressSequentially('15000')
  await expect(custo).toHaveValue(/150,00/)
  const valor = page.getByLabel('Valor final *')
  await valor.click()
  await valor.press('End')
  await valor.pressSequentially('60000')
  await expect(page.getByText(/Lucro: R\$\s450,00 \(75%\)/)).toBeVisible()
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Procedimento salvo')).toBeVisible()

  // Financeiro: Controle Financeiro com faturamento, entrada e lucro; e os gráficos editáveis.
  await page.getByRole('navigation').getByRole('link', { name: 'Financeiro' }).click()
  await page.getByRole('tab', { name: 'Controle Financeiro' }).click()
  await expect(page.getByRole('heading', { name: 'Controle Financeiro' })).toBeVisible()
  await expect(page.getByText('Faturamento', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Lucro', { exact: true }).first()).toBeVisible()
  await page.screenshot({ path: 'test-results/controle-financeiro.png', fullPage: true })
  await page.getByRole('tab', { name: 'Gráficos' }).click()
  await page.getByRole('button', { name: 'Restaurar padrão' }).click()
  // Restaurar só vale depois de digitar a palavra.
  const restaurar = page.getByRole('dialog').getByRole('button', { name: 'Restaurar padrão' })
  await expect(restaurar).toBeDisabled()
  await page.getByLabel('Para confirmar, digite restaurar').fill('restaurar')
  await restaurar.click()
  const primeiro = page.locator('section.viz').first()
  await primeiro.getByRole('button', { name: 'Pizza' }).click()
  await expect(primeiro.getByRole('button', { name: 'Pizza' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  // Em fatias só cabe uma métrica: o título passa a ter uma só.
  await expect(primeiro.getByRole('heading', { name: 'Faturamento por dia' })).toBeVisible()
  await page.screenshot({ path: 'test-results/graficos.png', fullPage: true })

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
})
