// Planejamento (Plano e Ficha Clínica → Planejamentos): todas as formas de lançar procedimentos.
// - um dente só, vários dentes, atalhos (todos, arcadas, anteriores/posteriores, quadrantes);
// - procedimento por dente × completo (boca toda) e a mistura dos dois;
// - vários procedimentos de uma vez (cluster de procedimentos), texto livre, repetido;
// - dentição decídua, dente removido e sem coroa no odontograma;
// - trazer do odontograma, editar dentes/situação e excluir.
// Cada teste cria o próprio paciente fictício (sem o odontograma sorteado do seed), então as
// contagens de dentes são exatas: permanente 32, decídua 20.
import { expect, test, type Locator, type Page } from '@playwright/test'
import { etapasDaFicha } from '../shared/prontuario'
import {
  api,
  entrar,
  novoPaciente,
  preencher,
  primeiroProfissional,
  procedimentoDaTabela,
  semErroDeTela,
} from './ajuda'

type Item = { id: number; dente: string; faces: string; procedimento: string; status: string }
type Ficha = { id: number; especialidade: string; etapas: { nome: string }[]; itens: Item[] }

test.describe.configure({ timeout: 90_000 })

let conferirTela: () => void
test.beforeEach(async ({ page }) => {
  conferirTela = semErroDeTela(page)
  await entrar(page)
})
test.afterEach(() => conferirTela())

/** Paciente novo com um planejamento de Endodontia aberto na tela. */
async function abrirPlanejamento(
  page: Page,
  rotulo: string,
  preparar?: (c: {
    pacienteId: number
    fichaId: number
    profissionalId: number
  }) => Promise<unknown>,
) {
  const paciente = await novoPaciente(page, rotulo)
  const prof = await primeiroProfissional(page)
  const ficha = await api<Ficha>(page, 'POST', `/pacientes/${paciente.id}/fichas`, {
    especialidade: 'Endodontia',
    profissionalId: prof.id,
  })
  await preparar?.({ pacienteId: paciente.id, fichaId: ficha.id, profissionalId: prof.id })
  await page.goto(`/pacientes/${paciente.id}?aba=especialidades`)
  const nav = page.getByRole('navigation', { name: 'Plano e Ficha Clínica' })
  await nav.getByRole('button', { name: /^Planejamentos/ }).click()
  await nav.getByRole('button', { name: new RegExp(`^Endodontia · Nº ${ficha.id}\\b`) }).click()

  const itens = async () =>
    (await api<Ficha[]>(page, 'GET', `/pacientes/${paciente.id}/fichas`)).find(
      (f) => f.id === ficha.id,
    )!.itens
  const abrirForm = async () => {
    await page.getByRole('button', { name: 'Adicionar procedimento', exact: true }).click()
    const d = page.getByRole('dialog').filter({ hasText: 'Adicionar procedimento · Endodontia' })
    await expect(d).toBeVisible()
    return formulario(d)
  }
  return { paciente, ficha, itens, abrirForm }
}

function formulario(d: Locator) {
  return {
    d,
    procedimento: (k: number) => d.getByRole('combobox', { name: `Procedimento ${k}` }),
    dente: (k: number) => d.getByRole('combobox', { name: `Dente ${k}` }),
    atalho: (nome: string) => d.getByRole('button', { name: nome, exact: true }),
    face: (f: string) => d.getByRole('button', { name: f, exact: true }),
    dentição: (nome: string) =>
      d.getByRole('radiogroup', { name: 'Dentição' }).getByRole('radio', { name: nome }),
    selos: (tipo: 'Por dente' | 'Por procedimento') => d.getByText(tipo, { exact: true }),
    rodape: d.locator('footer [aria-live="polite"]'),
    outroProcedimento: () => d.getByRole('button', { name: '+ Outro procedimento' }).click(),
    outroDente: () => d.getByRole('button', { name: '+ Adicionar dente' }).first().click(),
    adicionar: (n = 1) =>
      d.getByRole('button', { name: n > 1 ? `Adicionar ${n}` : 'Adicionar', exact: true }),
    bocaToda: d.getByRole('region', { name: 'Dentes do procedimento completo' }),
  }
}

