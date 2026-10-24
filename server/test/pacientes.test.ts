import { describe, expect, it } from 'vitest'
import { db } from '../src/db'
import { cliente, criarUsuario, entrarComo, PACIENTE, usarServidor } from './ajuda'

usarServidor()

describe('login e permissões', () => {
  it('sem login a API responde 401', async () => {
    expect((await cliente()('GET', '/api/pacientes?busca=a')).status).toBe(401)
  })
  it('senha errada não entra', async () => {
    const u = await criarUsuario(['ADMINISTRADOR'])
    const r = await cliente()('POST', '/api/entrar', { login: u.login, senha: 'errada' })
    expect(r.status).toBe(401)
    expect(r.corpo.erro).toBe('Usuário ou senha incorretos.')
  })
  it('o cookie de sessão é httpOnly', async () => {
    const u = await criarUsuario(['ADMINISTRADOR'])
    const r = await cliente()('POST', '/api/entrar', { login: u.login, senha: 'senha-de-teste' })
    expect(r.cookie).toMatch(/HttpOnly/i)
  })
  it('usuário inativado perde o acesso na hora', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    await db.usuario.update({ where: { id: api.usuario.id }, data: { ativo: false } })
    expect((await api('GET', '/api/eu')).status).toBe(401)
  })
  it('Financeiro vê, mas não cadastra paciente', async () => {
    const api = await entrarComo('FINANCEIRO')
    expect((await api('POST', '/api/pacientes', PACIENTE)).status).toBe(403)
    expect((await api('GET', '/api/pacientes?busca=f')).status).toBe(200)
  })
})

describe('PT-01 cadastro exige só nome e nascimento', () => {
  it('sem nascimento é recusado', async () => {
    const api = await entrarComo('RECEPCAO')
    const r = await api('POST', '/api/pacientes', { nome: 'Só Nome' })
    expect(r.status).toBe(400)
    expect(r.corpo.erros.nascimento).toBeDefined()
  })
  it('com nome e nascimento cadastra, sem CPF, telefone ou e-mail', async () => {
    const api = await entrarComo('RECEPCAO')
    const r = await api('POST', '/api/pacientes', PACIENTE)
    expect(r.status).toBe(201)
    expect(r.corpo).toMatchObject({ ...PACIENTE, ativo: true, cpf: null, celular: null })
  })
  it('CPF inválido é recusado', async () => {
    const api = await entrarComo('RECEPCAO')
    const r = await api('POST', '/api/pacientes', { ...PACIENTE, cpf: '000.000.000-00' })
    expect(r.corpo.erros.cpf).toBe('CPF inválido.')
  })
})

describe('PT-02 paciente e profissional são a mesma pessoa', () => {
  it('ficam na mesma tabela e a busca de pacientes ignora profissionais', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    await db.pessoa.create({
      data: { tipo: 'PROFISSIONAL', nome: 'Fulano Dentista', nomeBusca: 'fulano dentista' },
    })
    await api('POST', '/api/pacientes', PACIENTE)

    const tipos = (await db.pessoa.findMany({ orderBy: { id: 'asc' } })).map((p) => p.tipo)
    expect(tipos).toEqual(['PROFISSIONAL', 'PACIENTE'])

    const r = await api('GET', '/api/pacientes?busca=fulano')
    expect(r.corpo.itens.map((p: { nome: string }) => p.nome)).toEqual(['Fulano de Teste'])
  })
})

describe('PT-03 abrir a ficha grava log de acesso', () => {
  it('registra usuário, paciente e aba', async () => {
    const api = await entrarComo('PROFISSIONAL')
    const { corpo: p } = await api('POST', '/api/pacientes', PACIENTE)

    await api('GET', `/api/pacientes/${p.id}`)
    await api('GET', `/api/pacientes/${p.id}?aba=editar`)

    const logs = await db.logAcesso.findMany({ orderBy: { id: 'asc' } })
    expect(logs.map((l) => [l.usuarioId, l.pessoaId, l.caminho])).toEqual([
      [api.usuario.id, p.id, `/pacientes/${p.id}/visao-geral`],
      [api.usuario.id, p.id, `/pacientes/${p.id}/editar`],
    ])
  })
})

