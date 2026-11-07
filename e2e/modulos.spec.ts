import { expect, test } from '@playwright/test'
import dotenv from 'dotenv'

const env = dotenv.config({ path: 'server/.env', quiet: true }).parsed ?? {}

// Cada cargo abre todos os módulos do seu menu sem erro: nada de exceção na página,
// resposta 4xx/5xx da API ou tela de erro.
for (const login of ['admin', 'dentista1', 'recepcao1', 'financeiro', 'gestor']) {
  test(`${login}: todos os módulos do menu abrem sem erro`, async ({ page }) => {
    test.setTimeout(120_000)
    const erros: string[] = []
    page.on('pageerror', (e) => erros.push(`JS: ${e.message}`))
    // O React registra no console o erro que a tela de erro engoliu.
    page.on('console', (m) => {
      if (m.type() === 'error' && !m.text().includes('Failed to load resource'))
        erros.push(`console: ${m.text().slice(0, 300)}`)
    })
    page.on('response', (r) => {
      if (r.url().includes('/api/') && r.status() >= 400)
        erros.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`)
    })

    await page.goto('/entrar')
    await page.getByLabel('Usuário').fill(login)
    await page.getByLabel('Senha').fill(env.SEED_SENHA_ADMIN)
    await page.getByRole('button', { name: 'Entrar' }).click()
    const menu = page.getByRole('navigation', { name: 'Menu principal' })
    await expect(menu).toBeVisible()
    const enderecos = await menu
      .getByRole('link')
      .evaluateAll((as) => as.map((a) => a.getAttribute('href')!))

    const falhas: string[] = []
    const conferir = async (onde: string) => {
      // Sem networkidle: o EventSource de /api/eventos fica sempre aberto.
      await page.waitForTimeout(1500)
      const tela = await page.locator('body').innerText()
      if (/Something went wrong|Página não encontrada|Erro inesperado/i.test(tela))
        erros.push('tela de erro')
      if (erros.length) falhas.push(`${onde}: ${erros.splice(0).join(', ')}`)
    }

    // Uma tela que quebra derruba o menu: recarrega a raiz e segue para a próxima.
    const abrir = async (onde: string, passos: () => Promise<void>) => {
      try {
        await passos()
        await conferir(onde)
      } catch {
        await conferir(onde)
        if (!falhas.some((f) => f.startsWith(onde))) falhas.push(`${onde}: não abriu`)
        await page.goto('/')
      }
    }
    const clicar = (href: string) => menu.locator(`a[href="${href}"]`).click({ timeout: 5000 })

    for (const href of enderecos)
      await abrir(href, async () => {
        await clicar(href)
        await expect(page).toHaveURL(new RegExp(`${href}$`))
      })

    // Telas de detalhe: uma ficha de paciente e um profissional.
    await abrir('ficha do paciente', async () => {
      await clicar('/pacientes')
      await page.getByRole('link', { name: 'Ana Fictícia Oliveira' }).click({ timeout: 5000 })
    })
    await abrir('profissional', async () => {
      await clicar('/profissionais')
      await page
        .getByRole('main')
        .locator('a[href^="/profissionais/"]')
        .first()
        .click({ timeout: 5000 })
    })

    expect(falhas).toEqual([])
  })
}