const total = (n: number) => `${n} ${n === 1 ? 'procedimento' : 'procedimentos'} (um por dente)`
const aviso = (n: number) =>
  n === 1 ? 'Procedimento adicionado' : `${n} procedimentos adicionados`
const dentesDe = (itens: Item[], procedimento?: string) =>
  itens
    .filter((i) => !procedimento || i.procedimento === procedimento)
    .map((i) => i.dente)
    .sort()

const PERMANENTES_SUP = [
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '18',
  '21',
  '22',
  '23',
  '24',
  '25',
  '26',
  '27',
  '28',
]

test('cria o planejamento pela tela: blocos fixos e etapas da especialidade', async ({ page }) => {
  const paciente = await novoPaciente(page, 'novo planejamento')
  await page.goto(`/pacientes/${paciente.id}?aba=especialidades`)
  const nav = page.getByRole('navigation', { name: 'Plano e Ficha Clínica' })
  await nav.getByRole('button', { name: /^Planejamentos/ }).click()
  await expect(page.getByText('Nenhum planejamento ainda')).toBeVisible()
  await page.getByRole('button', { name: 'Novo planejamento' }).first().click()

  const d = page.getByRole('dialog').filter({ hasText: 'Criar planejamento' })
  // Sem especialidade não cria.
  await d.getByLabel('Dentista *').selectOption({ index: 1 })
  await d.getByRole('button', { name: 'Criar planejamento' }).click()
  await expect(d.getByText('Escolha a especialidade.')).toBeVisible()

  const esp = d.getByPlaceholder('Buscar ou adicionar')
  await esp.fill('Periodontia')
  await esp.press('Enter')
  await d.getByRole('button', { name: 'Criar planejamento' }).click()
  await expect(page.getByText('Planejamento criado')).toBeVisible()

  const [f] = await api<Ficha[]>(page, 'GET', `/pacientes/${paciente.id}/fichas`)
  expect(f.especialidade).toBe('Periodontia')
  expect(f.etapas.map((e) => e.nome)).toEqual(etapasDaFicha('Periodontia').map((e) => e.nome))
  // A etapa da especialidade aparece com o nome na tela.
  await expect(page.getByLabel('Nome da etapa 4')).toHaveValue('Raspagem')
  await expect(page.getByText('Nenhum procedimento ainda')).toBeVisible()
})

test('formulário vazio e validações: nada, dente inválido, dente sem procedimento', async ({
  page,
}) => {
  const p = await abrirPlanejamento(page, 'validacoes')
  const f = await p.abrirForm()
  await expect(f.rodape).toHaveText('Escreva o procedimento ou traga um do odontograma.')
  await expect(f.adicionar()).toBeDisabled()

  await preencher(f.dente(1), '99')
  await expect(f.d.getByText('Dente inválido')).toBeVisible()
  await expect(f.rodape).toHaveText('Corrija os dentes marcados em vermelho.')
  await expect(f.adicionar()).toBeDisabled()

  await preencher(f.dente(1), '11')
  await expect(f.rodape).toHaveText('Escreva o procedimento dos dentes marcados.')
  await expect(f.adicionar()).toBeDisabled()

  await preencher(f.procedimento(1), 'Selante')
  await expect(f.rodape).toHaveText(total(1))
  await expect(f.adicionar()).toBeEnabled()

  // Procedimento sem dente.
  await preencher(f.dente(1), '')
  await expect(f.rodape).toHaveText('Marque os dentes do procedimento.')

  // Cancelar não salva nada.
  await f.d.getByRole('button', { name: 'Cancelar' }).click()
  await expect(f.d).toBeHidden()
  expect(await p.itens()).toEqual([])
})