describe('PT-04 busca por nome; "%" busca pelo sobrenome', () => {
  async function preparar() {
    const api = await entrarComo('RECEPCAO')
    for (const nome of ['Ana Silva', 'Silvana Costa', 'José Souza'])
      await api('POST', '/api/pacientes', { nome, nascimento: '1980-05-05' })
    const nomes = async (busca: string) =>
      (await api('GET', `/api/pacientes?busca=${encodeURIComponent(busca)}`)).corpo.itens.map(
        (p: { nome: string }) => p.nome,
      )
    return nomes
  }
  it('sem "%" também acha pelo sobrenome', async () => {
    const nomes = await preparar()
    expect(await nomes('silva')).toEqual(['Ana Silva', 'Silvana Costa'])
  })
  it('com "%" acha em qualquer parte do nome', async () => {
    const nomes = await preparar()
    expect(await nomes('%silva')).toEqual(['Ana Silva', 'Silvana Costa'])
  })
  it('ignora acento e maiúsculas; busca vazia lista todos', async () => {
    const nomes = await preparar()
    expect(await nomes('JOSE')).toEqual(['José Souza'])
    expect(await nomes('  ')).toEqual(['Ana Silva', 'José Souza', 'Silvana Costa'])
  })
})

describe('PT-57 excluir paciente é exclusão lógica', () => {
  it('some da busca e da ficha, fica na lixeira e pode ser restaurado', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    const { corpo: p } = await api('POST', '/api/pacientes', PACIENTE)

    const r = await api('DELETE', `/api/pacientes/${p.id}`)
    expect(r.corpo.mensagem).toBe('Paciente excluído com sucesso.')
    expect((await api('GET', '/api/pacientes?busca=fulano')).corpo.total).toBe(0)
    expect((await api('GET', `/api/pacientes/${p.id}`)).status).toBe(404)
    expect(await db.pessoa.count()).toBe(1)

    const lixeira = await api('GET', '/api/lixeira/pacientes')
    expect(lixeira.corpo.map((x: { id: number }) => x.id)).toEqual([p.id])

    await api('POST', `/api/lixeira/pacientes/${p.id}/restaurar`)
    expect((await api('GET', `/api/pacientes/${p.id}`)).status).toBe(200)
  })
  it('Recepção não exclui e não vê a lixeira', async () => {
    const api = await entrarComo('RECEPCAO')
    const { corpo: p } = await api('POST', '/api/pacientes', PACIENTE)
    expect((await api('DELETE', `/api/pacientes/${p.id}`)).status).toBe(403)
    expect((await api('GET', '/api/lixeira/pacientes')).status).toBe(403)
  })
})

describe('PT-67 edição recebe o cadastro inteiro, com filiação e responsável', () => {
  it('grava contato, filiação e responsável legal', async () => {
    const api = await entrarComo('RECEPCAO')
    const { corpo: p } = await api('POST', '/api/pacientes', PACIENTE)
    const novo = {
      ...PACIENTE,
      celular: '+55 11 90000-0000',
      nomeMae: 'Mãe Fictícia',
      responsavelNome: 'Responsável Fictício',
      responsavelCpf: '529.982.247-25',
    }
    const r = await api('PUT', `/api/pacientes/${p.id}`, novo)
    expect(r.corpo).toMatchObject({ ...novo, responsavelCpf: '52998224725' })
    expect(r.corpo.criadoPorId).toBe(api.usuario.id)
  })
})

describe('PT-71 inativar exige motivo', () => {
  it('sem motivo ou "Outros" sem descrição é recusado', async () => {
    const api = await entrarComo('PROFISSIONAL')
    const { corpo: p } = await api('POST', '/api/pacientes', PACIENTE)
    expect((await api('POST', `/api/pacientes/${p.id}/inativar`, {})).status).toBe(400)
    const r = await api('POST', `/api/pacientes/${p.id}/inativar`, { motivo: 'OUTROS' })
    expect(r.corpo.erro).toBe('Descreva o motivo.')
  })
  it('fica Inativo, continua acessível e pode ser ativado de novo', async () => {
    const api = await entrarComo('PROFISSIONAL')
    const { corpo: p } = await api('POST', '/api/pacientes', PACIENTE)

    const r = await api('POST', `/api/pacientes/${p.id}/inativar`, {
      motivo: 'DESISTENCIA_TRATAMENTO',
    })
    expect(r.corpo).toMatchObject({ ativo: false, motivoInativacao: 'DESISTENCIA_TRATAMENTO' })
    expect((await api('GET', `/api/pacientes/${p.id}`)).corpo.ativo).toBe(false)
    expect((await api('GET', '/api/pacientes?busca=fulano')).corpo.total).toBe(1)

    const a = await api('POST', `/api/pacientes/${p.id}/ativar`)
    expect(a.corpo).toMatchObject({ ativo: true, motivoInativacao: null })
  })
  it('Recepção não inativa', async () => {
    const api = await entrarComo('RECEPCAO')
    const { corpo: p } = await api('POST', '/api/pacientes', PACIENTE)
    expect(
      (await api('POST', `/api/pacientes/${p.id}/inativar`, { motivo: 'FALECIMENTO' })).status,
    ).toBe(403)
  })
})
