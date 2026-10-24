import { useState, type FormEvent } from 'react'
import { COMO_CONHECEU, podeCadastrar } from '../../../shared/regras'
import { cpfBR, type Paciente } from '../api'
import { CampoData } from './CampoData'

const ABAS = ['Dados cadastrais', 'Contato', 'Dados complementares'] as const

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
  const [aba, setAba] = useState(0)
  const [nome, setNome] = useState(p.nome ?? '')
  const [nascimento, setNascimento] = useState(p.nascimento ?? '')
  const [comoConheceu, setComoConheceu] = useState(p.comoConheceu ?? '')

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    props.aoEnviar(Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>)
  }

  const campo = (nomeCampo: keyof Paciente, rotulo: string, extra: object = {}) => (
    <label className="block">
      <span className="rotulo">{rotulo}</span>
      <input
        name={nomeCampo}
        defaultValue={
          nomeCampo === 'cpf' || nomeCampo === 'responsavelCpf'
            ? cpfBR(p[nomeCampo] ?? null)
            : String(p[nomeCampo] ?? '')
        }
        className="campo"
        aria-invalid={!!props.erros[nomeCampo]}
        {...extra}
      />
      {props.erros[nomeCampo] && <span className="text-perigo">{props.erros[nomeCampo]}</span>}
    </label>
  )

  const opcoes = (lista: readonly string[]) => (
    <>
      <option value="">—</option>
      {lista.map((o) => (
        <option key={o}>{o}</option>
      ))}
    </>
  )

  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      <div role="tablist" className="flex gap-1 border-b border-borda">
        {ABAS.map((t, i) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={aba === i}
            onClick={() => setAba(i)}
            className={`-mb-px border-b-2 px-3 py-2 ${aba === i ? 'border-primaria font-medium text-primaria' : 'border-transparent text-suave'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* As três abas ficam sempre no formulário (só escondidas), para o FormData levar tudo. */}
      <div hidden={aba !== 0} className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="rotulo">Nome *</span>
          <input
            name="nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="campo"
            autoFocus
          />
          {props.erros.nome && <span className="text-perigo">{props.erros.nome}</span>}
        </label>
        <label className="block">
          <span className="rotulo">Data de nascimento *</span>
          <CampoData name="nascimento" value={nascimento} onChange={setNascimento} />
          {props.erros.nascimento && <span className="text-perigo">{props.erros.nascimento}</span>}
        </label>
        {campo('apelido', 'Apelido')}
        {campo('cpf', 'CPF', { inputMode: 'numeric', placeholder: '000.000.000-00' })}
        {campo('rg', 'RG')}
        <label className="block">
          <span className="rotulo">Sexo</span>
          <select name="sexo" defaultValue={p.sexo ?? ''} className="campo">
            {opcoes(['Feminino', 'Masculino', 'Outro'])}
          </select>
        </label>
        <label className="block">
          <span className="rotulo">Estado civil</span>
          <select name="estadoCivil" defaultValue={p.estadoCivil ?? ''} className="campo">
            {opcoes(['Solteiro(a)', 'Casado(a)', 'União estável', 'Divorciado(a)', 'Viúvo(a)'])}
          </select>
        </label>
      </div>

      <div hidden={aba !== 1} className="grid gap-3 sm:grid-cols-2">
        {campo('celular', 'Celular / WhatsApp', { type: 'tel', placeholder: '+55 ' })}
        {campo('telefone', 'Telefone fixo', { type: 'tel' })}
        <div className="sm:col-span-2">{campo('email', 'E-mail', { type: 'email' })}</div>
        <label className="block">
          <span className="rotulo">Como conheceu a clínica?</span>
          <select
            name="comoConheceu"
            value={comoConheceu}
            onChange={(e) => setComoConheceu(e.target.value)}
            className="campo"
          >
            {opcoes(COMO_CONHECEU)}
          </select>
        </label>
        <div hidden={comoConheceu !== 'Indicado por'}>{campo('indicadoPor', 'Indicado por')}</div>
      </div>

      <div hidden={aba !== 2} className="grid gap-3 sm:grid-cols-2">
        {campo('nomeMae', 'Nome da mãe')}
        {campo('nomePai', 'Nome do pai')}
        {campo('responsavelNome', 'Responsável legal')}
        {campo('responsavelParentesco', 'Parentesco do responsável')}
        {campo('responsavelCpf', 'CPF do responsável', { inputMode: 'numeric' })}
        <label className="block sm:col-span-2">
          <span className="rotulo">Observações</span>
          <textarea
            name="observacoes"
            defaultValue={p.observacoes ?? ''}
            rows={3}
            className="campo"
          />
        </label>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-suave">* obrigatórios</span>
        <button className="botao" disabled={!podeCadastrar({ nome, nascimento }) || props.enviando}>
          {props.enviando ? 'Salvando…' : props.textoBotao}
        </button>
      </div>
    </form>
  )
}