test('dente único, procedimento por dente, com face', async ({ page }) => {
  const p = await abrirPlanejamento(page, 'dente unico')
  const f = await p.abrirForm()
  await preencher(f.procedimento(1), 'Restauração em resina (1 face)')
  await expect(f.selos('Por dente')).toHaveCount(1)
  await expect(f.d.getByRole('heading', { name: 'Dentes e faces' })).toBeVisible()

  await preencher(f.dente(1), '11')
  await f.face('V').click()
  await expect(f.face('V')).toHaveAttribute('aria-pressed', 'true')
  await f.face('I').click()
  await f.face('I').click() // desmarca
  await expect(f.face('I')).toHaveAttribute('aria-pressed', 'false')
  await expect(f.rodape).toHaveText(total(1))
  await f.adicionar().click()
  await expect(page.getByText(aviso(1))).toBeVisible()

  const itens = await p.itens()
  expect(itens).toHaveLength(1)
  expect(itens[0]).toMatchObject({
    dente: '11',
    faces: 'V',
    procedimento: 'Restauração em resina (1 face)',
    status: 'Em avaliação',
  })
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Restauração em resina (1 face)' }),
  ).toBeVisible()
})

test('vários dentes digitados um a um e a situação escolhida', async ({ page }) => {
  const p = await abrirPlanejamento(page, 'varios dentes')
  const f = await p.abrirForm()
  await preencher(f.procedimento(1), 'Tratamento de canal (multirradicular)')
  for (const [k, d] of ['16', '26', '36'].entries()) {
    if (k) await f.outroDente()
    await preencher(f.dente(k + 1), d)
  }
  // Dente repetido conta uma vez.
  await f.outroDente()
  await preencher(f.dente(4), '36')
  await expect(f.d.getByText('3 dentes marcados')).toBeVisible()
  await expect(f.rodape).toHaveText(total(3))

  await f.d
    .getByRole('radiogroup', { name: 'Situação' })
    .locator('label', { hasText: 'Em tratamento' })
    // O rádio fica escondido (sr-only): clica na pílula, como o usuário. Forçar o clique no
    // rádio às vezes não marcava.
    .click()
  await f.adicionar(3).click()
  await expect(page.getByText(aviso(3))).toBeVisible()

  const itens = await p.itens()
  expect(dentesDe(itens)).toEqual(['16', '26', '36'])
  expect(itens.every((i) => i.status === 'Em tratamento')).toBe(true)
  // Um cartão só com os 3 dentes.
  const cartao = page
    .getByRole('listitem')
    .filter({ hasText: 'Tratamento de canal (multirradicular)' })
  await expect(cartao).toHaveCount(1)
  await expect(cartao).toContainText('dentes')
})

test('atalhos de dentes (clusters): todos, arcadas, anteriores, posteriores e quadrantes', async ({
  page,
}) => {
  const p = await abrirPlanejamento(page, 'atalhos')
  const f = await p.abrirForm()
  await preencher(f.procedimento(1), 'Selante')

  const casos: [string, number][] = [
    ['Todos', 32],
    ['Superior', 16],
    ['Inferior', 16],
    ['Anteriores', 12],
    ['Posteriores', 20],
    ['1 · sup. direito', 8],
    ['2 · sup. esquerdo', 8],
    ['3 · inf. esquerdo', 8],
    ['4 · inf. direito', 8],
  ]
  for (const [atalho, n] of casos) {
    await test.step(`${atalho} → ${n} dentes`, async () => {
      await f.atalho(atalho).click()
      await expect(f.atalho(atalho)).toHaveAttribute('aria-pressed', 'true')
      await expect(f.rodape).toHaveText(total(n))
      // Clicar de novo desmarca.
      await f.atalho(atalho).click()
      await expect(f.atalho(atalho)).toHaveAttribute('aria-pressed', 'false')
      await expect(f.rodape).toHaveText('Marque os dentes do procedimento.')
    })
  }

  await test.step('combinar: superior + quadrante 3 = 24; os dois quadrantes de cima ficam marcados', async () => {
    await f.atalho('Superior').click()
    await f.atalho('3 · inf. esquerdo').click()
    await expect(f.rodape).toHaveText(total(24))
    await expect(f.atalho('1 · sup. direito')).toHaveAttribute('aria-pressed', 'true')
    await expect(f.atalho('2 · sup. esquerdo')).toHaveAttribute('aria-pressed', 'true')
    await expect(f.atalho('Todos')).toHaveAttribute('aria-pressed', 'false')
    await f.atalho('4 · inf. direito').click()
    await expect(f.atalho('Todos')).toHaveAttribute('aria-pressed', 'true')
    await expect(f.rodape).toHaveText(total(32))
  })

  await test.step('desmarcar todos e salvar só a arcada superior', async () => {
    await f.atalho('Todos').click()
    await expect(f.rodape).toHaveText('Marque os dentes do procedimento.')
    await f.atalho('Superior').click()
    await f.adicionar(16).click()
    await expect(page.getByText(aviso(16))).toBeVisible()
  })

  expect(dentesDe(await p.itens())).toEqual(PERMANENTES_SUP)
})

