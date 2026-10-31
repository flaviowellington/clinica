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

test('odontograma: faces marcadas vão preenchidas ao procedimento; dentição mista guarda o progresso', async ({
  page,
}) => {
  await abrirFicha(page, 'admin')
  await page.getByRole('button', { name: 'Odontograma', exact: true }).click()

  // Marca várias partes de dentes; o formulário só abre no botão, já preenchido.
  await page.getByRole('button', { name: 'Dente 11, Vestibular' }).first().click()
  await page.getByRole('button', { name: 'Dente 11, Distal' }).first().click()
  await page.getByRole('button', { name: 'Dente 21, Incisal' }).first().click()
  const dialogo = page.getByRole('dialog')
  await expect(dialogo).toHaveCount(0)
  await page.getByRole('button', { name: 'Adicionar procedimento' }).click()
  await expect(dialogo.getByLabel('Dente 1', { exact: true })).toHaveValue('11')
  await expect(dialogo.getByLabel('Dente 2', { exact: true })).toHaveValue('21')
  await expect(dialogo.getByRole('button', { name: 'V', exact: true }).first()).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(dialogo.getByRole('button', { name: 'D', exact: true }).first()).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(dialogo.getByRole('button', { name: 'I', exact: true }).last()).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await dialogo
    .getByPlaceholder('Busque na tabela ou escreva')
    .fill('Restauração em resina (1 face)')
  await dialogo.getByPlaceholder('Busque na tabela ou escreva').press('Tab')
  // "A realizar" mostra o preço da tabela e o total, e vira orçamento em aberto.
  await dialogo.getByLabel('A realizar').check()
  await expect(dialogo.getByLabel('Valor por dente')).toHaveValue(/250,00/)
  await expect(dialogo).toContainText('Total: R$ 500,00')
  await dialogo.getByLabel('Profissional *').selectOption({ index: 1 })
  await dialogo.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText(/Orçamento nº \d+ criado em Orçamentos/)).toBeVisible()
  // Janela larga: a lista fica ao lado do odontograma; os dois dentes num cartão só.
  const grupo = page.getByRole('listitem').filter({ hasText: '11VD' })
  await expect(grupo).toHaveCount(1)
  await expect(grupo.getByText('21I', { exact: true })).toBeVisible()
  await expect(grupo.getByText(/\(em aberto\) · R\$\s500,00/)).toBeVisible()

  // Número do dente marca o dente inteiro; a lista mostra o lançamento todo do 21.
  await page.getByTitle('Marcar o dente inteiro').filter({ hasText: /^21$/ }).click()
  await expect(page.getByRole('listitem').filter({ hasText: '11VD' })).toHaveCount(1)
  await page.getByTitle('Marcar o dente inteiro').filter({ hasText: /^21$/ }).click()

  // Executado vai direto ao prontuário, sem orçamento; as ações ficam no menu ⋯.
  await page.getByRole('button', { name: 'Dente 12, Vestibular' }).first().click()
  await page.getByRole('button', { name: 'Adicionar procedimento' }).click()
  await dialogo.getByPlaceholder('Busque na tabela ou escreva').fill('Restauração de teste')
  await dialogo.getByPlaceholder('Busque na tabela ou escreva').press('Tab')
  await dialogo.getByLabel('Profissional *').selectOption({ index: 1 })
  await dialogo.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('12V', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Ações de Restauração de teste' }).first().click()
  await expect(page.getByRole('menuitem', { name: 'Excluir' })).toBeVisible()
  await page.getByRole('menuitem', { name: 'Editar' }).click()
  await expect(page.getByRole('menuitem')).toHaveCount(0)
  const edicao = page.getByRole('dialog')
  await expect(edicao).toContainText('Editar procedimento')
  await edicao.getByRole('button', { name: 'Cancelar' }).click()

  // A situação muda direto pelo menu, cada uma na sua cor.
  const linha12 = page.getByRole('listitem').filter({ hasText: '12V' })
  await linha12.getByRole('button', { name: /^Ações de/ }).click()
  await expect(page.getByRole('menuitemradio', { name: 'Executado' })).toBeDisabled()
  await page.getByRole('menuitemradio', { name: 'Existente' }).click()
  await expect(linha12).toContainText('Existente')

  // Orçamento em aberto também executa, sem precisar aprovar antes.
  const linha11 = page.getByRole('listitem').filter({ hasText: '11VD' })
  await linha11.getByRole('button', { name: /^Ações de/ }).click()
  await page.getByRole('menuitemradio', { name: 'Executado' }).click()
  await expect(linha11).toContainText('Executado')
  // Em aberto também dá para tirar um dente do orçamento pelo Editar.
  await linha11.getByRole('button', { name: /^Ações de/ }).click()
  await page.getByRole('menuitem', { name: 'Editar' }).click()
  await dialogo.getByRole('button', { name: 'Tirar o dente 21' }).click()
  await dialogo.getByRole('button', { name: 'Salvar' }).click()
  await expect(linha11.getByText('21I', { exact: true })).toHaveCount(0)
  await expect(linha11.getByText(/\(em aberto\) · R\$\s250,00/)).toBeVisible()

  // Editar o grupo: remove um dente; depois exclui o que sobrou.
  for (const d of [/^13$/, /^23$/])
    await page.getByTitle('Marcar o dente inteiro').filter({ hasText: d }).click()
  await page.getByRole('button', { name: 'Adicionar procedimento' }).click()
  await dialogo.getByPlaceholder('Busque na tabela ou escreva').fill('Clareamento de teste')
  await dialogo.getByPlaceholder('Busque na tabela ou escreva').press('Tab')
  await dialogo.getByLabel('Profissional *').selectOption({ index: 1 })
  await dialogo.getByRole('button', { name: 'Salvar' }).click()
  const clareamento = page.getByRole('listitem').filter({ hasText: 'Clareamento de teste' })
  await expect(clareamento).toHaveCount(1)
  await clareamento.getByRole('button', { name: /^Ações de/ }).click()
  await page.getByRole('menuitem', { name: 'Editar' }).click()
  // Tirar risca o dente; Desfazer traz de volta; salvar tira de vez.
  await dialogo.getByRole('button', { name: 'Tirar o dente 23' }).click()
  await expect(dialogo).toContainText('Sai ao salvar')
  await dialogo.getByRole('button', { name: 'Desfazer' }).click()
  await dialogo.getByRole('button', { name: 'Tirar o dente 23' }).click()
  await dialogo.getByRole('button', { name: 'Salvar' }).click()
  await expect(clareamento.getByText('13', { exact: true })).toBeVisible()
  await expect(clareamento.getByText('23', { exact: true })).toHaveCount(0)
  await clareamento.getByRole('button', { name: /^Ações de/ }).click()
  await page.getByRole('menuitem', { name: 'Editar' }).click()
  await dialogo.getByRole('button', { name: 'Excluir', exact: true }).click()
  await page
    .getByRole('dialog')
    .filter({ hasText: 'Tem certeza?' })
    .getByRole('button', { name: 'Excluir' })
    .click()
  await expect(clareamento).toHaveCount(0)

  // Decídua: o 11 sai, o 51 entra; a mista traz o 11 de volta com o que já tinha.
  await page.getByLabel('Tipo de dentição').selectOption('DECIDUA')
  await expect(page.getByRole('button', { name: '11', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '51', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Dentição mista' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Dente 11' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Aplicar' }).click()
  await expect(page.getByRole('button', { name: '11', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '51', exact: true })).toHaveCount(0)

  // Trocar o tipo desfaz a mista, mas não apaga o procedimento.
  await page.getByLabel('Tipo de dentição').selectOption('PERMANENTE')
  await page.getByLabel('Tipo de dentição').selectOption('DECIDUA')
  await expect(page.getByRole('button', { name: '11', exact: true })).toHaveCount(0)
  await expect(page.getByText('11VD', { exact: true })).toBeVisible()

  // A última mista fica guardada e volta pelo seletor.
  const tipo = page.getByLabel('Tipo de dentição')
  await tipo.selectOption('ANTERIOR')
  await expect(page.getByRole('button', { name: '11', exact: true })).toBeVisible()

  // Criar outra mista em outro tipo avisa que a anterior será apagada.
  await tipo.selectOption('PERMANENTE')
  await page.getByRole('button', { name: 'Dentição mista' }).click()
  const mista = page.getByRole('dialog')
  await expect(mista.getByRole('alert')).toContainText('será apagada')
  await mista.getByRole('button', { name: 'Dente 55' }).click()
  await mista.getByRole('button', { name: 'Aplicar' }).click()
  await tipo.selectOption('DECIDUA')
  await tipo.selectOption('ANTERIOR')
  await expect(tipo).toHaveValue('PERMANENTE')
  await expect(page.getByRole('button', { name: '55', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '15', exact: true })).toHaveCount(0)
})
