// Telas de gestão: usuários, configurações, protético, confirmações, painel e importação.
import { beforeAll, describe, expect, it } from 'vitest'
import { db } from '../src/db'
import { cliente, entrarComo, PACIENTE, usarServidor, type Cliente } from './ajuda'
import { tokenConfirmacao } from '../src/confirmacoes'

usarServidor()

// E-mail de teste: o Nodemailer gera a mensagem sem enviar a lugar nenhum.
beforeAll(() => {
  process.env.SMTP_HOST = 'json'
  process.env.EMAIL_REMETENTE = 'clinica@example.com'
})

async function dentista() {
  return db.pessoa.create({
    data: { tipo: 'PROFISSIONAL', nome: 'Dra. Teste', nomeBusca: 'dra. teste', cro: '12345' },
  })
}

async function pacienteCom(api: Cliente, extra: Record<string, unknown> = {}) {
  return (await api('POST', '/api/pacientes', { ...PACIENTE, ...extra })).corpo
}

// ── Usuários e Permissões (S-012) ───────────────────────────────────────────
describe('usuários e permissões', () => {
  it('administrador cria usuário que consegue entrar; login repetido e senha curta são recusados', async () => {
    const admin = await entrarComo('ADMINISTRADOR')
    const novo = {
      nome: 'Recepção Nova',
      login: 'recepcao.nova',
      email: 'Recepcao.Nova@example.com',
      senha: 'senha-forte-1',
      perfis: ['RECEPCAO'],
    }
    const r = await admin('POST', '/api/usuarios', novo)
    expect(r.status).toBe(201)
    expect(r.corpo).not.toHaveProperty('senhaHash')
    expect(r.corpo.email).toBe('recepcao.nova@example.com')
    expect(
      (await cliente()('POST', '/api/entrar', { login: 'recepcao.nova', senha: 'senha-forte-1' }))
        .status,
    ).toBe(200)
    expect((await admin('POST', '/api/usuarios', novo)).status).toBe(409)
    expect(
      (await admin('POST', '/api/usuarios', { ...novo, login: 'outro', senha: '123' })).status,
    ).toBe(400)
    // E-mail é obrigatório e não se repete entre usuários.
    const semEmail = await admin('POST', '/api/usuarios', { ...novo, login: 'outro3', email: '' })
    expect(semEmail.corpo.erros).toHaveProperty('email')
    const emailRepetido = await admin('POST', '/api/usuarios', { ...novo, login: 'outro4' })
    expect(emailRepetido.status).toBe(409)
    expect(emailRepetido.corpo.erros).toHaveProperty('email')
    expect(
      (await admin('POST', '/api/usuarios', { ...novo, login: 'outro2', perfis: [] })).status,
    ).toBe(400)
  })

  it('usuário com perfil Profissional cria o profissional junto, ou liga a um que já existe', async () => {
    const admin = await entrarComo('ADMINISTRADOR')
    const base = { senha: 'senha-forte-1', perfis: ['PROFISSIONAL'] }
    const sem = await admin('POST', '/api/usuarios', {
      ...base,
      nome: 'Dr. Sem',
      login: 'dr.sem',
      email: 'dr.sem@example.com',
    })
    expect(sem.status).toBe(400)
    expect(sem.corpo.erros).toHaveProperty('pessoaId')

    const r = await admin('POST', '/api/usuarios', {
      ...base,
      nome: 'Dra. Nova',
      login: 'dra.nova',
      email: 'dra.nova@example.com',
      profissional: { cro: 'CRO-XX 999', especialidade: 'Ortodontia', corAgenda: '#123456' },
    })
    expect(r.status).toBe(201)
    expect(r.corpo.pessoa.nome).toBe('Dra. Nova')
    const p = await db.pessoa.findUniqueOrThrow({ where: { id: r.corpo.pessoa.id } })
    expect(p).toMatchObject({ tipo: 'PROFISSIONAL', cro: 'CRO-XX 999', ativo: true })

    const existente = await dentista()
    const ligado = await admin('POST', '/api/usuarios', {
      ...base,
      nome: 'Dra. Teste',
      login: 'dra.teste',
      email: 'dra.teste@example.com',
      pessoaId: existente.id,
    })
    expect(ligado.corpo.pessoa.id).toBe(existente.id)
  })

  it('só o administrador gerencia usuários', async () => {
    const recepcao = await entrarComo('RECEPCAO')
    expect((await recepcao('GET', '/api/usuarios')).status).toBe(403)
  })

  it('inativar bloqueia o login; não dá para se inativar nem tirar o último administrador', async () => {
    const admin = await entrarComo('ADMINISTRADOR')
    const r = await admin('POST', '/api/usuarios', {
      nome: 'Fulana',
      login: 'fulana',
      email: 'fulana@example.com',
      senha: 'senha-forte-1',
      perfis: ['FINANCEIRO'],
    })
    await admin('PUT', `/api/usuarios/${r.corpo.id}`, { ...r.corpo, ativo: false })
    expect(
      (await cliente()('POST', '/api/entrar', { login: 'fulana', senha: 'senha-forte-1' })).status,
    ).toBe(401)

    const eu = admin.usuario
    const proprio = await admin('PUT', `/api/usuarios/${eu.id}`, {
      nome: eu.nome,
      email: 'admin@example.com',
      perfis: ['ADMINISTRADOR'],
      ativo: false,
    })
    expect(proprio.status).toBe(409)
    const semAdmin = await admin('PUT', `/api/usuarios/${eu.id}`, {
      nome: eu.nome,
      email: 'admin@example.com',
      perfis: ['RECEPCAO'],
      ativo: true,
    })
    expect(semAdmin.status).toBe(409)
  })

  it('administrador troca a senha de outro; cada um troca a própria informando a atual', async () => {
    const admin = await entrarComo('ADMINISTRADOR')
    const r = await admin('POST', '/api/usuarios', {
      nome: 'Beltrano',
      login: 'beltrano',
      email: 'beltrano@example.com',
      senha: 'senha-forte-1',
      perfis: ['PROFISSIONAL'],
      profissional: {},
    })
    expect(
      (await admin('POST', `/api/usuarios/${r.corpo.id}/senha`, { senha: 'senha-nova-22' })).status,
    ).toBe(200)
    const entrar = await cliente()('POST', '/api/entrar', {
      login: 'beltrano',
      senha: 'senha-nova-22',
    })
    const beltrano = cliente(entrar.cookie.split(';')[0])
    expect(
      (await beltrano('POST', '/api/eu/senha', { atual: 'errada', nova: 'outra-senha-33' })).status,
    ).toBe(400)
    expect(
      (await beltrano('POST', '/api/eu/senha', { atual: 'senha-nova-22', nova: 'outra-senha-33' }))
        .status,
    ).toBe(200)
  })
})