test('procedimento completo (boca toda): todos os dentes, sem marcar um a um', async ({ page }) => {
  const p = await abrirPlanejamento(page, 'boca toda')
  const f = await p.abrirForm()
  await preencher(f.procedimento(1), 'Limpeza (profilaxia)')
  await expect(f.selos('Por procedimento')).toHaveCount(1)
  await expect(f.d.getByRole('heading', { name: 'Dentes (por procedimento)' })).toBeVisible()
  await expect(f.dente(1)).toHaveCount(0) // não pede dente
  await expect(f.bocaToda).toContainText('32 dentes · dentição permanente')
  await expect(
    f.bocaToda.getByRole('list', { name: 'Arcada superior' }).getByRole('listitem'),
  ).toHaveCount(16)
  await expect(
    f.bocaToda.getByRole('list', { name: 'Arcada inferior' }).getByRole('listitem'),
  ).toHaveCount(16)
  await expect(f.rodape).toHaveText(total(32))
  await f.adicionar(32).click()
  await expect(page.getByText(aviso(32))).toBeVisible()

  const itens = await p.itens()
  expect(itens).toHaveLength(32)
  expect(new Set(itens.map((i) => i.procedimento))).toEqual(new Set(['Limpeza (profilaxia)']))
  expect(itens.every((i) => i.faces === '')).toBe(true)
})

test('cluster de procedimentos por dente: cada um vai em todos os dentes marcados', async ({
  page,
}) => {
  const p = await abrirPlanejamento(page, 'cluster procedimentos')
  const f = await p.abrirForm()
  await preencher(f.procedimento(1), 'Selante')
  await f.outroProcedimento()
  await preencher(f.procedimento(2), 'Raspagem e alisamento radicular')
  await f.outroProcedimento()
  await preencher(f.procedimento(3), 'Restauração em resina (2 faces)')
  await expect(f.d.getByRole('heading', { name: 'Procedimentos (3)' })).toBeVisible()
  await expect(f.selos('Por dente')).toHaveCount(3)
  await expect(
    f.d.getByText('Cada procedimento vai em todos os dentes marcados abaixo.'),
  ).toBeVisible()

  await preencher(f.dente(1), '46')
  await f.outroDente()
  await preencher(f.dente(2), '47')
  await expect(f.rodape).toHaveText(total(6))

  // Tirar um procedimento da lista recalcula.
  await f.d.getByRole('button', { name: 'Tirar Restauração em resina (2 faces)' }).click()
  await expect(f.rodape).toHaveText(total(4))
  await f.adicionar(4).click()
  await expect(page.getByText(aviso(4))).toBeVisible()

  const itens = await p.itens()
  expect(dentesDe(itens, 'Selante')).toEqual(['46', '47'])
  expect(dentesDe(itens, 'Raspagem e alisamento radicular')).toEqual(['46', '47'])
  expect(itens).toHaveLength(4)
})

