import { useState, type FormEvent, type ReactNode } from 'react'
import { COMO_CONHECEU, podeCadastrar } from '../../../shared/regras'
import { mascaraRg } from '../../../shared/mascaras'
import type { Paciente } from '../api'
import { CampoData } from './CampoData'
import { CampoCelular, CampoCpf, CampoEmail, CampoMascara } from './CampoMascara'
import { CampoSelect } from './CampoSelect'

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
  aoEnviar: (dados: Record<string, string>) => void
}) {
  const p = props.inicial ?? {}
  const [nome, setNome] = useState(p.nome ?? '')
  const [nascimento, setNascimento] = useState(p.nascimento ?? '')
  const [comoConheceu, setComoConheceu] = useState(p.comoConheceu ?? '')

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    // CPF incompleto ou inválido: mostra o aviso no campo e não envia.
    if (!form.checkValidity()) {
      form.querySelector<HTMLInputElement>(':invalid')?.focus()
      return
    }
    // Só o "+55 " no celular conta como vazio: o DTO da API trata.
    props.aoEnviar(Object.fromEntries(new FormData(form)) as Record<string, string>)
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

  return (
    <form onSubmit={enviar} className="space-y-6" noValidate>
      <Secao titulo="Dados pessoais">
        <label className="block sm:col-span-2">
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
        {campo('telefone', 'Telefone fixo', { type: 'tel' })}
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
        {campo('nomeMae', 'Nome da mãe')}
        {campo('nomePai', 'Nome do pai')}
        {campo('responsavelNome', 'Responsável legal')}
        {campo('responsavelParentesco', 'Parentesco do responsável')}
        <label className="block">
          <span className="rotulo">CPF do responsável</span>
          <CampoCpf
            name="responsavelCpf"
            defaultValue={p.responsavelCpf ?? ''}
            erro={props.erros.responsavelCpf}
          />
        </label>
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
      <div className="sticky bottom-0 -mx-5 -mb-5 flex items-center justify-between gap-3 border-t border-borda bg-superficie px-5 py-3">
        <span className="text-xs text-suave">* obrigatórios</span>
        <button className="botao" disabled={!podeCadastrar({ nome, nascimento }) || props.enviando}>
          {props.enviando ? 'Salvando…' : props.textoBotao}
        </button>
      </div>
    </form>
  )
}
