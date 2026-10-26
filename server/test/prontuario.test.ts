// Prontuário: as abas da ficha do paciente (rules/prontuario.md, screens/S-003).
import { describe, expect, it } from 'vitest'
import { db } from '../src/db'
import { entrarComo, PACIENTE, usarServidor, type Cliente } from './ajuda'
import { MODELO_ANAMNESE, type Pergunta } from '../../shared/prontuario'

usarServidor()

async function base(api: Cliente) {
  const dentista = await db.pessoa.create({
    data: { tipo: 'PROFISSIONAL', nome: 'Dra. Teste', nomeBusca: 'dra. teste', cro: '12345' },
  })
  const { corpo: paciente } = await api('POST', '/api/pacientes', PACIENTE)
  const resina = await db.procedimento.create({
    data: {
      nome: 'Restauração em resina',
      nomeBusca: 'restauracao em resina',
      valorCentavos: 30000,
    },
  })
  return { dentista, paciente, resina }
}

/** Modelo com todas as obrigatórias respondidas "Não". */
const respondida = (): Pergunta[] =>
  MODELO_ANAMNESE.map((p) => ({ ...p, resposta: p.obrigatoria ? 'Não' : null }))

describe('PT-03 log de acesso por aba', () => {
  it('abrir a ficha e trocar de aba gravam o caminho', async () => {
    const api = await entrarComo('PROFISSIONAL')
    const { paciente } = await base(api)
    await api('GET', `/api/pacientes/${paciente.id}`)
    await api('GET', `/api/pacientes/${paciente.id}?aba=odontograma`)
    const log = await db.logAcesso.findMany({ orderBy: { id: 'asc' } })
    expect(log.map((l) => l.caminho)).toEqual([
      `/pacientes/${paciente.id}/visao-geral`,
      `/pacientes/${paciente.id}/odontograma`,
    ])
  })
})

describe('anamnese (R-058, R-059, R-074, R-075)', () => {
  it('PT-74: pergunta obrigatória sem resposta bloqueia e nada é gravado', async () => {
    const api = await entrarComo('PROFISSIONAL')
    const { paciente } = await base(api)
    const r = await api('POST', `/api/pacientes/${paciente.id}/anamneses`, {
      respondente: 'PROFISSIONAL',
      perguntas: MODELO_ANAMNESE,
    })
    expect(r.status).toBe(400)
    expect(r.corpo.erro).toBe('Preencha todas as respostas obrigatórias antes de continuar.')
    expect(Object.keys(r.corpo.erros).length).toBeGreaterThan(0)
    expect(await db.anamnese.count()).toBe(0)
  })

  it('PT-58 e PT-59: grava com respondente; resposta com Alerta vira alerta do paciente', async () => {
    const api = await entrarComo('PROFISSIONAL')
    const { paciente } = await base(api)
    const perguntas = respondida()
    perguntas[2].resposta = 'Sim'
    perguntas[2].descricao = 'Dipirona'
    const r = await api('POST', `/api/pacientes/${paciente.id}/anamneses`, {
      respondente: 'PACIENTE',
      perguntas,
    })
    expect(r.status).toBe(201)
    expect(r.corpo.respondente).toBe('PACIENTE')
    const alertas = await api('GET', `/api/pacientes/${paciente.id}/alertas`)
    expect(alertas.corpo).toEqual([
      expect.objectContaining({
        texto: MODELO_ANAMNESE[2].texto,
        resposta: 'Sim',
        descricao: 'Dipirona',
      }),
    ])
  })

  it('PT-75: salvar altera a mesma; nova vira Atual e a anterior vai para o histórico', async () => {
    const api = await entrarComo('PROFISSIONAL')
    const { paciente } = await base(api)
    const url = `/api/pacientes/${paciente.id}/anamneses`
    const a = await api('POST', url, { respondente: 'PROFISSIONAL', perguntas: respondida() })
    const editada = await api('PUT', `/api/prontuario/anamneses/${a.corpo.id}`, {
      perguntas: respondida(),
      observacoes: 'Paciente ansioso',
    })
    expect(editada.status).toBe(200)
    expect((await api('GET', url)).corpo).toHaveLength(1)
    // BR-003: o valor antigo fica guardado.
    expect(
      await db.alteracao.count({ where: { tabela: 'Anamnese', registroId: a.corpo.id } }),
    ).toBe(1)

    const b = await api('POST', url, { respondente: 'PROFISSIONAL', perguntas: respondida() })
    const lista = (await api('GET', url)).corpo
    expect(lista.map((x: { id: number; atual: boolean }) => [x.id, x.atual])).toEqual([
      [b.corpo.id, true],
      [a.corpo.id, false],
    ])
  })

  it('Recepção vê a anamnese mas não edita; Financeiro não vê', async () => {
    const prof = await entrarComo('PROFISSIONAL')
    const { paciente } = await base(prof)
    const url = `/api/pacientes/${paciente.id}/anamneses`
    const recepcao = await entrarComo('RECEPCAO')
    expect((await recepcao('GET', url)).status).toBe(200)
    expect(
      (await recepcao('POST', url, { respondente: 'PACIENTE', perguntas: respondida() })).status,
    ).toBe(403)
    expect((await (await entrarComo('FINANCEIRO'))('GET', url)).status).toBe(403)
  })
})