// ── Configurações (S-014) e e-mail ──────────────────────────────────────────
describe('configurações', () => {
  it('padrão até a clínica mudar; só o administrador muda', async () => {
    const admin = await entrarComo('ADMINISTRADOR')
    expect((await admin('GET', '/api/configuracoes/clinica')).corpo.nome).toBe('Clínica')
    const r = await admin('PUT', '/api/configuracoes/clinica', {
      nome: 'Clínica Sorriso Fictício',
      cidade: 'Cidade Fictícia',
    })
    expect(r.status).toBe(200)
    expect((await admin('GET', '/api/configuracoes/clinica')).corpo).toMatchObject({
      nome: 'Clínica Sorriso Fictício',
      cidade: 'Cidade Fictícia',
    })
    const recepcao = await entrarComo('RECEPCAO')
    expect((await recepcao('PUT', '/api/configuracoes/clinica', { nome: 'X' })).status).toBe(403)
    expect((await recepcao('GET', '/api/configuracoes/clinica')).status).toBe(200)
  })

  it('valida cada assunto: mensagem sem {link} e anamnese sem perguntas são recusadas', async () => {
    const admin = await entrarComo('ADMINISTRADOR')
    expect((await admin('PUT', '/api/configuracoes/mensagens', { confirmacao: 'Oi' })).status).toBe(
      400,
    )
    expect((await admin('PUT', '/api/configuracoes/anamnese', [])).status).toBe(400)
    expect((await admin('PUT', '/api/configuracoes/inexistente', {})).status).toBe(404)
    const perguntas = [
      { texto: 'Tem alergia?', tipo: 'SIM_NAO', obrigatoria: true, alerta: true, resposta: 'Sim' },
    ]
    const r = await admin('PUT', '/api/configuracoes/anamnese', perguntas)
    expect(r.corpo).toEqual([
      { texto: 'Tem alergia?', tipo: 'SIM_NAO', obrigatoria: true, alerta: true },
    ])
  })

  it('modelos de anamnese extras: precisam de nome único e perguntas', async () => {
    const admin = await entrarComo('ADMINISTRADOR')
    expect((await admin('GET', '/api/configuracoes/modelosAnamnese')).corpo).toEqual([])
    const pergunta = { texto: 'Usa aparelho?', tipo: 'SIM_NAO', resposta: 'Sim' }
    expect(
      (
        await admin('PUT', '/api/configuracoes/modelosAnamnese', [
          { nome: '', perguntas: [pergunta] },
        ])
      ).status,
    ).toBe(400)
    expect(
      (await admin('PUT', '/api/configuracoes/modelosAnamnese', [{ nome: 'Orto', perguntas: [] }]))
        .status,
    ).toBe(400)
    const repetido = [
      { nome: 'Orto', perguntas: [pergunta] },
      { nome: 'orto', perguntas: [pergunta] },
    ]
    expect((await admin('PUT', '/api/configuracoes/modelosAnamnese', repetido)).status).toBe(400)
    const r = await admin('PUT', '/api/configuracoes/modelosAnamnese', [
      { nome: ' Ortodontia ', perguntas: [pergunta] },
    ])
    expect(r.corpo).toEqual([
      {
        nome: 'Ortodontia',
        perguntas: [{ texto: 'Usa aparelho?', tipo: 'SIM_NAO', obrigatoria: false, alerta: false }],
      },
    ])
  })

  it('documentos padrão: nome único e texto obrigatório', async () => {
    const admin = await entrarComo('ADMINISTRADOR')
    expect((await admin('GET', '/api/configuracoes/documentosPadrao')).corpo).toEqual([])
    const url = '/api/configuracoes/documentosPadrao'
    expect((await admin('PUT', url, [{ nome: 'Pós', texto: '' }])).status).toBe(400)
    expect((await admin('PUT', url, [{ nome: '', texto: 'x' }])).status).toBe(400)
    const repetido = [
      { nome: 'Pós', texto: 'a' },
      { nome: 'pós', texto: 'b' },
    ]
    expect((await admin('PUT', url, repetido)).status).toBe(400)
    const r = await admin('PUT', url, [{ nome: ' Pós-extração ', texto: 'Não cuspir.' }])
    expect(r.corpo).toEqual([{ nome: 'Pós-extração', texto: 'Não cuspir.' }])
  })

  it('laboratórios: nome único, trabalhos com valor e sem repetir no mesmo laboratório', async () => {
    const admin = await entrarComo('ADMINISTRADOR')
    const url = '/api/configuracoes/laboratorios'
    expect((await admin('GET', url)).corpo).toEqual([])
    const coroa = { nome: 'Coroa em porcelana', valorCentavos: 45000 }
    expect((await admin('PUT', url, [{ nome: '', trabalhos: [] }])).status).toBe(400)
    const repetido = [
      { nome: 'Lab Fictício', trabalhos: [] },
      { nome: 'lab fictício', trabalhos: [] },
    ]
    expect((await admin('PUT', url, repetido)).status).toBe(400)
    const trabalhoRepetido = [{ nome: 'Lab', trabalhos: [coroa, { ...coroa, valorCentavos: 1 }] }]
    expect((await admin('PUT', url, trabalhoRepetido)).status).toBe(400)
    const negativo = [{ nome: 'Lab', trabalhos: [{ nome: 'Faceta', valorCentavos: -5 }] }]
    expect((await admin('PUT', url, negativo)).status).toBe(400)
    const r = await admin('PUT', url, [
      { nome: ' Lab Fictício ', contato: ' (11) 0000-0000 ', trabalhos: [coroa] },
    ])
    expect(r.corpo).toEqual([
      { nome: 'Lab Fictício', contato: '(11) 0000-0000', trabalhos: [coroa] },
    ])
    const recepcao = await entrarComo('RECEPCAO')
    expect((await recepcao('GET', url)).status).toBe(200)
    expect((await recepcao('PUT', url, [])).status).toBe(403)
  })

  it('tabela de procedimentos: cria, edita preço e inativa', async () => {
    const admin = await entrarComo('ADMINISTRADOR')
    const r = await admin('POST', '/api/procedimentos', {
      nome: 'Clareamento',
      especialidade: 'Dentística',
      valorCentavos: 80000,
    })
    expect(r.status).toBe(201)
    await admin('PUT', `/api/procedimentos/${r.corpo.id}`, {
      nome: 'Clareamento',
      valorCentavos: 90000,
      ativo: false,
    })
    expect((await admin('GET', '/api/procedimentos')).corpo).toEqual([])
    expect((await admin('GET', '/api/procedimentos?todos=1')).corpo).toMatchObject([
      { valorCentavos: 90000, ativo: false },
    ])
    expect((await admin('POST', '/api/procedimentos', { nome: '', valorCentavos: 1 })).status).toBe(
      400,
    )
  })

  it('e-mail de teste sai pelo Nodemailer e fica registrado', async () => {
    const admin = await entrarComo('ADMINISTRADOR')
    expect((await admin('GET', '/api/configuracoes/email/estado')).corpo).toMatchObject({
      configurado: true,
    })
    const r = await admin('POST', '/api/configuracoes/email/teste', { para: 'teste@example.com' })
    expect(r.status).toBe(200)
    expect(await db.mensagem.findFirst()).toMatchObject({
      canal: 'EMAIL',
      tipo: 'TESTE',
      status: 'ENVIADA',
    })
  })
})

