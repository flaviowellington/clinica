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
  // Máscaras: digita corrido e os separadores aparecem.
  await page.getByLabel('CPF', { exact: true }).pressSequentially('52998224725')
  await expect(page.getByLabel('CPF', { exact: true })).toHaveValue('529.982.247-25')
  await page.getByLabel('RG').pressSequentially('12345678')
  await expect(page.getByLabel('RG')).toHaveValue('12.345.678')
  const celular = page.getByLabel('Celular / WhatsApp')
  await celular.press('End')
  await celular.pressSequentially('119876543219')
  await expect(celular).toHaveValue('+55 (11) 98765-4321')
  await cadastrar.click()

  await expect(page.getByText('Paciente cadastrado com sucesso')).toBeVisible()
  await expect(page).toHaveURL(/\/pacientes\/\d+$/)
  await expect(page.getByRole('heading', { name: /Paciente Ponta a Ponta/ })).toBeVisible()

  await page.getByRole('navigation').getByRole('link', { name: 'Pacientes' }).click()
  const busca = page.getByPlaceholder('Nome do paciente')
  await busca.fill('%ponta') // sem ENTER: a lista atualiza enquanto digita
  await expect(page.getByRole('link', { name: 'Paciente Ponta a Ponta' })).toBeVisible()
  await expect(page.getByText('1 registro')).toBeVisible()
})
