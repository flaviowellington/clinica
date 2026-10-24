import { expect, test } from '@playwright/test'
import dotenv from 'dotenv'

const env = dotenv.config({ path: 'server/.env', quiet: true }).parsed ?? {}

test('PT-01 e PT-04: cadastrar paciente e achar pela busca', async ({ page }) => {
  await page.goto('/pacientes')
  await expect(page).toHaveURL(/\/entrar/)
  await page.getByLabel('Usuário').fill('admin')
  await page.getByLabel('Senha').fill(env.SEED_SENHA)
  await page.getByRole('button', { name: 'Entrar' }).click()

  await page.getByRole('navigation').getByRole('link', { name: 'Pacientes' }).click()
  await page.getByRole('button', { name: 'Novo paciente' }).click()
  const cadastrar = page.getByRole('button', { name: 'Cadastrar paciente' })
  await expect(cadastrar).toBeDisabled()
  await page.getByLabel('Nome *').fill('Paciente Ponta a Ponta')
  await expect(cadastrar).toBeDisabled()
  await page.getByLabel('Data de nascimento *').fill('01/01/1990')
  await expect(cadastrar).toBeEnabled()
  await cadastrar.click()

  await expect(page.getByText('Paciente cadastrado com sucesso')).toBeVisible()
  await expect(page).toHaveURL(/\/pacientes\/\d+$/)
  await expect(page.getByRole('heading', { name: /Paciente Ponta a Ponta/ })).toBeVisible()

  await page.getByRole('navigation').getByRole('link', { name: 'Pacientes' }).click()
  const busca = page.getByPlaceholder('Nome do paciente')
  await busca.fill('%ponta')
  await busca.press('Enter')
  await expect(page.getByRole('link', { name: 'Paciente Ponta a Ponta' })).toBeVisible()
  await expect(page.getByText('1 registro')).toBeVisible()
})