describe('odontograma e ficha clínica (R-061, R-069, R-078)', () => {
  it('PT-61: executado direto vai para a ficha clínica sem lançamento financeiro', async () => {
    const api = await entrarComo('PROFISSIONAL')
    const { dentista, paciente, resina } = await base(api)
    const r = await api('POST', `/api/pacientes/${paciente.id}/procedimentos`, {
      procedimentoId: resina.id,
      profissionalId: dentista.id,
      status: 'EXECUTADO',
      dente: '16',
      faces: 'om',
      observacao: 'Interna',
      observacaoPaciente: 'Evitar mastigar do lado direito hoje',
    })
    expect(r.status).toBe(201)
    const lista = (await api('GET', `/api/pacientes/${paciente.id}/procedimentos`)).corpo
    // PT-69: faces junto do número, na ordem V P M D O C.
    expect(lista).toMatchObject([
      { nome: resina.nome, status: 'EXECUTADO', dente: '16', faces: 'MO', origem: 'CLINICO' },
    ])
    // PT-78: as duas observações ficam separadas.
    expect(lista[0]).toMatchObject({
      observacao: 'Interna',
      observacaoPaciente: 'Evitar mastigar do lado direito hoje',
    })
    expect(await db.lancamento.count()).toBe(0)
    expect(await db.contaFinanceira.count()).toBe(0)
  })

  it('dente é opcional, mas inválido é recusado; observação acima de 1500 é recusada', async () => {
    const api = await entrarComo('PROFISSIONAL')
    const { dentista, paciente, resina } = await base(api)
    const url = `/api/pacientes/${paciente.id}/procedimentos`
    const ok = { procedimentoId: resina.id, profissionalId: dentista.id, status: 'EXISTENTE' }
    expect((await api('POST', url, ok)).status).toBe(201)
    expect((await api('POST', url, { ...ok, dente: '99' })).status).toBe(400)
    expect((await api('POST', url, { ...ok, observacao: 'x'.repeat(1501) })).status).toBe(400)
  })

  it('PT-69: editar guarda o valor antigo; excluir tira da lista sem apagar do banco', async () => {
    const api = await entrarComo('PROFISSIONAL')
    const { dentista, paciente, resina } = await base(api)
    const r = await api('POST', `/api/pacientes/${paciente.id}/procedimentos`, {
      procedimentoId: resina.id,
      profissionalId: dentista.id,
      status: 'EXECUTADO',
      dente: '16',
    })
    const url = `/api/prontuario/procedimentos/${r.corpo.id}`
    const e = await api('PUT', url, {
      profissionalId: dentista.id,
      status: 'EXECUTADO',
      dente: '26',
      faces: 'D',
    })
    expect(e.corpo).toMatchObject({ dente: '26', faces: 'D' })
    expect((await api('DELETE', url)).status).toBe(200)
    expect((await api('GET', `/api/pacientes/${paciente.id}/procedimentos`)).corpo).toEqual([])
    expect(await db.procedimentoClinico.count()).toBe(1)
    expect(await db.alteracao.count({ where: { tabela: 'ProcedimentoClinico' } })).toBe(2)
  })

  it('PT-19: item de orçamento aprovado aparece como "A realizar" e, executado, como Executado', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    const { dentista, paciente, resina } = await base(api)
    const o = await api('POST', '/api/orcamentos', {
      pacienteId: paciente.id,
      profissionalId: dentista.id,
      forma: 'Dinheiro',
      itens: [{ procedimentoId: resina.id, dente: '16' }],
    })
    await api('POST', `/api/orcamentos/${o.corpo.id}/aprovar`)
    const url = `/api/pacientes/${paciente.id}/procedimentos`
    expect((await api('GET', url)).corpo).toMatchObject([
      { origem: 'ORCAMENTO', status: 'A_REALIZAR', dente: '16', orcamentoId: o.corpo.id },
    ])
    await api('POST', `/api/orcamentos/itens/${o.corpo.itens[0].id}/executar`)
    expect((await api('GET', url)).corpo).toMatchObject([{ status: 'EXECUTADO' }])
  })

  it('Recepção não vê o odontograma', async () => {
    const prof = await entrarComo('PROFISSIONAL')
    const { paciente } = await base(prof)
    const recepcao = await entrarComo('RECEPCAO')
    expect((await recepcao('GET', `/api/pacientes/${paciente.id}/procedimentos`)).status).toBe(403)
  })
})