test('mistura: por dente nos dentes marcados e boca toda na boca inteira', async ({ page }) => {
  const p = await abrirPlanejamento(page, 'mistura')
  const f = await p.abrirForm()
  await preencher(f.procedimento(1), 'Selante')
  await f.outroProcedimento()
  await preencher(f.procedimento(2), 'Aplicação de flúor')
  await expect(f.selos('Por dente')).toHaveCount(1)
  await expect(f.selos('Por procedimento')).toHaveCount(1)
  await expect(
    f.d.getByText('Os por dente vão nos dentes marcados; os por procedimento, em todos os dentes.'),
  ).toBeVisible()
  // O por dente ainda precisa dos dentes; a boca toda já aparece.
  await expect(f.rodape).toHaveText('Marque os dentes do procedimento.')
  await expect(f.bocaToda).toContainText('32 dentes')

  await preencher(f.dente(1), '16')
  await f.outroDente()
  await preencher(f.dente(2), '26')
  await expect(f.rodape).toHaveText(total(2 + 32))
  await f.adicionar(34).click()
  await expect(page.getByText(aviso(34))).toBeVisible()

  const itens = await p.itens()
  expect(dentesDe(itens, 'Selante')).toEqual(['16', '26'])
  expect(dentesDe(itens, 'Aplicação de flúor')).toHaveLength(32)
})

test('texto livre (fora da tabela) é por dente; procedimento repetido conta uma vez', async ({
  page,
}) => {
  const p = await abrirPlanejamento(page, 'texto livre')
  const f = await p.abrirForm()
  await preencher(f.procedimento(1), 'Ajuste oclusal fictício')
  await expect(f.selos('Por dente')).toHaveCount(0)
  await expect(f.selos('Por procedimento')).toHaveCount(0)
  await f.outroProcedimento()
  await preencher(f.procedimento(2), 'Ajuste oclusal fictício')
  await expect(f.d.getByRole('heading', { name: 'Procedimento', exact: true })).toBeVisible()
  await preencher(f.dente(1), '21')
  await expect(f.rodape).toHaveText(total(1))
  await f.adicionar().click()
  await expect(page.getByText(aviso(1))).toBeVisible()
  expect(await p.itens()).toMatchObject([{ dente: '21', procedimento: 'Ajuste oclusal fictício' }])
})

test('dentição decídua: atalhos e boca toda com 20 dentes', async ({ page }) => {
  const p = await abrirPlanejamento(page, 'decidua')
  const f = await p.abrirForm()
  await preencher(f.procedimento(1), 'Selante')
  await f.dentição('Decídua').click()
  await expect(f.dentição('Decídua')).toHaveAttribute('aria-checked', 'true')

  for (const [atalho, n] of [
    ['Todos', 20],
    ['Superior', 10],
    ['Inferior', 10],
    ['Anteriores', 12],
    ['Posteriores', 8],
    ['5 · sup. direito', 5],
    ['6 · sup. esquerdo', 5],
    ['7 · inf. esquerdo', 5],
    ['8 · inf. direito', 5],
  ] as const) {
    await test.step(`${atalho} → ${n}`, async () => {
      await f.atalho(atalho).click()
      await expect(f.rodape).toHaveText(total(n))
      await f.atalho(atalho).click()
    })
  }

  // Dente permanente numa dentição decídua: aceita, mas avisa.
  await preencher(f.dente(1), '11')
  await expect(f.d.getByText('Fora da dentição escolhida ·')).toBeVisible()
  await preencher(f.dente(1), '51')
  await expect(f.d.getByText('Fora da dentição escolhida ·')).toHaveCount(0)

  // Trocar para um completo: boca toda da decídua.
  await preencher(f.procedimento(1), 'Aplicação de flúor')
  await expect(f.bocaToda).toContainText('20 dentes · dentição decídua')
  await expect(f.rodape).toHaveText(total(20))
  await f.adicionar(20).click()
  await expect(page.getByText(aviso(20))).toBeVisible()

  const itens = await p.itens()
  expect(itens).toHaveLength(20)
  expect(itens.every((i) => ['5', '6', '7', '8'].includes(i.dente[0]))).toBe(true)
})

