// Sala de espera ao vivo: duas recepções e dois dentistas logados ao mesmo tempo, cada um no seu
// navegador. A recepção faz o check-in, a fila aparece sozinha para o dentista certo, na ordem de
// chegada; os dois chamam juntos, as duas recepções recebem os avisos e confirmam que chamaram.
import { expect, test, type Browser, type Page } from '@playwright/test'
import { api, entrar, novoPaciente, semErroDeTela } from './ajuda'

const hoje = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Abre um navegador próprio com esse login e espera a conexão de avisos (/api/eventos) abrir. */
async function abrir(browser: Browser, login: string, pagina = '/') {
  const page = await (await browser.newContext()).newPage()
  const conferir = semErroDeTela(page)
  const eventos = page.waitForResponse((r) => r.url().endsWith('/api/eventos'))
  await entrar(page, login)
  await page.goto(pagina)
  await eventos
  return Object.assign(page, { conferir })
}

/** A sala de espera do dentista, só com os pacientes deste teste (o seed também põe gente). */
const sala = (page: Page) => page.locator('details', { hasText: 'Sua sala de espera' })
const naFila = (page: Page, nomes: string[]) =>
  sala(page)
    .getByRole('listitem')
    .filter({
      hasText: new RegExp(nomes.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')),
    })

test('fila de espera simultânea: recepção faz check-in, dentistas chamam, recepção é avisada', async ({
  browser,
}) => {
  // Vários navegadores ao mesmo tempo: com os workers em paralelo passava dos 30 s.
  test.slow()
  const [recepcao1, recepcao2, dra1, dra2] = await Promise.all([
    abrir(browser, 'recepcao1'),
    abrir(browser, 'recepcao2'),
    abrir(browser, 'dentista1', '/agenda'),
    abrir(browser, 'dentista2', '/agenda'),
  ])
  const prof = async (p: Page) => {
    const { profissionais, meuId } = await api<{
      profissionais: { id: number; nome: string }[]
      meuId: number
    }>(p, 'GET', '/agenda/profissionais')
    return profissionais.find((x) => x.id === meuId)!
  }
  const [p1, p2] = await Promise.all([prof(dra1), prof(dra2)])

  // Três consultas de hoje: duas com a dentista1, uma com a dentista2.
  const [ana, bia, caio] = await Promise.all(
    ['Ana', 'Bia', 'Caio'].map((r) => novoPaciente(recepcao1, r)),
  )
  const marcar = (pacienteId: number, profissionalId: number, inicio: string) =>
    api<{ id: number }>(recepcao1, 'POST', '/agenda', {
      tipo: 'CONSULTA',
      data: hoje(),
      inicio,
      profissionalId,
      pacienteId,
    })
  const [cAna, cBia, cCaio] = await Promise.all([
    marcar(ana.id, p1.id, '08:00'),
    marcar(bia.id, p1.id, '08:30'),
    marcar(caio.id, p2.id, '08:00'),
  ])
  const status = (pagina: Page, id: number, s: string) =>
    api(pagina, 'PATCH', `/agenda/${id}/status`, { status: s })

  await test.step('check-in: a fila aparece sozinha, para o dentista certo, por ordem de chegada', async () => {
    // Bia chega antes da Ana, mesmo com a consulta depois; Caio chega pela outra recepção.
    await status(recepcao1, cBia.id, 'EM_ESPERA')
    await status(recepcao2, cAna.id, 'EM_ESPERA')
    await status(recepcao2, cCaio.id, 'EM_ESPERA')

    const fila1 = naFila(dra1, [ana.nome, bia.nome, caio.nome])
    await expect(fila1).toHaveCount(2)
    await expect(fila1.nth(0)).toContainText(bia.nome)
    await expect(fila1.nth(1)).toContainText(ana.nome)

    const fila2 = naFila(dra2, [ana.nome, bia.nome, caio.nome])
    await expect(fila2).toHaveCount(1)
    await expect(fila2).toContainText(caio.nome)
  })

  await test.step('os dois dentistas chamam juntos; as duas recepções recebem os dois avisos', async () => {
    await Promise.all([
      naFila(dra1, [bia.nome]).getByRole('button', { name: 'Chamar', exact: true }).click(),
      naFila(dra2, [caio.nome]).getByRole('button', { name: 'Chamar', exact: true }).click(),
    ])
    for (const r of [recepcao1, recepcao2]) {
      await expect(r.getByText(`${p1.nome} chamou ${bia.nome}`)).toBeVisible()
      await expect(r.getByText(`${p2.nome} chamou ${caio.nome}`)).toBeVisible()
    }
    // Dentista não recebe o aviso de chamado (é só da recepção).
    await expect(dra1.getByText(`chamou ${caio.nome}`)).toHaveCount(0)
  })

  await test.step('chamado fica aguardando a recepção; confirmado, sai da fila', async () => {
    await expect(naFila(dra1, [bia.nome])).toContainText('Aguardando recepção')
    const aviso = (r: Page, texto: string) =>
      r.getByRole('alert').locator('.cartao', { hasText: texto })
    await aviso(recepcao2, bia.nome).getByRole('button', { name: 'Confirmar que chamei' }).click()
    await aviso(recepcao1, caio.nome).getByRole('button', { name: 'Confirmar que chamei' }).click()
    // Confirmado numa recepção, some da outra também.
    for (const r of [recepcao1, recepcao2]) await expect(r.getByRole('alert')).toHaveCount(0)
    await expect(naFila(dra1, [bia.nome])).toHaveCount(0)
    await expect(naFila(dra1, [ana.nome])).toHaveCount(1)
    await expect(naFila(dra2, [caio.nome])).toHaveCount(0)
  })

  await test.step('o dentista finaliza, chama o próximo e ele mesmo confirma', async () => {
    await status(dra1, cBia.id, 'ATENDIDO')
    await naFila(dra1, [ana.nome]).getByRole('button', { name: 'Chamar', exact: true }).click()
    await expect(recepcao1.getByText(`${p1.nome} chamou ${ana.nome}`)).toBeVisible()
    // Desta vez a própria dentista vai buscar e confirma; o aviso some da recepção.
    await naFila(dra1, [ana.nome]).getByRole('button', { name: 'Eu chamei' }).click()
    await expect(naFila(dra1, [ana.nome, bia.nome])).toHaveCount(0)
    await expect(recepcao1.getByRole('alert')).toHaveCount(0)
  })

  await test.step('chegou no dia errado: consultas de outros dias entram na fila, todas', async () => {
    // Dois pacientes com consulta em outro dia (não domingo) chegam hoje, junto com um de hoje.
    const outroDia = (n: number) => {
      const d = new Date()
      d.setDate(d.getDate() + n)
      if (d.getDay() === 0) d.setDate(d.getDate() + 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    const [eva, fabio, gil] = await Promise.all(
      ['Eva', 'Fabio', 'Gil'].map((r) => novoPaciente(recepcao1, r)),
    )
    const consulta = (pacienteId: number, data: string) =>
      api<{ id: number }>(recepcao1, 'POST', '/agenda', {
        tipo: 'CONSULTA',
        data,
        inicio: '10:00',
        profissionalId: p1.id,
        pacienteId,
      })
    const cs = await Promise.all([
      consulta(eva.id, outroDia(1)),
      consulta(fabio.id, outroDia(8)),
      consulta(gil.id, hoje()),
    ])
    // Check-ins ao mesmo tempo, pelas duas recepções.
    await Promise.all(cs.map((c, i) => status([recepcao1, recepcao2][i % 2], c.id, 'EM_ESPERA')))
    await expect(naFila(dra1, [eva.nome, fabio.nome, gil.nome])).toHaveCount(3)
    await expect(naFila(dra2, [eva.nome, fabio.nome, gil.nome])).toHaveCount(0)
    // Um chama pela recepção, outro vai buscar: o que sobra fica.
    await naFila(dra1, [eva.nome]).getByRole('button', { name: 'Chamar', exact: true }).click()
    await naFila(dra1, [fabio.nome]).getByRole('button', { name: 'Eu vou chamar' }).click()
    await expect(recepcao2.getByText(`${p1.nome} chamou ${eva.nome}`)).toBeVisible()
    await expect(recepcao2.getByText(`chamou ${fabio.nome}`)).toHaveCount(0)
    await recepcao2.getByRole('button', { name: 'Confirmar que chamei' }).click()
    await expect(naFila(dra1, [eva.nome, fabio.nome, gil.nome])).toHaveCount(1)
    await expect(naFila(dra1, [gil.nome])).toHaveCount(1)
  })

  await test.step('"Eu vou chamar": começa o atendimento direto, sem aviso na recepção', async () => {
    const davi = await novoPaciente(recepcao1, 'Davi')
    const c = await marcar(davi.id, p2.id, '09:00')
    await status(recepcao1, c.id, 'EM_ESPERA')
    await naFila(dra2, [davi.nome]).getByRole('button', { name: 'Eu vou chamar' }).click()
    await expect(naFila(dra2, [davi.nome])).toHaveCount(0)
    await expect(recepcao1.getByRole('alert')).toHaveCount(0)
    const [hojeLista] = [
      await api<{ id: number; status: string }[]>(recepcao1, 'GET', `/agenda?de=${hoje()}`),
    ]
    expect(hojeLista.find((x) => x.id === c.id)?.status).toBe('EM_ATENDIMENTO')
  })

  for (const p of [recepcao1, recepcao2, dra1, dra2]) p.conferir()
})