// ── Recebimento no balcão ───────────────────────────────────────────────────
describe('recebimento', () => {
  async function parcela(api: Cliente) {
    const pac = await pacienteCom(api)
    const [c] = (
      await api('POST', '/api/financeiro/contas', {
        tipo: 'RECEBER',
        descricao: 'Parcela',
        valorCentavos: 15000,
        vencimento: '2026-10-26',
        forma: 'Dinheiro',
        pacienteId: pac.id,
      })
    ).corpo
    return c
  }

  it('Recepção recebe a parcela', async () => {
    const conta = await parcela(await entrarComo('ADMINISTRADOR'))
    const recepcao = await entrarComo('RECEPCAO')
    expect(
      (await recepcao('POST', `/api/financeiro/contas/${conta.id}/baixar`, { forma: 'Dinheiro' }))
        .status,
    ).toBe(200)
  })

  it('Profissional não recebe', async () => {
    const conta = await parcela(await entrarComo('ADMINISTRADOR'))
    const prof = await entrarComo('PROFISSIONAL')
    expect((await prof('POST', `/api/financeiro/contas/${conta.id}/baixar`, {})).status).toBe(403)
  })
})

// ── Controle Protético (R-082) ──────────────────────────────────────────────
describe('PT-82 controle protético', () => {
  it('cria o cartão em Pré-envio, move gravando a data da etapa e exclui sem apagar', async () => {
    const api = await entrarComo('PROFISSIONAL')
    const prof = await dentista()
    const pac = await pacienteCom(api)
    const r = await api('POST', '/api/protetico', {
      pacienteId: pac.id,
      profissionalId: prof.id,
      laboratorio: 'Laboratório Fictício',
      trabalho: 'Coroa em porcelana',
      dentes: '11',
      prazo: '2026-11-10',
      valorCentavos: 45000,
    })
    expect(r.status).toBe(201)
    expect(r.corpo.etapa).toBe('PRE_ENVIO')
    const m = await api('PATCH', `/api/protetico/${r.corpo.id}/etapa`, { etapa: 'EM_LABORATORIO' })
    expect(m.corpo).toMatchObject({ etapa: 'EM_LABORATORIO', enviadoEm: expect.any(String) })
    expect(m.corpo.movidoPorId).toBe(api.usuario.id)
    expect(
      (await api('PATCH', `/api/protetico/${r.corpo.id}/etapa`, { etapa: 'NENHUMA' })).status,
    ).toBe(400)
    expect((await api('POST', '/api/protetico', { pacienteId: pac.id })).status).toBe(400)
    await api('DELETE', `/api/protetico/${r.corpo.id}`)
    expect((await api('GET', '/api/protetico')).corpo).toEqual([])
    expect(await db.trabalhoProtetico.count()).toBe(1)
    expect((await (await entrarComo('FINANCEIRO'))('GET', '/api/protetico')).status).toBe(200)
  })

  it('recepção não cria nem exclui, e não muda paciente, laboratório, trabalho, dentes e cor', async () => {
    const dono = await entrarComo('PROFISSIONAL')
    const prof = await dentista()
    const pac = await pacienteCom(dono)
    const outro = await pacienteCom(dono, { nome: 'Ciclano de Teste' })
    const base = {
      pacienteId: pac.id,
      profissionalId: prof.id,
      laboratorio: 'Laboratório Fictício',
      trabalho: 'Coroa',
      dentes: '11',
      cor: 'A2',
    }
    const t = (await dono('POST', '/api/protetico', base)).corpo
    const rec = await entrarComo('RECEPCAO')
    expect((await rec('POST', '/api/protetico', base)).status).toBe(403)
    expect((await rec('DELETE', '/api/protetico/' + t.id)).status).toBe(403)
    const e = await rec('PUT', '/api/protetico/' + t.id, {
      ...base,
      pacienteId: outro.id,
      laboratorio: 'Outro',
      trabalho: 'Ponte',
      dentes: '21',
      cor: 'B1',
      observacoes: 'Ligar antes',
      prazo: '2026-12-01',
    })
    expect(e.status).toBe(200)
    expect(e.corpo).toMatchObject({ ...base, observacoes: 'Ligar antes', prazo: '2026-12-01' })
  })
})