describe('PT-68 ficha de especialidade com status por dente', () => {
  it('cria a ficha, exige dente no procedimento e muda o status do dente', async () => {
    const api = await entrarComo('PROFISSIONAL')
    const { dentista, paciente } = await base(api)
    const f = await api('POST', `/api/pacientes/${paciente.id}/fichas`, {
      especialidade: 'Endodontia',
      profissionalId: dentista.id,
    })
    expect(f.status).toBe(201)
    const url = `/api/prontuario/fichas/${f.corpo.id}/itens`
    expect((await api('POST', url, { procedimento: 'Tratamento de canal' })).status).toBe(400)
    const i = await api('POST', url, { dente: '36', procedimento: 'Tratamento de canal' })
    expect(i.corpo.status).toBe('Em avaliação')
    const s = await api('PATCH', `/api/prontuario/fichas/itens/${i.corpo.id}`, {
      status: 'Em tratamento',
    })
    expect(s.corpo.status).toBe('Em tratamento')
    expect(
      (await api('PATCH', `/api/prontuario/fichas/itens/${i.corpo.id}`, { status: 'Qualquer' }))
        .status,
    ).toBe(400)
    const lista = (await api('GET', `/api/pacientes/${paciente.id}/fichas`)).corpo
    expect(lista).toMatchObject([
      { especialidade: 'Endodontia', itens: [{ dente: '36', status: 'Em tratamento' }] },
    ])
  })

  it('especialidade fora da lista é recusada', async () => {
    const api = await entrarComo('PROFISSIONAL')
    const { dentista, paciente } = await base(api)
    const r = await api('POST', `/api/pacientes/${paciente.id}/fichas`, {
      especialidade: 'Astrologia',
      profissionalId: dentista.id,
    })
    expect(r.status).toBe(400)
  })
})

// PNG de 1×1 pixel.
const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  ),
  (c) => c.charCodeAt(0),
)

