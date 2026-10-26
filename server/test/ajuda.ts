import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, beforeEach } from 'vitest'
import { criarApp } from '../src/app'
import { db } from '../src/db'
import { gerarHash } from '../src/auth'
import type { Perfil } from '../../shared/permissoes'

let servidor: Server
let base = ''

/** Sobe a API numa porta livre e limpa o banco antes de cada teste. */
export function usarServidor() {
  beforeAll(async () => {
    servidor = criarApp().listen(0)
    await new Promise((ok) => servidor.once('listening', ok))
    base = `http://localhost:${(servidor.address() as AddressInfo).port}`
  })
  afterAll(() => new Promise((ok) => servidor.close(ok)))
  beforeEach(async () => {
    await db.alteracao.deleteMany()
    await db.itemFichaEspecialidade.deleteMany()
    await db.fichaEspecialidade.deleteMany()
    await db.procedimentoClinico.deleteMany()
    await db.anamnese.deleteMany()
    await db.arquivo.deleteMany()
    await db.documento.deleteMany()
    await db.nota.deleteMany()
    await db.contaFinanceira.deleteMany()
    await db.itemOrcamento.deleteMany()
    await db.alertaRetorno.deleteMany()
    await db.lancamento.deleteMany()
    await db.orcamento.deleteMany()
    await db.procedimento.deleteMany()
    await db.contaBancaria.deleteMany()
    await db.agendamento.deleteMany()
    await db.contaDigital.deleteMany()
    await db.logAcesso.deleteMany()
    await db.usuario.deleteMany()
    await db.pessoa.deleteMany()
  })
}

export type Cliente = ReturnType<typeof cliente>

export function cliente(cookie = '') {
  /** Corpo em bytes vai cru, com o tipo informado (upload de arquivo). */
  return async (metodo: string, caminho: string, corpo?: unknown, tipo = 'application/json') => {
    const bruto = corpo instanceof Uint8Array
    const r = await fetch(base + caminho, {
      method: metodo,
      headers: { 'content-type': tipo, cookie },
      body: corpo === undefined ? undefined : bruto ? (corpo as BodyInit) : JSON.stringify(corpo),
    })
    const json = r.headers.get('content-type')?.includes('json')
    return {
      status: r.status,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      corpo: (json ? await r.json() : new Uint8Array(await r.arrayBuffer())) as any,
      tipo: r.headers.get('content-type') ?? '',
      cookie: r.headers.get('set-cookie') ?? '',
    }
  }
}

const SENHA = 'senha-de-teste'
let n = 0

export async function criarUsuario(perfis: Perfil[]) {
  return db.usuario.create({
    data: {
      login: `teste${++n}`,
      nome: `Usuário de teste ${n}`,
      senhaHash: await gerarHash(SENHA),
      perfis,
    },
  })
}

/** Cria um usuário com esses perfis e devolve um cliente já logado. */
export async function entrarComo(...perfis: Perfil[]) {
  const u = await criarUsuario(perfis)
  const r = await cliente()('POST', '/api/entrar', { login: u.login, senha: SENHA })
  return Object.assign(cliente(r.cookie.split(';')[0]), { usuario: u })
}

export const PACIENTE = { nome: 'Fulano de Teste', nascimento: '1990-01-01' }