// ── Confirmação e Alertas (F-002) ───────────────────────────────────────────
describe('confirmação de consultas', () => {
  async function consulta(api: Cliente, email: string | null) {
    const prof = await dentista()
    const pac = await pacienteCom(api, email ? { email } : {})
    return (
      await api('POST', '/api/agenda', {
        tipo: 'CONSULTA',
        data: '2026-10-27',
        inicio: '09:00',
        profissionalId: prof.id,
        pacienteId: pac.id,
      })
    ).corpo
  }

  it('o profissional só vê as consultas dele', async () => {
    const api = await entrarComo('RECEPCAO')
    const c = await consulta(api, null)
    await consulta(api, null) // de outro profissional
    expect((await api('GET', '/api/confirmacoes?data=2026-10-27')).corpo).toHaveLength(2)
    const dele = await entrarComo('PROFISSIONAL')
    await db.usuario.update({
      where: { id: dele.usuario.id },
      data: { pessoaId: c.profissionalId },
    })
    const lista = await dele('GET', '/api/confirmacoes?data=2026-10-27')
    expect(lista.corpo.map((x: { id: number }) => x.id)).toEqual([c.id])
    expect(
      (await (await entrarComo('PROFISSIONAL'))('GET', '/api/confirmacoes?data=2026-10-27')).corpo,
    ).toEqual([])
  })

  it('cada conta guarda os profissionais escondidos', async () => {
    const api = await entrarComo('RECEPCAO')
    expect((await api('GET', '/api/eu')).corpo.preferencias).toEqual({})
    await api('PUT', '/api/eu/preferencias', { agenda: [3, 4] })
    await api('PUT', '/api/eu/preferencias', { confirmacoes: [5] })
    expect((await api('GET', '/api/eu')).corpo.preferencias).toEqual({
      agenda: [3, 4],
      confirmacoes: [5],
    })
    expect((await (await entrarComo('RECEPCAO'))('GET', '/api/eu')).corpo.preferencias).toEqual({})
    expect((await api('PUT', '/api/eu/preferencias', { agenda: ['x'] })).status).toBe(400)
  })

  it('envia o e-mail com o link; o paciente confirma pelo link e a consulta vira Confirmado', async () => {
    const api = await entrarComo('RECEPCAO')
    const c = await consulta(api, 'paciente@example.com')
    const lista = await api('GET', '/api/confirmacoes?data=2026-10-27')
    expect(lista.corpo).toMatchObject([{ id: c.id, paciente: { email: 'paciente@example.com' } }])

    const e = await api('POST', `/api/confirmacoes/${c.id}/enviar`, { canal: 'EMAIL' })
    expect(e.status).toBe(200)
    const msg = await db.mensagem.findFirst({ where: { agendamentoId: c.id } })
    expect(msg).toMatchObject({
      status: 'ENVIADA',
      destino: 'paciente@example.com',
      tipo: 'CONFIRMACAO',
    })

    const publico = cliente()
    const token = tokenConfirmacao(c.id)
    expect((await publico('GET', `/api/publico/confirmacao/${token}`)).corpo).toMatchObject({
      confirmado: false,
      horario: '09:00',
    })
    expect((await publico('POST', `/api/publico/confirmacao/${token}`)).status).toBe(200)
    const a = await db.agendamento.findUnique({ where: { id: c.id } })
    expect(a).toMatchObject({ status: 'CONFIRMADO', confirmadoPor: 'Paciente' })
    expect((await publico('POST', `/api/publico/confirmacao/${c.id}.falso`)).status).toBe(404)
  })

  it('sem e-mail nem celular não envia; SMS ainda está em espera', async () => {
    const api = await entrarComo('RECEPCAO')
    const c = await consulta(api, null)
    expect((await api('POST', `/api/confirmacoes/${c.id}/enviar`, { canal: 'EMAIL' })).status).toBe(
      400,
    )
    expect(
      (await api('POST', `/api/confirmacoes/${c.id}/enviar`, { canal: 'WHATSAPP' })).status,
    ).toBe(400) // sem celular
    expect((await api('POST', `/api/confirmacoes/${c.id}/enviar`, { canal: 'SMS' })).status).toBe(
      501,
    )
  })

  it('a recepção confirma à mão (por telefone)', async () => {
    const api = await entrarComo('RECEPCAO')
    const c = await consulta(api, null)
    expect((await api('POST', `/api/confirmacoes/${c.id}/confirmar`)).status).toBe(200)
    expect(await db.agendamento.findUnique({ where: { id: c.id } })).toMatchObject({
      status: 'CONFIRMADO',
      confirmadoPor: api.usuario.nome,
    })
  })
})

