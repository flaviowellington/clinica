import { expect, test } from '@playwright/test'
import dotenv from 'dotenv'

const env = dotenv.config({ path: 'server/.env', quiet: true }).parsed ?? {}

/** Próxima segunda-feira (aaaa-mm-dd), longe de domingo e de "hoje". */
/** aaaa-mm-dd → dd/mm/aaaa, como o usuário digita. */
const br = (iso: string) => iso.split('-').reverse().join('/')

function proximaSegunda() {
  const d = new Date()
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test('PT-20, PT-29, PT-31, PT-34 e PT-35: marcar, fazer check-in e excluir', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Usuário').fill('recepcao1')
  await page.getByLabel('Senha').fill(env.SEED_SENHA)
  await page.getByRole('button', { name: 'Entrar' }).click()

  // Abre no Início; a Agenda fica no menu com as outras abas.
  await expect(page.getByRole('heading', { name: /Olá/ })).toBeVisible()
  await page.getByRole('navigation').getByRole('link', { name: 'Agenda', exact: true }).click()
  await expect(page).toHaveURL(/\/agenda$/)
  for (const aba of ['Agenda', 'Pacientes', 'Profissionais'])
    await expect(
      page.getByRole('navigation').getByRole('link', { name: aba, exact: true }),
    ).toBeVisible()
  await page.screenshot({ path: 'test-results/agenda-dia.png', fullPage: true })

  // Nova consulta na próxima segunda, 10:00, com a Dra. Fictícia Andrade.
  const segunda = proximaSegunda()
  await page.getByRole('button', { name: 'Novo ▾' }).click()
  await page.getByRole('button', { name: 'Nova consulta' }).click()
  const busca = page.getByPlaceholder('Nome ou sobrenome e ENTER')
  await busca.fill('oliveira')
  await busca.press('Enter')
  await page.getByRole('dialog').getByRole('button', { name: 'Ana Fictícia Oliveira' }).click()
  await page.getByLabel('Data', { exact: true }).fill(br(segunda))
  await page
    .getByLabel('Profissional', { exact: true })
    .selectOption({ label: 'Dra. Fictícia Andrade' })
  await page.getByRole('button', { name: '10:00', exact: true }).click()
  await page.getByRole('button', { name: 'Marcar consulta' }).click()
  await expect(page.getByText('Consulta marcada com sucesso')).toBeVisible()

  // Aparece na grade do dia, com 15 min.
  await page.getByLabel('Ir para a data').fill(br(segunda))
  const bloco = page.getByRole('button', { name: /Ana Fictícia Oliveira, 10:00–10:15/ })
  await expect(bloco).toBeVisible()

  // Check-in: "Em espera" bloqueia excluir; voltar para "Agendado" libera.
  await bloco.click()
  await page.getByLabel('Status').selectOption('EM_ESPERA')
  await expect(page.getByText('Status atualizado')).toBeVisible()
  await bloco.click()
  await expect(page.getByText(/Chegou às/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Excluir' })).toBeDisabled()
  await page.getByLabel('Status').selectOption('AGENDADO')
  await bloco.click()
  await page.getByRole('button', { name: 'Excluir' }).click()
  await expect(page.getByText(/Isso não pode ser desfeito/)).toBeVisible()
  await page.getByRole('button', { name: 'Excluir' }).click()
  await expect(page.getByText('Agendamento excluído')).toBeVisible()
  await expect(bloco).toHaveCount(0)

  // Visões Semana e Mês.
  await page.getByRole('button', { name: 'Semana', exact: true }).click()
  await expect(page.getByText('Carregando…')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/agenda-semana.png', fullPage: true })
  await page.getByRole('button', { name: 'Mês', exact: true }).click()
  await page.screenshot({ path: 'test-results/agenda-mes.png', fullPage: true })
})
