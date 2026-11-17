import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
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
  it('Financeiro cadastra paciente, mas ninguém além do administrador exclui', async () => {
    const api = await entrarComo('FINANCEIRO')
    const { status, corpo: p } = await api('POST', '/api/pacientes', PACIENTE)
    expect(status).toBe(201)
    for (const perfil of ['RECEPCAO', 'FINANCEIRO', 'PROFISSIONAL'] as const)
      expect((await (await entrarComo(perfil))('DELETE', '/api/pacientes/' + p.id)).status).toBe(
        403,
      )
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

describe('busca de paciente por telefone ou CPF', () => {
  async function preparar() {
    const api = await entrarComo('RECEPCAO')
    await api('POST', '/api/pacientes', {
      nome: 'Bia Número',
      nascimento: '1980-05-05',
      cpf: '529.982.247-25',
      celular: '+55 (11) 98765-4321',
    })
    await api('POST', '/api/pacientes', { nome: 'Caio 2024', nascimento: '1980-05-05' })
    return async (busca: string) =>
      (await api('GET', `/api/pacientes?busca=${encodeURIComponent(busca)}`)).corpo.itens.map(
        (p: { nome: string }) => p.nome,
      )
  }
  it('acha pelo CPF com ou sem pontuação', async () => {
    const nomes = await preparar()
    expect(await nomes('529.982')).toEqual(['Bia Número'])
    expect(await nomes('52998224725')).toEqual(['Bia Número'])
  })
  it('acha pelo celular ignorando espaços, parênteses e traço', async () => {
    const nomes = await preparar()
    expect(await nomes('98765-4321')).toEqual(['Bia Número'])
    expect(await nomes('11 98765')).toEqual(['Bia Número'])
  })
  it('número que está no nome continua achando pelo nome', async () => {
    const nomes = await preparar()
    expect(await nomes('2024')).toEqual(['Caio 2024'])
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

    const lixeira = await api('GET', '/api/lixeira')
    expect(lixeira.corpo.map((x: { id: number }) => x.id)).toEqual([p.id])

    await api('POST', `/api/lixeira/paciente/${p.id}/restaurar`)
    expect((await api('GET', `/api/pacientes/${p.id}`)).status).toBe(200)
  })
  it('Recepção não exclui e não vê a lixeira', async () => {
    const api = await entrarComo('RECEPCAO')
    const { corpo: p } = await api('POST', '/api/pacientes', PACIENTE)
    expect((await api('DELETE', `/api/pacientes/${p.id}`)).status).toBe(403)
    expect((await api('GET', '/api/lixeira')).status).toBe(403)
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
      cpfMae: '529.982.247-25',
      nomePai: 'Pai Fictício',
      cpfPai: '111.111.111-11',
      responsavelNome: 'Responsável Fictício',
      responsavelCpf: '529.982.247-25',
    }
    const invalido = await api('PUT', `/api/pacientes/${p.id}`, novo)
    expect(invalido.corpo.erros).toMatchObject({ cpfPai: 'CPF inválido.' })
    const r = await api('PUT', `/api/pacientes/${p.id}`, { ...novo, cpfPai: '' })
    expect(r.corpo).toMatchObject({
      ...novo,
      cpfMae: '52998224725',
      cpfPai: null,
      responsavelCpf: '52998224725',
    })
    expect(r.corpo.criadoPorId).toBe(api.usuario.id)
  })
})

describe('Dados da nota fiscal do paciente', () => {
  it('"Outra pessoa" exige nome; os demais usam nome e CPF do cadastro', async () => {
    const api = await entrarComo('FINANCEIRO')
    const { corpo: p } = await api('POST', '/api/pacientes', PACIENTE)
    const url = `/api/pacientes/${p.id}/nota-fiscal`
    const semNome = await api('PUT', url, { tomador: 'OUTRO' })
    expect(semNome.corpo.erros).toMatchObject({ nome: 'Informe o nome.' })

    const r = await api('PUT', url, {
      tomador: 'MAE',
      nome: 'Ignorado',
      cpf: '529.982.247-25',
      cep: '01310-100',
      uf: 'sp',
      observacoes: 'Enviar por e-mail',
    })
    expect(r.corpo.notaFiscal).toMatchObject({
      tomador: 'MAE',
      nome: null,
      cpf: null,
      cep: '01310100',
      uf: 'SP',
      observacoes: 'Enviar por e-mail',
    })
    // Editar o cadastro não apaga a nota fiscal.
    const e = await api('PUT', `/api/pacientes/${p.id}`, PACIENTE)
    expect(e.corpo.notaFiscal.tomador).toBe('MAE')
    // Endereço salvo volta ao abrir a ficha de novo.
    expect((await api('GET', `/api/pacientes/${p.id}`)).corpo.notaFiscal.cep).toBe('01310100')
  })

  it('por padrão só Administrador e Financeiro veem e editam', async () => {
    const fin = await entrarComo('FINANCEIRO')
    const { corpo: p } = await fin('POST', '/api/pacientes', PACIENTE)
    await fin('PUT', `/api/pacientes/${p.id}/nota-fiscal`, { cep: '01310100' })

    for (const perfil of ['RECEPCAO', 'PROFISSIONAL'] as const) {
      const api = await entrarComo(perfil)
      expect((await api('GET', `/api/pacientes/${p.id}`)).corpo.notaFiscal).toBeNull()
      expect((await api('PUT', `/api/pacientes/${p.id}/nota-fiscal`, {})).status).toBe(403)
    }
    const adm = await entrarComo('ADMINISTRADOR')
    expect((await adm('GET', `/api/pacientes/${p.id}`)).corpo.notaFiscal.cep).toBe('01310100')
  })

  it('empresa exige razão social e CNPJ válido; a inscrição estadual é opcional', async () => {
    const api = await entrarComo('FINANCEIRO')
    const { corpo: p } = await api('POST', '/api/pacientes', PACIENTE)
    const url = `/api/pacientes/${p.id}/nota-fiscal`
    const sem = await api('PUT', url, { tomador: 'EMPRESA', cnpj: '11.222.333/0001-82' })
    expect(sem.corpo.erros).toMatchObject({ nome: 'Informe o nome.', cnpj: 'CNPJ inválido.' })

    const r = await api('PUT', url, {
      tomador: 'EMPRESA',
      nome: 'Empresa Fictícia Ltda',
      cpf: '529.982.247-25',
      cnpj: '12.abc.345/01de-35',
      inscricaoEstadual: '110.042.490.114',
    })
    expect(r.corpo.notaFiscal).toMatchObject({
      nome: 'Empresa Fictícia Ltda',
      cpf: null,
      cnpj: '12ABC34501DE35',
      inscricaoEstadual: '110.042.490.114',
    })
    // Voltar para o paciente descarta os dados da empresa.
    const v = await api('PUT', url, { tomador: 'PACIENTE', cnpj: '11222333000181' })
    expect(v.corpo.notaFiscal).toMatchObject({ nome: null, cnpj: null, inscricaoEstadual: null })
  })

  it('a aba Nota fiscal do Financeiro tem permissão própria', async () => {
    const adm = await entrarComo('ADMINISTRADOR')
    const recepcao = await entrarComo('RECEPCAO')
    const { corpo: p } = await adm('POST', '/api/pacientes', PACIENTE)
    const url = `/api/pacientes/${p.id}/nota-fiscal`
    const matriz = (await adm('GET', '/api/configuracoes/permissoes')).corpo
    expect(matriz['financeiro.notaFiscal']).toEqual(['ADMINISTRADOR', 'FINANCEIRO'])
    try {
      await adm('PUT', '/api/configuracoes/permissoes', {
        ...matriz,
        'financeiro.notaFiscal': ['ADMINISTRADOR', 'RECEPCAO'],
      })
      expect((await recepcao('PUT', url, { cep: '01310100' })).status).toBe(200)
      expect((await recepcao('GET', `/api/pacientes/${p.id}`)).corpo.notaFiscal.cep).toBe(
        '01310100',
      )
    } finally {
      await adm('PUT', '/api/configuracoes/permissoes', matriz)
    }
  })
})

describe('Emitente da nota fiscal (Configurações)', () => {
  const EMITENTE = {
    perfil: 'Atual',
    tipo: 'PJ',
    razaoSocial: 'Clínica Fictícia Ltda',
    documento: '11.222.333/0001-81',
    inscricaoEstadual: 'ISENTO',
    cep: '01310-100',
    uf: 'sp',
    regime: 'SIMPLES',
  }

  it('guarda vários perfis, valida CNPJ/CPF e só quem tem a aba Clínica altera', async () => {
    const adm = await entrarComo('ADMINISTRADOR')
    const fin = await entrarComo('FINANCEIRO')
    const rec = await entrarComo('RECEPCAO')
    const url = '/api/configuracoes/emitentes'
    expect((await rec('PUT', url, { ativo: 0, perfis: [EMITENTE] })).status).toBe(403)

    const ruim = await adm('PUT', url, { ativo: 0, perfis: [{ ...EMITENTE, documento: '1' }] })
    expect(ruim.corpo.erro).toBe('Atual: CNPJ inválido.')
    const repetido = await adm('PUT', url, { ativo: 0, perfis: [EMITENTE, EMITENTE] })
    expect(repetido.corpo.erro).toBe('Já existe o perfil "Atual".')

    const antigo = { ...EMITENTE, perfil: 'Antigo', tipo: 'PF', documento: '529.982.247-25' }
    const r = await adm('PUT', url, { ativo: 1, perfis: [antigo, EMITENTE] })
    expect(r.status).toBe(200)
    expect(r.corpo.ativo).toBe(1)
    expect(r.corpo.perfis[0]).toMatchObject({ documento: '52998224725', inscricaoEstadual: '' })
    expect(r.corpo.perfis[1]).toMatchObject({
      documento: '11222333000181',
      cep: '01310100',
      uf: 'SP',
    })
    // Quem emite a nota (Financeiro) lê os dados.
    expect((await fin('GET', url)).corpo.perfis).toHaveLength(2)
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
  it('Recepção inativa', async () => {
    const api = await entrarComo('RECEPCAO')
    const { corpo: p } = await api('POST', '/api/pacientes', PACIENTE)
    expect(
      (await api('POST', `/api/pacientes/${p.id}/inativar`, { motivo: 'FALECIMENTO' })).status,
    ).toBe(200)
  })
})

describe('ordem da lista de pacientes', () => {
  it('padrão: acessados recentemente (por qualquer usuário) no topo; o resto em ordem alfabética', async () => {
    const api = await entrarComo('RECEPCAO')
    const ids: Record<string, number> = {}
    for (const nome of ['Ana', 'Bruno', 'Carla', 'Davi'])
      ids[nome] = (await api('POST', '/api/pacientes', { nome, nascimento: '1980-05-05' })).corpo.id
    await api('GET', `/api/pacientes/${ids.Carla}`)
    await api('GET', `/api/pacientes/${ids.Bruno}`)
    // Acesso de outro usuário também conta: vale para todos.
    await (
      await entrarComo('RECEPCAO')
    )('GET', `/api/pacientes/${ids.Davi}`)

    const nomes = async (q: string) =>
      (await api('GET', `/api/pacientes?${q}`)).corpo.itens.map((p: { nome: string }) => p.nome)
    expect(await nomes('')).toEqual(['Davi', 'Bruno', 'Carla', 'Ana'])
    expect(await nomes('porPagina=10&pagina=1&ordem=recentes')).toEqual([
      'Davi',
      'Bruno',
      'Carla',
      'Ana',
    ])
    expect(await nomes('ordem=az')).toEqual(['Ana', 'Bruno', 'Carla', 'Davi'])
    expect(await nomes('ordem=za')).toEqual(['Davi', 'Carla', 'Bruno', 'Ana'])
    expect(await nomes('busca=a&ordem=recentes')).toEqual(['Davi', 'Carla', 'Ana'])
  })
})

describe('foto de perfil (paciente e usuário)', () => {
  const envio = async (recorte = { x: 0, y: 0, tamanho: 100 }) => {
    const png = await sharp({
      create: { width: 200, height: 100, channels: 3, background: '#00ff00' },
    })
      .png()
      .toBuffer()
    const f = new FormData()
    f.append('foto', new Blob([png as BlobPart], { type: 'image/png' }), 'foto.png')
    for (const [k, v] of Object.entries(recorte)) f.append(k, String(v))
    return f
  }

  it('paciente: guarda 400x400 em WebP, não manda os bytes no JSON e remove', async () => {
    const api = await entrarComo('RECEPCAO')
    const { corpo: p } = await api('POST', '/api/pacientes', PACIENTE)
    const r = await api('POST', `/api/pacientes/${p.id}/foto`, await envio())
    expect(r.status).toBe(200)
    expect(r.corpo.fotoEm).toBeTruthy()
    expect(r.corpo).not.toHaveProperty('foto')

    const foto = await api('GET', `/api/pacientes/${p.id}/foto`)
    expect(foto.tipo).toBe('image/webp')
    const meta = await sharp(foto.corpo).metadata()
    expect([meta.width, meta.height]).toEqual([400, 400])
    const lista = await api('GET', '/api/pacientes')
    expect(lista.corpo.itens[0]).not.toHaveProperty('foto')

    expect((await api('DELETE', `/api/pacientes/${p.id}/foto`)).status).toBe(200)
    expect((await api('GET', `/api/pacientes/${p.id}/foto`)).status).toBe(404)
  })

  it('paciente: recusa recorte fora da imagem', async () => {
    const api = await entrarComo('ADMINISTRADOR')
    const { corpo: p } = await api('POST', '/api/pacientes', PACIENTE)
    const r = await api(
      'POST',
      `/api/pacientes/${p.id}/foto`,
      await envio({ x: 150, y: 0, tamanho: 100 }),
    )
    expect(r.status).toBe(400)
  })

  it('usuário: só o administrador coloca a foto', async () => {
    const admin = await entrarComo('ADMINISTRADOR')
    const u = await criarUsuario(['RECEPCAO'])
    const r = await admin('POST', `/api/usuarios/${u.id}/foto`, await envio())
    expect(r.status).toBe(200)
    expect(r.corpo.fotoEm).toBeTruthy()
    expect((await admin('GET', `/api/usuarios/${u.id}/foto`)).tipo).toBe('image/webp')

    const recepcao = await entrarComo('RECEPCAO')
    expect((await recepcao('POST', `/api/usuarios/${u.id}/foto`, await envio())).status).toBe(403)
  })
})
