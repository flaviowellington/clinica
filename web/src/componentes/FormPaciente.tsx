import { useState, type FormEvent, type ReactNode } from 'react'
import { COMO_CONHECEU, podeCadastrar } from '../../../shared/regras'
import { mascaraRg } from '../../../shared/mascaras'
import type { Paciente } from '../api'
import { CampoData } from './CampoData'
import { CampoCelular, CampoCpf, CampoEmail, CampoMascara } from './CampoMascara'
import { CampoSelect } from './CampoSelect'
import { Icone } from './Icones'
import { FotoPerfil, urlFoto, type FotoPendente } from './FotoPerfil'

/** Bloco do formulário com título; tudo fica numa página só, sem abas. */
function Secao(props: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-x-3 gap-y-4 sm:grid-cols-2">
      <legend className="mb-3 flex w-full items-center gap-3 text-xs font-bold tracking-wide text-suave uppercase after:h-px after:flex-1 after:bg-borda">
        {props.titulo}
      </legend>
      {props.children}
    </fieldset>
  )
}

/**
 * Cadastro e edição do paciente (R-001 e R-067).
 * Lê o formulário com FormData; o botão só habilita com nome e nascimento.
 */
export function FormPaciente(props: {
  inicial?: Partial<Paciente>
  textoBotao: string
  enviando: boolean
  erros: Record<string, string>
  /** A foto vai à parte: quem chama grava depois do cadastro (salvarFoto). */
  aoEnviar: (dados: Record<string, string>, foto: FotoPendente) => void
}) {
  const p = props.inicial ?? {}
  const [nome, setNome] = useState(p.nome ?? '')
  const [nascimento, setNascimento] = useState(p.nascimento ?? '')
  const [comoConheceu, setComoConheceu] = useState(p.comoConheceu ?? '')
  const [foto, setFoto] = useState<FotoPendente>(null)

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    // CPF incompleto ou inválido: mostra o aviso no campo e não envia.
    if (!form.checkValidity()) {
      form.querySelector<HTMLInputElement>(':invalid')?.focus()
      return
    }
    // Só o "+55 " no celular conta como vazio: o DTO da API trata.
    props.aoEnviar(Object.fromEntries(new FormData(form)) as Record<string, string>, foto)
  }

  const erro = (c: string) => props.erros[c] && <span className="erro-campo">{props.erros[c]}</span>

  const campo = (nomeCampo: keyof Paciente, rotulo: string, extra: object = {}) => (
    <label className="block">
      <span className="rotulo">{rotulo}</span>
      <input
        name={nomeCampo}
        defaultValue={String(p[nomeCampo] ?? '')}
        className="campo"
        aria-invalid={!!props.erros[nomeCampo]}
        {...extra}
      />
      {erro(nomeCampo)}
    </label>
  )

  const cpf = (nomeCampo: 'cpfMae' | 'cpfPai' | 'responsavelCpf', rotulo: string) => (
    <label className="block">
      <span className="rotulo">{rotulo}</span>
      <CampoCpf name={nomeCampo} defaultValue={p[nomeCampo] ?? ''} erro={props.erros[nomeCampo]} />
    </label>
  )

  return (
    <form onSubmit={enviar} className="space-y-6" noValidate>
      <Secao titulo="Dados pessoais">
        <div className="flex items-end gap-4 sm:col-span-2">
          <FotoPerfil
            lado={64}
            src={foto === 'remover' ? null : urlFoto(`/pacientes/${p.id}`, p.fotoEm)}
            nova={foto === 'remover' ? null : foto}
            vazio={
              <span className="grid size-full place-items-center rounded-full bg-primaria-clara text-primaria">
                <Icone nome="foto" className="size-6" />
              </span>
            }
            podeEditar
            aoEscolher={setFoto}
            aoRemover={() => setFoto('remover')}
          />
          <label className="block min-w-0 flex-1">
            <span className="rotulo">Nome *</span>
            <input
              name="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="campo"
              aria-invalid={!!props.erros.nome}
              autoFocus
            />
            {erro('nome')}
          </label>
        </div>
        <label className="block">
          <span className="rotulo">Data de nascimento *</span>
          <CampoData name="nascimento" value={nascimento} onChange={setNascimento} />
          {erro('nascimento')}
        </label>
        {campo('apelido', 'Apelido')}
        <label className="block">
          <span className="rotulo">CPF</span>
          <CampoCpf name="cpf" defaultValue={p.cpf ?? ''} erro={props.erros.cpf} />
        </label>
        <label className="block">
          <span className="rotulo">RG</span>
          <CampoMascara
            name="rg"
            mascara={mascaraRg}
            defaultValue={p.rg ?? ''}
            maxLength={20}
            placeholder="00.000.000"
            erro={props.erros.rg}
          />
        </label>
        <label className="block">
          <span className="rotulo">Sexo</span>
          <CampoSelect
            name="sexo"
            defaultValue={p.sexo ?? ''}
            opcoes={['Feminino', 'Masculino', 'Outro']}
          />
        </label>
        <label className="block">
          <span className="rotulo">Estado civil</span>
          <CampoSelect
            name="estadoCivil"
            defaultValue={p.estadoCivil ?? ''}
            opcoes={['Solteiro(a)', 'Casado(a)', 'União estável', 'Divorciado(a)', 'Viúvo(a)']}
          />
        </label>
      </Secao>

      <Secao titulo="Contato">
        <label className="block">
          <span className="rotulo">Celular / WhatsApp</span>
          <CampoCelular name="celular" defaultValue={p.celular ?? ''} erro={props.erros.celular} />
        </label>
        <label className="block sm:col-span-2">
          <span className="rotulo">E-mail</span>
          <CampoEmail name="email" defaultValue={p.email ?? ''} erro={props.erros.email} />
        </label>
        <label className="block">
          <span className="rotulo">Como conheceu a clínica?</span>
          <CampoSelect
            name="comoConheceu"
            value={comoConheceu}
            onChange={(e) => setComoConheceu(e.target.value)}
            opcoes={COMO_CONHECEU}
          />
        </label>
        {/* Só vai no formulário o campo visível; os outros chegam vazios e são limpos. */}
        {comoConheceu === 'Indicado por' && campo('indicadoPor', 'Quem indicou?')}
        {comoConheceu === 'Outros' && campo('comoConheceuOutro', 'Como foi?', { maxLength: 150 })}
      </Secao>

      <Secao titulo="Família e responsável">
        {/* Cada nome com o CPF ao lado; no celular, um embaixo do outro. */}
        {campo('nomeMae', 'Nome da mãe')}
        {cpf('cpfMae', 'CPF da mãe')}
        {campo('nomePai', 'Nome do pai')}
        {cpf('cpfPai', 'CPF do pai')}
        {campo('responsavelNome', 'Responsável legal')}
        {cpf('responsavelCpf', 'CPF do responsável')}
        {campo('responsavelParentesco', 'Parentesco do responsável legal')}
      </Secao>

      <Secao titulo="Observações">
        <label className="block sm:col-span-2">
          <span className="sr-only">Observações</span>
          <textarea
            name="observacoes"
            defaultValue={p.observacoes ?? ''}
            rows={3}
            className="campo"
            placeholder="Algo importante sobre o paciente"
          />
        </label>
      </Secao>

      {/* Rodapé fixo: o botão de salvar fica sempre à vista enquanto rola o formulário. */}
      <div className="rodape-janela justify-between gap-3">
        <span className="text-xs text-suave">* obrigatórios</span>
        <button className="botao" disabled={!podeCadastrar({ nome, nascimento }) || props.enviando}>
          {props.enviando ? 'Salvando…' : props.textoBotao}
        </button>
      </div>
    </form>
  )
}
