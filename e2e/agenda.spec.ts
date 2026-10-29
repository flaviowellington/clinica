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

  // Nova consulta na próxima segunda, no primeiro horário livre da Dra. Fictícia Andrade.
  const segunda = proximaSegunda()
  await page.getByRole('button', { name: 'Adicionar ▾' }).click()
  await page.getByRole('button', { name: 'Nova consulta' }).click()
  const dialogo = page.getByRole('dialog')
  const buscaPaciente = dialogo.getByPlaceholder('Buscar por nome, telefone ou CPF')

  // Paciente que não existe: "+ Novo paciente" abre o cadastro por cima; Esc fecha só ele.
  await buscaPaciente.fill('Zuleica Inexistente')
  await page.getByRole('button', { name: 'Novo paciente: Zuleica Inexistente' }).click()
  await expect(page.getByRole('heading', { name: 'Novo paciente' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: /Nome/ }).first()).toHaveValue(
    'Zuleica Inexistente',
  )
  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: 'Novo paciente' })).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Nova consulta' })).toBeVisible()

  // Acha pelo telefone, ignorando a pontuação.
  await buscaPaciente.fill('90000-1002')
  await dialogo.getByRole('button', { name: /Ana Fictícia Oliveira/ }).click()
  await dialogo.getByRole('button', { name: 'Escolher data' }).click()
  if (segunda.slice(5, 7) !== String(new Date().getMonth() + 1).padStart(2, '0'))
    await dialogo.getByRole('button', { name: 'Próximo mês' }).click()
  await dialogo.getByRole('button', { name: br(segunda), exact: true }).click()
  await dialogo.getByText('Dra. Fictícia Andrade', { exact: true }).click()
  // O seed pode já ter consultas nesse dia: horário livre = botão habilitado só com a hora.
  const livre = dialogo.getByRole('button', { name: /^\d\d:\d\d$/, disabled: false }).first()
  const inicio = (await livre.textContent())!.trim()
  const fim = new Date(Date.parse(`2000-01-01T${inicio}:00Z`) + 15 * 60_000)
    .toISOString()
    .slice(11, 16)
  await livre.click()
  await page.getByRole('button', { name: 'Marcar consulta' }).click()
  await expect(page.getByText('Consulta marcada com sucesso')).toBeVisible()

  // Aparece na grade do dia, com 15 min. Navega pelo minicalendário da lateral.
  if (segunda.slice(5, 7) !== String(new Date().getMonth() + 1).padStart(2, '0'))
    await page.getByRole('button', { name: 'Próximo mês' }).click()
  await page
    .getByRole('button', { name: br(segunda), exact: true })
    .first()
    .click()
  const bloco = page.getByRole('button', { name: `Ana Fictícia Oliveira, ${inicio}–${fim}` })
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
  const doMes = page.waitForResponse((r) => r.url().includes('/api/agenda?'))
  await page.getByRole('button', { name: 'Mês', exact: true }).click()
  await doMes
  await page.screenshot({ path: 'test-results/agenda-mes.png', fullPage: true })
})

test('vários agendamentos: profissionais, categorias e horários diferentes de uma vez', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByLabel('Usuário').fill('recepcao1')
  await page.getByLabel('Senha').fill(env.SEED_SENHA)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.getByRole('navigation').getByRole('link', { name: 'Agenda', exact: true }).click()
  await page.getByRole('button', { name: 'Adicionar ▾' }).click()
  await page.getByRole('button', { name: 'Nova consulta' }).click()
  const dialogo = page.getByRole('dialog')
  await dialogo.getByPlaceholder('Buscar por nome, telefone ou CPF').fill('90000-1002')
  await dialogo.getByRole('button', { name: /Ana Fictícia Oliveira/ }).click()
  await dialogo.getByText('Vários agendamentos').click()

  const segunda = proximaSegunda()
  const livre = () => dialogo.getByRole('button', { name: /^\d\d:\d\d$/, disabled: false }).first()
  const irPara = async () => {
    await dialogo.getByRole('button', { name: 'Escolher data' }).click()
    if (segunda.slice(5, 7) !== String(new Date().getMonth() + 1).padStart(2, '0'))
      await dialogo.getByRole('button', { name: 'Próximo mês' }).click()
    await dialogo.getByRole('button', { name: br(segunda), exact: true }).click()
  }

  // Marcação 1: Dra. Andrade, Avaliação.
  await irPara()
  await dialogo.getByText('Dra. Fictícia Andrade', { exact: true }).click()
  await dialogo.getByText('Avaliação', { exact: true }).click()
  const h1 = (await livre().textContent())!.trim()
  await livre().click()

  // Marcação 2: Dra. Campos, Retorno; o horário da 1 fica ocupado para o paciente.
  await dialogo.getByRole('button', { name: 'Adicionar marcação' }).click()
  await expect(dialogo.getByRole('heading', { name: 'Profissional da marcação 2' })).toBeVisible()
  // A nova marcação já vem com o profissional e a categoria da anterior.
  await expect(dialogo.getByRole('radio', { name: /Dra. Fictícia Andrade/ })).toBeChecked()
  await expect(dialogo.getByRole('radio', { name: 'Avaliação' })).toBeChecked()
  await dialogo.getByText('Dra. Fictícia Campos', { exact: true }).click()
  await dialogo.getByText('Retorno', { exact: true }).click()
  // Categoria nova pela bolinha "+": nome e cor, e já fica escolhida.
  await dialogo.getByRole('button', { name: 'Nova categoria' }).click()
  await dialogo.getByLabel('Nome da nova categoria').fill('Clareamento')
  await dialogo.getByRole('button', { name: 'Cor #3b82f6' }).click()
  await dialogo.getByLabel('Nome da nova categoria').press('Enter')
  await expect(dialogo.getByRole('radio', { name: 'Clareamento' })).toBeChecked()
  await expect(dialogo.getByRole('button', { name: h1, exact: true })).toHaveCount(0)
  await livre().click()
  await page.screenshot({ path: 'test-results/agenda-varios.png' })

  await dialogo.getByRole('button', { name: 'Marcar 2 consultas' }).click()
  await expect(page.getByText('2 consultas marcadas com sucesso')).toBeVisible()
  // A legenda embaixo da agenda já mostra a categoria nova.
  await expect(page.getByText('Categorias:')).toBeVisible()
  await expect(page.getByText('Clareamento', { exact: true })).toBeVisible()
})
