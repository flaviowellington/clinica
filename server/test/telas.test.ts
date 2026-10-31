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
      senha: 'senha-forte-1',
      perfis: ['RECEPCAO'],
    }
    const r = await admin('POST', '/api/usuarios', novo)
    expect(r.status).toBe(201)
    expect(r.corpo).not.toHaveProperty('senhaHash')
    expect(
      (await cliente()('POST', '/api/entrar', { login: 'recepcao.nova', senha: 'senha-forte-1' }))
        .status,
    ).toBe(200)
    expect((await admin('POST', '/api/usuarios', novo)).status).toBe(409)
    expect(
      (await admin('POST', '/api/usuarios', { ...novo, login: 'outro', senha: '123' })).status,
    ).toBe(400)
    expect(
      (await admin('POST', '/api/usuarios', { ...novo, login: 'outro2', perfis: [] })).status,
    ).toBe(400)
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
      perfis: ['ADMINISTRADOR'],
      ativo: false,
    })
    expect(proprio.status).toBe(409)
    const semAdmin = await admin('PUT', `/api/usuarios/${eu.id}`, {
      nome: eu.nome,
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
      senha: 'senha-forte-1',
      perfis: ['PROFISSIONAL'],
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
    const api = await entrarComo('RECEPCAO')
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
    expect((await (await entrarComo('FINANCEIRO'))('GET', '/api/protetico')).status).toBe(403)
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

  it('sem e-mail não envia; WhatsApp e SMS ainda estão em espera', async () => {
    const api = await entrarComo('RECEPCAO')
    const c = await consulta(api, null)
    expect((await api('POST', `/api/confirmacoes/${c.id}/enviar`, { canal: 'EMAIL' })).status).toBe(
      400,
    )
    expect(
      (await api('POST', `/api/confirmacoes/${c.id}/enviar`, { canal: 'WHATSAPP' })).status,
    ).toBe(501)
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
    const pac = await pacienteCom(admin)
    for (const inicio of ['09:00', '10:00']) {
      const c = await admin('POST', '/api/agenda', {
        tipo: 'CONSULTA',
        data: '2026-10-20',
        inicio,
        profissionalId: prof.id,
        pacienteId: pac.id,
      })
      if (inicio === '10:00')
        await admin('PATCH', `/api/agenda/${c.corpo.id}/status`, { status: 'FALTOU' })
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
    expect(r.corpo.financeiro).toMatchObject({ recebido: 10000 })
    expect(
      (await (await entrarComo('RECEPCAO'))('GET', '/api/painel?de=2026-10-01&ate=2026-10-31'))
        .status,
    ).toBe(403)
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

  it('só o administrador importa', async () => {
    const recepcao = await entrarComo('RECEPCAO')
    expect(
      (await recepcao('POST', '/api/importacao/pacientes', { arquivo: 'x', linhas: [] })).status,
    ).toBe(403)
  })
})
