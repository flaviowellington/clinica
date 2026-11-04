// Editor de código com cores (tema escuro no estilo dos editores de código), sem biblioteca:
// um <textarea> transparente por cima de um <pre> colorido, rolando juntos.
import { useRef, type ReactNode } from 'react'

export type LinguagemEditor = 'sql' | 'python'

const COR = {
  comentario: '#6a9955',
  texto: '#ce9178',
  numero: '#b5cea8',
  palavra: '#569cd6',
  controle: '#c586c0',
  funcao: '#dcdcaa',
  nome: '#9cdcfe',
}
const PALAVRAS: Record<LinguagemEditor, string> = {
  sql: 'select|from|where|group|by|order|having|limit|offset|as|and|or|not|in|is|null|like|between|case|when|then|else|end|join|left|right|inner|outer|cross|on|distinct|union|all|with|asc|desc|integer|real|text|over|partition|true|false',
  python:
    'def|return|for|in|if|elif|else|while|break|continue|and|or|not|is|None|True|False|lambda|import|from|as|with|try|except|finally|raise|pass|class|yield|global|nonlocal|del|assert',
}
/** Em Python, como nos editores: estas em azul; o resto das palavras-chave (fluxo) em roxo. */
const AZUL_PY = new Set('def class lambda None True False and or not in is'.split(' '))

const REGRA: Record<LinguagemEditor, RegExp> = {
  sql: new RegExp(
    String.raw`(--[^\n]*|/\*[\s\S]*?(?:\*/|$))|('(?:[^']|'')*'?|"[^"\n]*"?)|(\b\d+(?:\.\d+)?\b)|(\b(?:${PALAVRAS.sql})\b)|(\b[a-z_]\w*(?=\s*\())|(\b[a-z_]\w*\b)`,
    'gi',
  ),
  python: new RegExp(
    String.raw`(#[^\n]*)|("""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|[rfb]?"(?:\\.|[^"\\\n])*"?|[rfb]?'(?:\\.|[^'\\\n])*'?)|(\b\d+(?:\.\d+)?\b)|(\b(?:${PALAVRAS.python})\b)|(\b[A-Za-z_]\w*(?=\s*\())|(\b[A-Za-z_]\w*\b)`,
    'g',
  ),
}

export function colorir(fonte: string, ling: LinguagemEditor): ReactNode[] {
  const partes: ReactNode[] = []
  let i = 0
  for (const m of fonte.matchAll(REGRA[ling])) {
    if (m.index > i) partes.push(fonte.slice(i, m.index))
    const cor = m[1]
      ? COR.comentario
      : m[2]
        ? COR.texto
        : m[3]
          ? COR.numero
          : m[4]
            ? ling === 'python' && !AZUL_PY.has(m[4])
              ? COR.controle
              : COR.palavra
            : m[5]
              ? COR.funcao
              : COR.nome
    partes.push(
      <span key={m.index} style={{ color: cor }}>
        {m[0]}
      </span>,
    )
    i = m.index + m[0].length
  }
  partes.push(fonte.slice(i))
  return partes
}

export function EditorCodigo(props: {
  id: string
  rotulo: string
  valor: string
  linguagem: LinguagemEditor
  aoMudar: (v: string) => void
  /** Ctrl+Enter. */
  aoRodar?: () => void
}) {
  const pre = useRef<HTMLPreElement>(null)
  const numeros = useRef<HTMLDivElement>(null)
  const linhas = props.valor.split('\n').length
  // execCommand mantém o Ctrl+Z do navegador funcionando (setar o value direto apaga o histórico).
  const inserir = (t: string) => document.execCommand('insertText', false, t)

  return (
    <div className="relative flex h-80 min-h-40 resize-y overflow-hidden rounded-xl border border-borda bg-[#1e1e1e] font-mono text-[13px] leading-5 focus-within:ring-2 focus-within:ring-primaria">
      <div
        ref={numeros}
        aria-hidden="true"
        className="w-11 shrink-0 overflow-hidden border-r border-white/10 py-3 pr-2.5 text-right text-[#858585] select-none"
      >
        {Array.from({ length: linhas }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <div className="relative min-w-0 flex-1">
        <pre
          ref={pre}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 m-0 overflow-hidden p-3 whitespace-pre text-[#d4d4d4]"
        >
          {colorir(props.valor, props.linguagem)}
          {'\n'}
        </pre>
        <textarea
          id={props.id}
          aria-label={props.rotulo}
          aria-describedby={`${props.id}-dica`}
          value={props.valor}
          onChange={(e) => props.aoMudar(e.target.value)}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          wrap="off"
          onScroll={(e) => {
            pre.current!.scrollTop = e.currentTarget.scrollTop
            pre.current!.scrollLeft = e.currentTarget.scrollLeft
            numeros.current!.scrollTop = e.currentTarget.scrollTop
          }}
          onKeyDown={(e) => {
            const ta = e.currentTarget
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              props.aoRodar?.()
            } else if (e.key === 'Enter') {
              // Mantém o recuo da linha; em Python, depois de ":" entra mais um nível.
              const antes = ta.value.slice(0, ta.selectionStart)
              const linha = antes.slice(antes.lastIndexOf('\n') + 1)
              let recuo = linha.match(/^[ \t]*/)![0]
              if (props.linguagem === 'python' && /:\s*$/.test(linha)) recuo += '    '
              e.preventDefault()
              inserir(`\n${recuo}`)
            } else if (e.key === 'Tab' && !e.shiftKey) {
              e.preventDefault()
              inserir('    ')
            } else if (e.key === 'Escape') {
              // Esc só sai do editor (não fecha a janela e não perde o código); o próximo Esc fecha.
              e.preventDefault()
              e.stopPropagation()
              ta.blur()
            }
          }}
          className="absolute inset-0 h-full w-full resize-none overflow-auto bg-transparent p-3 whitespace-pre text-transparent caret-white outline-none selection:bg-white/25"
        />
      </div>
      <p id={`${props.id}-dica`} className="sr-only">
        Tab insere espaços. Esc sai do editor. Ctrl+Enter testa o código.
      </p>
    </div>
  )
}
