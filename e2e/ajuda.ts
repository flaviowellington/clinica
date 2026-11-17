// Peças comuns dos testes ponta a ponta. Não é teste (o Playwright só roda *.spec.ts).
import { expect, type Locator, type Page } from '@playwright/test'
import dotenv from 'dotenv'

export const env = dotenv.config({ path: 'server/.env', quiet: true }).parsed ?? {}

/** Entra pela tela de login; todos os usuários do seed usam SEED_SENHA_ADMIN. */
export async function entrar(page: Page, login = 'admin') {
  await page.goto('/entrar')
  await page.getByLabel('Usuário').fill(login)
  await page.getByLabel('Senha').fill(env.SEED_SENHA_ADMIN)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('navigation', { name: 'Menu principal' })).toBeVisible()
}

/** Chama a API com o login da página (mesmos cookies). Falha o teste se a resposta não for 2xx. */
export async function api<T = unknown>(
  page: Page,
  metodo: string,
  caminho: string,
  corpo?: unknown,
) {
  const r = await page.request.fetch(`/api${caminho}`, { method: metodo, data: corpo })
  expect(r.ok(), `${metodo} ${caminho} → ${r.status()} ${await r.text()}`).toBe(true)
  return (await r.json()) as T
}

/** Paciente fictício novo, só deste teste: sem odontograma do seed (contagens previsíveis). */
export async function novoPaciente(page: Page, rotulo: string) {
  const nome = `Paciente Fictício E2E ${rotulo} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const p = await api<{ id: number }>(page, 'POST', '/pacientes', {
    nome,
    nascimento: '1990-05-10',
  })
  return { id: p.id, nome }
}

export async function primeiroProfissional(page: Page) {
  const r = await api<{ profissionais: { id: number; nome: string }[] }>(
    page,
    'GET',
    '/agenda/profissionais',
  )
  return r.profissionais[0]
}

export async function procedimentoDaTabela(page: Page, nome: string) {
  const lista = await api<{ id: number; nome: string; porDente: boolean }[]>(
    page,
    'GET',
    `/procedimentos?busca=${encodeURIComponent(nome)}`,
  )
  const p = lista.find((x) => x.nome === nome)
  expect(p, `procedimento "${nome}" no seed`).toBeTruthy()
  return p!
}

/** Escreve no campo de sugestões e sai dele (fecha a lista sem escolher outra opção). */
export async function preencher(campo: Locator, valor: string) {
  await campo.fill(valor)
  await campo.press('Tab')
}

/** Quebra a página em erro de JavaScript; use no começo do teste. */
export function semErroDeTela(page: Page) {
  const erros: string[] = []
  page.on('pageerror', (e) => erros.push(e.message))
  return () => expect(erros, 'erros de JavaScript na página').toEqual([])
}