// ── Dashboard Analítico (R-088) ─────────────────────────────────────────────
describe('PT-88 painel', () => {
  it('soma consultas, faltas e vendas do período; só Administrador e Financeiro veem', async () => {
    const admin = await entrarComo('ADMINISTRADOR')
    const prof = await dentista()
    // Nascido em 1990: 36 anos em out/2026.
    const pac = await pacienteCom(admin, { comoConheceu: 'Instagram' })
    for (const inicio of ['09:00', '10:00']) {
      const c = await admin('POST', '/api/agenda', {
        tipo: 'CONSULTA',
        data: '2026-10-20',
        inicio,
        profissionalId: prof.id,
        pacienteId: pac.id,
      })
      await admin('PATCH', `/api/agenda/${c.corpo.id}/status`, {
        status: inicio === '10:00' ? 'FALTOU' : 'ATENDIDO',
      })
    }
    await admin('POST', '/api/financeiro/lancamentos', {
      data: '2026-10-20',
      tipo: 'ENTRADA',
      valorCentavos: 10000,
      descricao: 'Recebimento',
    })
    const r = await admin('GET', '/api/painel?de=2026-10-01&ate=2026-10-31')
    expect(r.status).toBe(200)
    expect(r.corpo.consultas).toMatchObject({ total: 2, faltas: 1 })
    // Entrada solta (sem orçamento) não é faturamento: só aparece na forma de pagamento.
    expect(r.corpo.financeiro).toMatchObject({ faturamento: 0, faturados: 0 })
    expect(r.corpo.financeiro.porForma).toContainEqual({ rotulo: 'Não informada', valor: 10000 })
    expect(r.corpo.consultas.comparecimento).toBe(0.5)
    expect(r.corpo.mapaCalor[2][9]).toBe(1) // terça (20/10/2026) às 9h
    expect(r.corpo.mapaCalor[2][10]).toBe(1)
    expect(r.corpo.faltasSemana[2]).toBe(1)
    expect(r.corpo.pacientes).toMatchObject({ atendidos: 1 })
    expect(r.corpo.pacientes.faixaEtaria).toContainEqual({ rotulo: '36–50', valor: 1 })
    // Origem: dos pacientes cadastrados no período (o do teste foi criado agora).
    const tudo = await admin('GET', '/api/painel?de=2000-01-01&ate=2100-12-31')
    expect(tudo.corpo.pacientes.origem).toContainEqual({ rotulo: 'Instagram', valor: 1 })

    // Período anterior, para comparar os cartões.
    const comAnterior = await admin(
      'GET',
      '/api/painel?de=2026-10-01&ate=2026-10-31&anteriorDe=2026-09-01&anteriorAte=2026-09-30',
    )
    expect(comAnterior.corpo.anterior.financeiro.faturamento).toBe(0)

    // Inadimplência por tempo de atraso.
    const vencida = new Date(Date.now() - 45 * 86_400_000).toISOString().slice(0, 10)
    await admin('POST', '/api/financeiro/contas', {
      tipo: 'RECEBER',
      descricao: 'Parcela',
      valorCentavos: 5000,
      vencimento: vencida,
      pacienteId: pac.id,
    })
    const r2 = await admin('GET', '/api/painel?de=2026-10-01&ate=2026-10-31')
    expect(r2.corpo.inadimplencia.porAtraso).toContainEqual({ rotulo: '31–60 dias', valor: 5000 })
    expect(
      (await (await entrarComo('RECEPCAO'))('GET', '/api/painel?de=2026-10-01&ate=2026-10-31'))
        .status,
    ).toBe(403)
  })

  it('faturamento = orçamentos aprovados (com desconto), igual ao Controle Financeiro', async () => {
    const admin = await entrarComo('ADMINISTRADOR')
    const prof = await dentista()
    const pac = await pacienteCom(admin)
    const proc = await db.procedimento.create({
      data: {
        nome: 'Faceta fictícia',
        nomeBusca: 'faceta ficticia',
        especialidade: 'Estética',
        valorCentavos: 20000,
      },
    })
    const aprovado = async (descontoCentavos: number) => {
      const o = await admin('POST', '/api/orcamentos', {
        pacienteId: pac.id,
        profissionalId: prof.id,
        itens: [{ procedimentoId: proc.id }, { procedimentoId: proc.id }],
        descontoCentavos,
      })
      await admin('POST', `/api/orcamentos/${o.corpo.id}/aprovar`, { pagamento: { forma: 'Pix' } })
      return o.corpo.id as number
    }
    await aprovado(4000) // 40.000 − 4.000 = 36.000
    const cancelado = await aprovado(0)
    await admin('POST', `/api/orcamentos/${cancelado}/cancelar`, { ciente: true })

    const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
    const q = `de=${hoje}&ate=${hoje}`
    const p = (await admin('GET', `/api/painel?${q}`)).corpo
    const a = (await admin('GET', `/api/financeiro/analise?${q}`)).corpo
    const controle = a.orcamentos.reduce(
      (s: number, o: { totalCentavos: number }) => s + o.totalCentavos,
      0,
    )
    const soma = (xs: { valor: number }[]) => xs.reduce((s, x) => s + x.valor, 0)

    expect(p.financeiro.faturamento).toBe(controle)
    expect(p.financeiro.faturados).toBe(a.orcamentos.length)
    // Cancelado sai do faturamento; especialidade e procedimento já vêm com o desconto.
    expect(p.orcamentos.porEspecialidade).toContainEqual({ rotulo: 'Estética', valor: 36000 })
    expect(soma(p.orcamentos.porEspecialidade)).toBe(p.financeiro.faturamento)
    expect(soma(p.orcamentos.porProcedimento)).toBe(p.financeiro.faturamento)
    expect(soma(p.financeiro.porDia)).toBe(p.financeiro.faturamento)
    expect(p.financeiro.tendencia.at(-1).faturamento).toBeGreaterThanOrEqual(
      p.financeiro.faturamento,
    )
    expect(
      p.consultas.porProfissional.find((x: { nome: string }) => x.nome === prof.nome),
    ).toMatchObject({
      faturamento: 36000,
    })
  })
})