test('dente removido e sem coroa no odontograma ficam de fora', async ({ page }) => {
  const p = await abrirPlanejamento(page, 'removidos', ({ pacienteId }) =>
    api(page, 'PUT', `/pacientes/${pacienteId}/odontograma`, {
      semCoroa: ['26'],
      removidos: ['18', '28'],
    }),
  )
  const f = await p.abrirForm()
  await preencher(f.procedimento(1), 'Selante')
  await f.atalho('Todos').click()
  await expect(f.rodape).toHaveText(total(30))
  await f.atalho('Todos').click()
  await f.atalho('Superior').click()
  await expect(f.rodape).toHaveText(total(14))
  await f.atalho('Superior').click()

  await preencher(f.dente(1), '18')
  await expect(f.d.getByText('Dente removido: reponha o dente no odontograma antes')).toBeVisible()
  await expect(f.rodape).toHaveText('Corrija os dentes marcados em vermelho.')
  await expect(f.adicionar()).toBeDisabled()

  await preencher(f.dente(1), '26')
  await expect(f.d.getByText('Sem coroa: só o dente inteiro')).toBeVisible()
  await expect(f.face('O')).toHaveCount(0)

  // Boca toda: 30 dentes, o 18 e o 28 riscados.
  await preencher(f.procedimento(1), 'Limpeza (profilaxia)')
  await expect(f.bocaToda).toContainText('30 dentes')
  await expect(f.bocaToda.getByTitle('18: removido no odontograma, fica de fora')).toBeVisible()
  await expect(f.bocaToda.getByLabel('Dente 18 marcado')).toHaveCount(0)
  await f.adicionar(30).click()
  await expect(page.getByText(aviso(30))).toBeVisible()

  const dentes = dentesDe(await p.itens())
  expect(dentes).toHaveLength(30)
  expect(dentes).not.toContain('18')
  expect(dentes).not.toContain('28')
})

test('traz do odontograma: por dente com os dentes dele e boca toda sem dente', async ({
  page,
}) => {
  const coroa = await procedimentoDaTabela(page, 'Coroa de porcelana')
  const limpeza = await procedimentoDaTabela(page, 'Limpeza (profilaxia)')
  expect(coroa.porDente).toBe(true)
  expect(limpeza.porDente).toBe(false)
  const p = await abrirPlanejamento(page, 'trazer', async ({ pacienteId, profissionalId }) => {
    await api(page, 'POST', `/pacientes/${pacienteId}/procedimentos`, {
      procedimentoId: coroa.id,
      profissionalId,
      status: 'EXECUTADO',
      dentes: [
        { dente: '16', faces: '' },
        { dente: '26', faces: '' },
      ],
    })
    await api(page, 'POST', `/pacientes/${pacienteId}/procedimentos`, {
      procedimentoId: limpeza.id,
      profissionalId,
      status: 'EXECUTADO',
    })
  })
  const f = await p.abrirForm()
  const ja = f.d.getByRole('region', { name: 'Já cadastrados' })
  await ja.getByRole('button', { name: /Coroa de porcelana/ }).click()
  await expect(ja.getByText('No odontograma: executado')).toBeVisible()
  // Só trouxe: o passo dos dentes já está feito.
  await expect(f.rodape).toHaveText(total(2))

  await test.step('tirar e acrescentar dentes no trazido', async () => {
    await ja.getByRole('button', { name: 'Tirar o dente 16' }).click()
    await ja.getByRole('button', { name: 'Tirar o dente 26' }).click()
    await expect(ja.getByText('Sem dentes: acrescente um ou tire este procedimento.')).toBeVisible()
    await expect(f.rodape).toHaveText('Um procedimento do odontograma ficou sem dentes.')
    const mais = ja.getByRole('combobox', { name: 'Acrescentar dente em Coroa de porcelana' })
    await mais.fill('26')
    await mais.fill('36')
    await expect(f.rodape).toHaveText(total(2))
    await ja
      .getByRole('radiogroup', { name: 'Situação de Coroa de porcelana' })
      .getByRole('radio', { name: 'Executado' })
      // Rádio escondido (sr-only) dentro da pílula: o clique cai na pílula, como o do usuário.
      .check({ force: true })
  })

  await test.step('boca toda vem com todos os dentes da dentição', async () => {
    await ja.getByRole('button', { name: /Limpeza \(profilaxia\).*por procedimento/ }).click()
    await expect(ja.getByText('2 escolhidos')).toBeVisible()
    await expect(f.rodape).toHaveText(total(2 + 32))
  })

  await f.adicionar(34).click()
  await expect(page.getByText(aviso(34))).toBeVisible()
  const itens = await p.itens()
  expect(dentesDe(itens, 'Coroa de porcelana')).toEqual(['26', '36'])
  expect(
    itens
      .filter((i) => i.procedimento === 'Coroa de porcelana')
      .every((i) => i.status === 'Executado'),
  ).toBe(true)
  expect(dentesDe(itens, 'Limpeza (profilaxia)')).toHaveLength(32)
})