describe('fotos e exames (R-076, R-077)', () => {
  it('PT-76: envia a foto numa pasta e devolve o mesmo arquivo', async () => {
    const api = await entrarComo('PROFISSIONAL')
    const { paciente } = await base(api)
    const r = await api(
      'POST',
      `/api/pacientes/${paciente.id}/arquivos?categoria=FOTO&pasta=Inicial&nome=sorriso.png`,
      PNG,
      'image/png',
    )
    expect(r.status).toBe(201)
    expect(r.corpo).toMatchObject({ nome: 'sorriso.png', pasta: 'Inicial', tipo: 'image/png' })
    expect(r.corpo.dados).toBeUndefined()
    const c = await api('GET', `/api/prontuario/arquivos/${r.corpo.id}/conteudo`)
    expect(c.tipo).toBe('image/png')
    expect(c.corpo).toEqual(PNG)
  })

  it('recusa tipo que não é imagem, e arquivo que diz ser PNG mas não é', async () => {
    const api = await entrarComo('PROFISSIONAL')
    const { paciente } = await base(api)
    const url = `/api/pacientes/${paciente.id}/arquivos?categoria=FOTO&nome=x`
    expect((await api('POST', url, new TextEncoder().encode('<script>'), 'text/html')).status).toBe(
      400,
    )
    expect(
      (await api('POST', url, new TextEncoder().encode('não é png'), 'image/png')).status,
    ).toBe(400)
  })

  it('PT-77: girar grava na hora; excluir tira da lista e guarda o arquivo (BR-003)', async () => {
    const api = await entrarComo('PROFISSIONAL')
    const { paciente } = await base(api)
    const f = await api(
      'POST',
      `/api/pacientes/${paciente.id}/arquivos?categoria=FOTO&nome=a.png`,
      PNG,
      'image/png',
    )
    const url = `/api/prontuario/arquivos/${f.corpo.id}`
    expect((await api('PATCH', url, { rotacao: 90, espelhado: true })).corpo).toMatchObject({
      rotacao: 90,
      espelhado: true,
    })
    expect((await api('PATCH', url, { rotacao: 45 })).status).toBe(400)
    await api('DELETE', url)
    expect(
      (await api('GET', `/api/pacientes/${paciente.id}/arquivos?categoria=FOTO`)).corpo,
    ).toEqual([])
    expect(await db.arquivo.count()).toBe(1)
  })

  it('Recepção vê fotos mas não exames nem envia', async () => {
    const prof = await entrarComo('PROFISSIONAL')
    const { paciente } = await base(prof)
    const recepcao = await entrarComo('RECEPCAO')
    const url = `/api/pacientes/${paciente.id}/arquivos`
    expect((await recepcao('GET', `${url}?categoria=FOTO`)).status).toBe(200)
    expect((await recepcao('GET', `${url}?categoria=EXAME`)).status).toBe(403)
    expect(
      (await recepcao('POST', `${url}?categoria=FOTO&nome=a.png`, PNG, 'image/png')).status,
    ).toBe(403)
  })

  it('exame aceita PDF', async () => {
    const api = await entrarComo('PROFISSIONAL')
    const { paciente } = await base(api)
    const pdf = new TextEncoder().encode('%PDF-1.4\n%fim')
    const r = await api(
      'POST',
      `/api/pacientes/${paciente.id}/arquivos?categoria=EXAME&nome=rx.pdf`,
      pdf,
      'application/pdf',
    )
    expect(r.status).toBe(201)
  })
})