// ── Importação do sistema antigo (F-030) ────────────────────────────────────
describe('importação de planilhas', () => {
  it('pacientes: cria, ignora repetido (mesmo CPF) e aponta a linha com erro', async () => {
    const admin = await entrarComo('ADMINISTRADOR')
    const linhas = [
      {
        nome: 'Importado Um',
        nascimento: '1980-05-10',
        cpf: '529.982.247-25',
        celular: '11999990000',
      },
      { nome: 'Importado Repetido', cpf: '52998224725' },
      { nome: '', nascimento: '1990-01-01' },
      { nome: 'Sem Nascimento' },
    ]
    const r = await admin('POST', '/api/importacao/pacientes', {
      arquivo: 'pacientes.xlsx',
      linhas,
    })
    expect(r.status).toBe(200)
    expect(r.corpo).toMatchObject({ criados: 2, ignorados: 1, erros: [{ linha: 3 }] })
    expect(await db.pessoa.count({ where: { tipo: 'PACIENTE' } })).toBe(2)
    expect(await db.importacao.count()).toBe(1)
  })

  it('agendamentos e procedimentos: acham paciente e profissional pelo nome', async () => {
    const admin = await entrarComo('ADMINISTRADOR')
    await dentista()
    await pacienteCom(admin)
    const ag = await admin('POST', '/api/importacao/agendamentos', {
      arquivo: 'agenda.xlsx',
      linhas: [
        {
          paciente: 'fulano de teste',
          profissional: 'Dra. Teste',
          data: '2025-03-10',
          inicio: '14:00',
          status: 'Atendido',
        },
        { paciente: 'Ninguém', profissional: 'Dra. Teste', data: '2025-03-10', inicio: '15:00' },
      ],
    })
    expect(ag.corpo).toMatchObject({ criados: 1, erros: [{ linha: 2 }] })
    expect(await db.agendamento.findFirst()).toMatchObject({ status: 'ATENDIDO', inicio: '14:00' })

    const pr = await admin('POST', '/api/importacao/procedimentos', {
      arquivo: 'prontuario.xlsx',
      linhas: [
        {
          paciente: 'Fulano de Teste',
          profissional: 'Dra. Teste',
          procedimento: 'Restauração',
          data: '2025-03-10',
          dente: '16',
          observacao: 'Resina A2',
        },
      ],
    })
    expect(pr.corpo.criados).toBe(1)
    expect(await db.procedimentoClinico.findFirst()).toMatchObject({
      status: 'EXECUTADO',
      dente: '16',
      observacao: 'Resina A2',
    })
  })

  it('procedimentos com situação e exclusão, e alertas de retorno (arquivo HAR)', async () => {
    const admin = await entrarComo('ADMINISTRADOR')
    await dentista()
    await pacienteCom(admin)
    const base = { paciente: 'Fulano de Teste', profissional: 'Dra. Teste', data: '2025-03-10' }
    const pr = await admin('POST', '/api/importacao/procedimentos', {
      arquivo: 'sistema-antigo.har',
      linhas: [
        { ...base, procedimento: 'Canal', dente: '24', situacao: 'EXISTENTE' },
        { ...base, procedimento: 'Coroa', situacao: 'A_REALIZAR', observacaoPaciente: 'Leve' },
        { ...base, procedimento: 'Limpeza', excluidoEm: '2025-03-12' },
        { ...base, procedimento: 'Limpeza', excluidoEm: '2025-03-12' },
      ],
    })
    expect(pr.corpo).toMatchObject({ criados: 3, ignorados: 1, erros: [] })
    const lista = await db.procedimentoClinico.findMany({ orderBy: { id: 'asc' } })
    expect(lista.map((p) => [p.nome, p.status])).toEqual([
      ['Canal', 'EXISTENTE'],
      ['Coroa', 'A_REALIZAR'],
      ['Limpeza', 'EXECUTADO'],
    ])
    expect(lista[1].observacaoPaciente).toBe('Leve')
    // Excluído no sistema antigo: entra excluído, para o histórico do prontuário.
    expect(lista[2].excluidoEm).not.toBeNull()

    const rt = await admin('POST', '/api/importacao/retornos', {
      arquivo: 'sistema-antigo.har',
      linhas: [
        {
          paciente: 'Fulano de Teste',
          profissional: 'Dra. Teste',
          data: '2025-11-30',
          motivo: 'Revisão',
        },
        {
          paciente: 'Fulano de Teste',
          profissional: 'Dra. Teste',
          data: '2025-11-30',
          motivo: 'Revisão',
        },
        { paciente: 'Fulano de Teste', profissional: 'Dra. Teste', data: '30-11' },
      ],
    })
    expect(rt.corpo).toMatchObject({ criados: 1, ignorados: 1, erros: [{ linha: 3 }] })
    expect(await db.alertaRetorno.findFirst()).toMatchObject({ motivo: 'Revisão' })
  })

  it('profissionais: cria, ignora o mesmo nome (com ou sem "Dra.") e descarta contato inválido', async () => {
    const admin = await entrarComo('ADMINISTRADOR')
    await dentista()
    const r = await admin('POST', '/api/importacao/profissionais', {
      arquivo: 'sistema-antigo.har',
      linhas: [
        { nome: 'Teste' },
        {
          nome: 'Dr. Novo',
          cro: 'RN-1234',
          especialidade: 'Ortodontia',
          email: 'nao-e-email',
          celular: '+55 (11) 98888-7777',
          corAgenda: 'azul',
          ativo: 'NAO',
        },
        { nome: '' },
      ],
    })
    expect(r.corpo).toMatchObject({ criados: 1, ignorados: 1, erros: [{ linha: 3 }] })
    expect(
      await db.pessoa.findFirst({ where: { tipo: 'PROFISSIONAL', nome: 'Dr. Novo' } }),
    ).toMatchObject({
      cro: 'RN-1234',
      especialidade: 'Ortodontia',
      email: null,
      celular: '+55 (11) 98888-7777',
      corAgenda: null,
      ativo: false,
    })
  })

  it('só o administrador importa', async () => {
    const recepcao = await entrarComo('RECEPCAO')
    expect(
      (await recepcao('POST', '/api/importacao/pacientes', { arquivo: 'x', linhas: [] })).status,
    ).toBe(403)
  })
})