test('editar o lançamento (tirar, desfazer, acrescentar dente, situação) e excluir', async ({
  page,
}) => {
  const p = await abrirPlanejamento(page, 'editar', ({ fichaId }) =>
    api(page, 'POST', `/prontuario/fichas/${fichaId}/itens/lote`, {
      procedimentos: ['Selante'],
      dentes: [{ dente: '14' }, { dente: '15' }, { dente: '16' }],
      status: 'Em avaliação',
    }),
  )
  const cartao = page.getByRole('listitem').filter({ hasText: 'Selante' })
  await expect(cartao).toContainText(/3\s*dentes/)
  const acoes = () => cartao.getByRole('button', { name: 'Ações de Selante' }).click()

  await test.step('editar dentes e situação', async () => {
    await acoes()
    await page.getByRole('menuitem', { name: 'Editar dentes e faces' }).click()
    const d = page.getByRole('dialog').filter({ hasText: 'Editar procedimento · Selante' })
    await d.getByRole('button', { name: 'Tirar o dente 15' }).click()
    await expect(d.getByText('Sai ao salvar (fica no histórico)')).toBeVisible()
    await d.getByRole('button', { name: 'Desfazer' }).click()
    await expect(d.getByText('Sai ao salvar (fica no histórico)')).toHaveCount(0)
    await d.getByRole('button', { name: 'Tirar o dente 15' }).click()
    await d.getByRole('button', { name: '+ Adicionar dente' }).first().click()
    await preencher(d.getByRole('combobox', { name: 'Dente 4' }), '17')
    await d
      .getByRole('radiogroup', { name: 'Situação' })
      .locator('label', { hasText: 'Em tratamento' })
      // O rádio fica escondido (sr-only): clica na pílula, como o usuário. Forçar o clique no
      // rádio às vezes não marcava.
      .click()
    await d.getByRole('button', { name: 'Salvar' }).click()
    await expect(page.getByText('Procedimento atualizado')).toBeVisible()
    const itens = await p.itens()
    expect(dentesDe(itens)).toEqual(['14', '16', '17'])
    expect(itens.every((i) => i.status === 'Em tratamento')).toBe(true)
  })

  await test.step('mudar a situação pelo menu muda o lançamento inteiro', async () => {
    await acoes()
    await expect(page.getByRole('menuitemradio', { name: 'Em tratamento' })).toBeDisabled()
    await page.getByRole('menuitemradio', { name: 'Finalizado' }).click()
    await expect(page.getByText('Situação atualizada')).toBeVisible()
    expect((await p.itens()).every((i) => i.status === 'Finalizado')).toBe(true)
  })

  await test.step('filtro por situação', async () => {
    const filtro = page.getByRole('group', { name: 'Filtrar por situação' })
    await filtro.getByRole('button', { name: /^Finalizado/ }).click()
    await expect(cartao).toHaveCount(1)
    await filtro.getByRole('button', { name: /^Todos/ }).click()
  })

  await test.step('excluir pede confirmação e tira os 3 dentes', async () => {
    await acoes()
    await page.getByRole('menuitem', { name: 'Excluir' }).click()
    const conf = page.getByRole('dialog').filter({ hasText: 'Tem certeza?' })
    await expect(conf).toContainText('dos 3 dentes')
    await conf.getByRole('button', { name: 'Excluir' }).click()
    await expect(page.getByText('Procedimento excluído')).toBeVisible()
    expect(await p.itens()).toEqual([])
    await expect(page.getByText('Nenhum procedimento ainda')).toBeVisible()
  })
})
