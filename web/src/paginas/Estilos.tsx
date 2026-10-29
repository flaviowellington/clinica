// TEMPORÁRIO: vitrine dos componentes globais para comparar as paletas. Apagar junto com o
// SeletorPaleta do main.tsx quando a paleta for escolhida.
import type { CSSProperties, ReactNode } from 'react'
import { CampoSelect } from '../componentes/CampoSelect'

const CORES = [
  'primaria',
  'secundaria',
  'destaque',
  'sucesso',
  'aviso',
  'perigo',
  'info',
  'titulo',
  'texto',
  'suave',
  'borda',
  'superficie-2',
  'fundo',
]

function Secao(props: { titulo: string; children: ReactNode }) {
  return (
    <section className="cartao space-y-4">
      <h2 className="text-lg">{props.titulo}</h2>
      {props.children}
    </section>
  )
}

export function Estilos() {
  return (
    <div className="space-y-6 pb-20">
      <header>
        <h1>Guia de estilo</h1>
        <p className="subtitulo">
          Use o seletor no rodapé para trocar a paleta e o modo claro/escuro.
        </p>
      </header>

      <Secao titulo="Cores">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-7">
          {CORES.map((c) => (
            <div key={c} className="space-y-1">
              <div
                className="h-14 rounded-xl border border-borda"
                style={{ background: `var(--${c})` }}
              />
              <p className="text-xs text-suave">{c}</p>
            </div>
          ))}
        </div>
      </Secao>

      <Secao titulo="Tipografia">
        <p className="titulo">Título (h1 / .titulo)</p>
        <h2 className="text-xl">Cabeçalho (h2)</h2>
        <h3>Cabeçalho menor (h3)</h3>
        <p className="subtitulo">Subtítulo: texto de apoio logo abaixo do título.</p>
        <p>
          Corpo: a consulta de retorno da Ana Fictícia foi marcada para terça às 14h.{' '}
          <a className="link" href="#">
            Isto é um link
          </a>
          .
        </p>
        <p className="text-suave">Texto suave para detalhes e datas.</p>
      </Secao>

      <Secao titulo="Botões">
        <div className="flex flex-wrap items-center gap-3">
          <button className="botao">Primário</button>
          <button className="botao-secundario">Secundário</button>
          <button className="botao-leve">Contorno</button>
          <button className="botao-fantasma">Fantasma</button>
          <button className="botao-perigo">Excluir</button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="botao" disabled>
            Primário inativo
          </button>
          <button className="botao-secundario" disabled>
            Secundário inativo
          </button>
          <button className="botao-leve" disabled>
            Contorno inativo
          </button>
          <button className="botao-fantasma" disabled>
            Fantasma inativo
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="botao botao-pequeno">Pequeno</button>
          <button className="botao-leve botao-pequeno">Pequeno</button>
          <button className="botao botao-icone" title="Adicionar">
            +
          </button>
          <button className="botao-leve botao-icone" title="Editar">
            ✎
          </button>
        </div>
      </Secao>

      <Secao titulo="Campos">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label>
            <span className="rotulo">Normal</span>
            <input className="campo" placeholder="Nome do paciente" />
            <span className="ajuda">Texto de ajuda do campo.</span>
          </label>
          <label>
            <span className="rotulo">Preenchido</span>
            <input className="campo" defaultValue="Ana Fictícia" />
          </label>
          <label>
            <span className="rotulo">Com erro</span>
            <input className="campo" aria-invalid defaultValue="000.000.000-00" />
            <span className="erro-campo">CPF inválido.</span>
          </label>
          <label>
            <span className="rotulo">Somente leitura</span>
            <input className="campo" readOnly defaultValue="Prontuário nº 1024" />
          </label>
          <label>
            <span className="rotulo">Inativo</span>
            <input className="campo" disabled placeholder="Sem permissão" />
          </label>
          <label>
            <span className="rotulo">Lista</span>
            <CampoSelect opcoes={['Dra. Fictícia', 'Dr. Exemplo']} />
          </label>
          <label className="sm:col-span-2 lg:col-span-3">
            <span className="rotulo">Observações</span>
            <textarea className="campo" rows={2} placeholder="Escreva aqui..." />
          </label>
        </div>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked /> Lembrar por WhatsApp
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="r" defaultChecked /> Particular
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="r" /> Convênio
          </label>
          <label className="flex items-center gap-2 text-desativado-texto">
            <input type="checkbox" disabled /> Inativo
          </label>
        </div>
      </Secao>

      <Secao titulo="Caixas de seleção">
        <div className="flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked /> Padrão
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="check-secundaria" defaultChecked /> Secundária
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="check-sucesso" defaultChecked /> Sucesso
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="check-aviso" defaultChecked /> Aviso
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="check-perigo" defaultChecked /> Perigo
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="check-info" defaultChecked /> Info
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              defaultChecked
              style={{ '--cor-check': '#FFD400', '--sobre-check': '#340972' } as CSSProperties}
            />{' '}
            Cor livre
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2">
            <input type="checkbox" /> Desmarcado
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              ref={(el) => {
                if (el) el.indeterminate = true
              }}
            />{' '}
            Parcial
          </label>
          <label className="flex items-center gap-2 text-desativado-texto">
            <input type="checkbox" disabled /> Inativo
          </label>
          <label className="flex items-center gap-2 text-desativado-texto">
            <input type="checkbox" disabled defaultChecked /> Inativo marcado
          </label>
        </div>
      </Secao>

      <Secao titulo="Etiquetas (spans)">
        <div className="flex flex-wrap gap-2">
          <span className="etiqueta">Neutra</span>
          <span className="etiqueta etiqueta-primaria">Agendado</span>
          <span className="etiqueta etiqueta-secundaria">Novo</span>
          <span className="etiqueta etiqueta-sucesso">Pago</span>
          <span className="etiqueta etiqueta-aviso">Pendente</span>
          <span className="etiqueta etiqueta-perigo">Faltou</span>
          <span className="etiqueta etiqueta-info">Em aberto</span>
        </div>
      </Secao>

      <Secao titulo="Alertas">
        <div className="space-y-2">
          <p className="alerta-info">O paciente tem um orçamento em aberto.</p>
          <p className="alerta-sucesso">Pagamento registrado.</p>
          <p className="alerta-aviso">Anamnese desatualizada há mais de 6 meses.</p>
          <p className="alerta-perigo">Alergia a penicilina.</p>
        </div>
      </Secao>

      <Secao titulo="Cartões e bloqueios">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="cartao">
            <h3>Cartão</h3>
            <p className="text-suave">Superfície padrão.</p>
          </div>
          <div className="cartao-destaque">
            <h3>Cartão em destaque</h3>
            <p className="text-suave">Para avisos da tela inicial.</p>
          </div>
          <div className="cartao inativo" aria-disabled>
            <h3>Sem acesso</h3>
            <p className="text-suave">Bloco que o perfil não pode usar.</p>
            <button className="botao mt-2">Abrir</button>
          </div>
        </div>
      </Secao>
    </div>
  )
}
