import { expect, test, type Page } from '@playwright/test'
import dotenv from 'dotenv'

const env = dotenv.config({ path: 'server/.env', quiet: true }).parsed ?? {}

const TODAS = [
  'Visão Geral',
  'Orçamentos',
  'Financeiro',
  'Fotos',
  'Plano e Ficha Clínica',
  'Fichas Especialidades',
  'Odontograma',
  'Anamnese',
  'Documentos',
  'Exames',
  'Recibos',
  'Agendamentos',
  'Indicações',
]

async function abrirFicha(page: Page, login: string) {
  await page.goto('/entrar')
  await page.getByLabel('Usuário').fill(login)
  await page.getByLabel('Senha').fill(env.SEED_SENHA)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.getByRole('navigation').getByRole('link', { name: 'Pacientes' }).click()
  await page.getByRole('link', { name: 'Ana Fictícia Oliveira' }).click()
  await expect(page.getByRole('heading', { name: /Ana Fictícia Oliveira/ })).toBeVisible()
}

test('S-003: a ficha tem as 13 abas; anamnese obrigatória e alerta (PT-58, PT-59, PT-74)', async ({
  page,
}) => {
  await abrirFicha(page, 'admin')
  await expect(page.getByRole('tab')).toHaveText(TODAS)

  await page.getByRole('tab', { name: 'Anamnese' }).click()
  await expect(page).toHaveURL(/aba=anamnese/)
  await page.getByRole('button', { name: 'Nova anamnese' }).click()
  const dialogo = page.getByRole('dialog')
  await dialogo.getByRole('button', { name: 'Salvar' }).click()
  await expect(dialogo.getByRole('alert')).toHaveText(
    'Preencha todas as respostas obrigatórias antes de continuar.',
  )

  await dialogo.getByRole('group', { name: 'Está em tratamento médico?' }).getByLabel('Não').check()
  const alergia = dialogo.getByRole('group', {
    name: 'Tem alergia a algum medicamento ou material?',
  })
  await alergia.getByLabel('Sim').check()
  await alergia.getByPlaceholder('Detalhes').fill('Penicilina')
  await dialogo.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Anamnese salva')).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: 'Penicilina' })).toBeVisible()
})

test('permissões: Recepção vê só as abas da sua função', async ({ page }) => {
  await abrirFicha(page, 'recepcao1')
  await expect(page.getByRole('tab')).toHaveText([
    'Visão Geral',
    'Orçamentos',
    'Fotos',
    'Anamnese',
    'Agendamentos',
    'Indicações',
  ])
})
