// Odontograma → "Adicionar procedimento": por dente × procedimento completo (boca toda),
// a realizar (vira orçamento em aberto, cobra o completo uma vez) e executado (vai ao prontuário).
import { expect, test, type Page } from '@playwright/test'
import { api, entrar, novoPaciente, preencher, semErroDeTela } from './ajuda'

type Clinico = { nome: string; dente: string | null; status: string; porDente: boolean }

test.describe.configure({ timeout: 90_000 })

let conferirTela: () => void
test.beforeEach(async ({ page }) => {
  conferirTela = semErroDeTela(page)
  await entrar(page)
})
test.afterEach(() => conferirTela())

async function abrirOdontograma(page: Page, rotulo: string) {
  const paciente = await novoPaciente(page, rotulo)
  await page.goto(`/pacientes/${paciente.id}?aba=odontograma`)
  await page.getByRole('button', { name: 'Adicionar procedimento', exact: true }).click()
  const d = page.getByRole('dialog').filter({ hasText: 'Profissional *' })
  await expect(d).toBeVisible()
  await d.getByLabel('Profissional *').selectOption({ index: 1 })
  const lista = async () => api<Clinico[]>(page, 'GET', `/pacientes/${paciente.id}/procedimentos`)
  return {
    d,
    lista,
    procedimento: (k: number) => d.getByRole('combobox', { name: `Procedimento ${k}` }),
    dente: (k: number) => d.getByRole('combobox', { name: `Dente ${k}` }),
    bocaToda: d.getByRole('region', { name: 'Dentes do procedimento completo' }),
  }
}

test('a realizar: por dente × boca toda no mesmo orçamento (completo cobra uma vez)', async ({
  page,
}) => {
  const o = await abrirOdontograma(page, 'orcamento misto')
  await expect(o.d.getByLabel('A realizar')).toBeChecked()
  await preencher(o.procedimento(1), 'Limpeza (profilaxia)')
  await o.d.getByRole('button', { name: '+ Outro procedimento' }).click()
  await preencher(o.procedimento(2), 'Selante')
  await expect(
    o.d.getByText('Os por dente vão nos dentes marcados; os completos, na boca toda.'),
  ).toBeVisible()
  await expect(o.d.getByText('Dentes e faces dos procedimentos por dente (opcional)')).toBeVisible()
  await expect(o.bocaToda).toContainText('32 dentes')

  await preencher(o.dente(1), '16')
  await o.d.getByRole('button', { name: '+ Adicionar dente' }).first().click()
  await preencher(o.dente(2), '26')
  // Limpeza R$ 180,00 uma vez + Selante R$ 90,00 × 2 dentes.
  await expect(o.d).toContainText(/2 dentes × R\$\s90,00/)
  await expect(o.d).toContainText(/Total do orçamento\s*R\$\s360,00/)
  await o.d.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText(/Adicionado ao plano \(orçamento nº \d+ em aberto\)/)).toBeVisible()
  await expect(page.getByText(/Procedimento completo · boca toda \(32 dentes\)/)).toBeVisible()
})

test('a realizar só com procedimento fora da tabela: pede um da tabela (sem preço)', async ({
  page,
}) => {
  const o = await abrirOdontograma(page, 'fora da tabela')
  await preencher(o.procedimento(1), 'Procedimento inventado fictício')
  await expect(
    o.d.getByText('Escolha um procedimento da tabela para ver o preço e gerar o orçamento.'),
  ).toBeVisible()
})

test('executado, boca toda: vai direto ao prontuário em todos os dentes', async ({ page }) => {
  const o = await abrirOdontograma(page, 'executado boca toda')
  await preencher(o.procedimento(1), 'Aplicação de flúor')
  await o.d.getByLabel('Executado').check()
  await expect(o.dente(1)).toHaveCount(0) // só completos: não pede dente
  await expect(o.bocaToda).toContainText('dentição permanente')
  await o.d.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Procedimento adicionado ao prontuário')).toBeVisible()
  const fluor = (await o.lista()).filter((i) => i.nome === 'Aplicação de flúor')
  expect(fluor).toHaveLength(32)
  expect(fluor.every((i) => i.status === 'EXECUTADO' && !i.porDente)).toBe(true)
})

test('executado, vários procedimentos por dente no mesmo dente', async ({ page }) => {
  const o = await abrirOdontograma(page, 'executado cluster')
  await preencher(o.procedimento(1), 'Selante')
  await o.d.getByLabel('Executado').check()
  await o.d.getByRole('button', { name: '+ Outro procedimento' }).click()
  await preencher(o.procedimento(2), 'Raspagem e alisamento radicular')
  await expect(o.d.getByText('Cada procedimento vai em todos os dentes marcados.')).toBeVisible()
  await preencher(o.dente(1), '36')
  await o.d.getByRole('button', { name: 'O', exact: true }).click()
  await o.d.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('2 procedimentos adicionados ao prontuário')).toBeVisible()
  const l = await o.lista()
  expect(
    l
      .filter((i) => i.dente === '36')
      .map((i) => i.nome)
      .sort(),
  ).toEqual(['Raspagem e alisamento radicular', 'Selante'])
})

test('existente sem dente: procedimento solto, sem orçamento', async ({ page }) => {
  const o = await abrirOdontograma(page, 'existente')
  await preencher(o.procedimento(1), 'Restauração antiga fictícia')
  await o.d.getByLabel('Existente').check()
  await o.d.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Procedimento adicionado ao prontuário')).toBeVisible()
  expect(await o.lista()).toMatchObject([
    { nome: 'Restauração antiga fictícia', dente: null, status: 'EXISTENTE' },
  ])
})
