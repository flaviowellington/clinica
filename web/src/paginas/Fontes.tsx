// TEMPORÁRIO: comparar fontes para o sistema. Apagar (e desinstalar as @fontsource que
// não forem escolhidas) quando a fonte for decidida.
import '@fontsource/m-plus-rounded-1c/latin-400.css'
import '@fontsource/m-plus-rounded-1c/latin-700.css'
import '@fontsource/m-plus-rounded-1c/latin-800.css'
import '@fontsource/quicksand/latin-400.css'
import '@fontsource/quicksand/latin-700.css'
import '@fontsource/varela-round/latin-400.css'
import '@fontsource/comfortaa/latin-400.css'
import '@fontsource/comfortaa/latin-700.css'
import '@fontsource/fredoka/latin-400.css'
import '@fontsource/fredoka/latin-600.css'
import '@fontsource/baloo-2/latin-400.css'
import '@fontsource/baloo-2/latin-700.css'
import '@fontsource/baloo-2/latin-800.css'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-700.css'
import '@fontsource/inter/latin-800.css'

const FONTES = [
  {
    nome: 'M PLUS Rounded 1c',
    familia: "'M PLUS Rounded 1c'",
    nota: 'A fonte do manual da marca.',
  },
  {
    nome: 'Nunito',
    familia: "'Nunito'",
    nota: 'Fonte atual do sistema. Arredondada discreta, legível em tabelas.',
  },
  { nome: 'Quicksand', familia: "'Quicksand'", nota: 'Leve e geométrica, cantos bem redondos.' },
  { nome: 'Varela Round', familia: "'Varela Round'", nota: 'Simples e amigável; só tem um peso.' },
  { nome: 'Comfortaa', familia: "'Comfortaa'", nota: 'A mais redonda e lúdica; letras largas.' },
  { nome: 'Fredoka', familia: "'Fredoka'", nota: 'Gordinha e divertida, com cara infantil.' },
  { nome: 'Baloo 2', familia: "'Baloo 2'", nota: 'Encorpada e alegre, boa para títulos.' },
  {
    nome: 'Inter',
    familia: "'Inter'",
    nota: 'No lugar da Helvetica: mesmo estilo neutro e reto, gratuita e igual em qualquer computador.',
  },
]

export function Fontes() {
  return (
    <div className="space-y-6 pb-20">
      <header>
        <h1>Fontes</h1>
        <p className="subtitulo">
          Cada cartão mostra a mesma hierarquia de texto em uma fonte diferente.
        </p>
      </header>
      <div className="grid gap-4 lg:grid-cols-2">
        {FONTES.map((f) => (
          <section key={f.nome} className="cartao space-y-3" style={{ fontFamily: f.familia }}>
            <div className="flex items-baseline justify-between gap-2 border-b border-borda pb-2">
              <span className="etiqueta etiqueta-primaria">{f.nome}</span>
              <span className="text-right text-xs text-suave">{f.nota}</span>
            </div>
            <h1 className="text-3xl">Agenda da semana</h1>
            <h2 className="text-xl">Pacientes de hoje</h2>
            <h3 className="text-base">Retornos pendentes</h3>
            <p className="subtitulo">Consultas confirmadas para quinta-feira, 30 de outubro.</p>
            <p>
              A consulta de retorno da Ana Fictícia foi marcada para terça às 14h. Lembrar a
              responsável de trazer a carteirinha do convênio. 0123456789 R$ 1.250,00
            </p>
            <p className="text-suave">Atualizado há 5 minutos por Dra. Exemplo.</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button className="botao">Agendar</button>
              <button className="botao-leve">Cancelar</button>
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