describe('PT-62 documentos de modelo', () => {
  it('grava o texto editado e lista; excluir não apaga do banco', async () => {
    const api = await entrarComo('PROFISSIONAL')
    const { dentista, paciente } = await base(api)
    const url = `/api/pacientes/${paciente.id}/documentos`
    const r = await api('POST', url, {
      modelo: 'atestado',
      profissionalId: dentista.id,
      texto: 'Atesto que Fulano de Teste esteve aqui.',
    })
    expect(r.status).toBe(201)
    expect(r.corpo).toMatchObject({ titulo: 'Atestado', profissional: { nome: 'Dra. Teste' } })
    expect((await api('POST', url, { modelo: 'atestado', texto: '  ' })).status).toBe(400)
    expect((await api('POST', url, { modelo: 'inexistente', texto: 'x' })).status).toBe(400)
    expect((await api('GET', url)).corpo).toHaveLength(1)
    await api('DELETE', `/api/prontuario/documentos/${r.corpo.id}`)
    expect((await api('GET', url)).corpo).toHaveLength(0)
    expect(await db.documento.count()).toBe(1)
  })
})

describe('abas de consulta: resumo, notas, financeiro, agendamentos, indicações', () => {
  it('notas gerais aparecem no resumo', async () => {
    const api = await entrarComo('RECEPCAO')
    const { paciente } = await base(api)
    expect(
      (await api('POST', `/api/pacientes/${paciente.id}/notas`, { texto: 'Prefere manhã' })).status,
    ).toBe(201)
    const r = await api('GET', `/api/pacientes/${paciente.id}/resumo`)
    expect(r.corpo.notas).toMatchObject([{ texto: 'Prefere manhã' }])
    expect(r.corpo).toHaveProperty('proximaConsulta', null)
  })

  it('financeiro do paciente traz só as contas e lançamentos dele, e só para quem vê o financeiro', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    const { dentista, paciente, resina } = await base(api)
    const outro = (await api('POST', '/api/pacientes', { ...PACIENTE, nome: 'Outro Paciente' }))
      .corpo
    for (const p of [paciente, outro]) {
      const o = await api('POST', '/api/orcamentos', {
        pacienteId: p.id,
        profissionalId: dentista.id,
        forma: 'Pix',
        parcelas: 2,
        itens: [{ procedimentoId: resina.id }],
      })
      await api('POST', `/api/orcamentos/${o.corpo.id}/aprovar`)
    }
    const r = await api('GET', `/api/pacientes/${paciente.id}/financeiro`)
    expect(r.corpo.contas).toHaveLength(2)
    expect(r.corpo.lancamentos).toMatchObject([{ tipo: 'VENDA', valorCentavos: 30000 }])
    expect(r.corpo.saldoCentavos).toBe(-30000)
    expect(
      (await (await entrarComo('RECEPCAO'))('GET', `/api/pacientes/${paciente.id}/financeiro`))
        .status,
    ).toBe(403)
  })

  it('agendamentos do paciente, do mais novo para o mais antigo', async () => {
    const api = await entrarComo('RECEPCAO')
    const { dentista, paciente } = await base(api)
    for (const data of ['2026-10-19', '2026-11-03'])
      await api('POST', '/api/agenda', {
        tipo: 'CONSULTA',
        data,
        inicio: '09:00',
        fim: '09:30',
        profissionalId: dentista.id,
        pacienteId: paciente.id,
      })
    const r = await api('GET', `/api/pacientes/${paciente.id}/agendamentos`)
    expect(r.corpo.map((a: { data: string }) => a.data)).toEqual(['2026-11-03', '2026-10-19'])
  })

  it('indicações: quem este paciente indicou e por quem foi indicado', async () => {
    const api = await entrarComo('RECEPCAO')
    const { paciente } = await base(api)
    await api('POST', '/api/pacientes', {
      ...PACIENTE,
      nome: 'Amiga Indicada',
      comoConheceu: 'Indicado por',
      indicadoPor: 'fulano de teste',
    })
    const r = await api('GET', `/api/pacientes/${paciente.id}/indicacoes`)
    expect(r.corpo.indicados).toMatchObject([{ nome: 'Amiga Indicada' }])
  })
})
