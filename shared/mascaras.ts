// Máscaras dos campos digitados (o usuário escreve corrido e os separadores aparecem).
// "apagando": quando o usuário apaga, o separador do fim não volta (senão o Backspace trava).

/** Corta em grupos e põe os separadores; o que sobra depois do último grupo vai como está. */
function agrupar(s: string, tamanhos: number[], seps: string[], apagando: boolean) {
  let saida = ''
  let i = 0
  for (const [g, t] of tamanhos.entries()) {
    saida += s.slice(i, i + t)
    i += t
    if (i > s.length || g >= seps.length || (i === s.length && apagando)) break
    saida += seps[g]
  }
  return saida + s.slice(i)
}

/** 000.000.000-00, só dígitos, no máximo 11. */
export const mascaraCpf = (valor: string, apagando = false) =>
  agrupar(valor.replace(/\D/g, '').slice(0, 11), [3, 3, 3, 2], ['.', '.', '-'], apagando)

/** 00.000.000, e com 9 caracteres 000.000.000; aceita letras e símbolos, o que passar fica como digitado. */
export function mascaraRg(valor: string, apagando = false) {
  const s = valor.replace(/\./g, '')
  // 9 letras/números seguidos (sem símbolo no meio) trocam para 000.000.000.
  return agrupar(s, /^[a-z0-9]{9}/i.test(s) ? [3, 3, 3] : [2, 3, 3], ['.', '.'], apagando)
}

/**
 * +55 (00) 00000-0000. O DDI começa em 55 e pode ser trocado; com 55 o número tem no
 * máximo 11 dígitos, com outro DDI vai até os 15 do padrão internacional.
 */
export function mascaraCelular(valor: string, apagando = false) {
  const m = /^\s*\+(\d*)\s*(.*)$/.exec(valor)
  const ddi = m ? m[1].slice(0, 3) : '55'
  const numero = (m ? m[2] : valor).replace(/\D/g, '').slice(0, ddi === '55' ? 11 : 15 - ddi.length)
  return `+${ddi} ${numero && '(' + agrupar(numero, [2, 5, 4], [') ', '-'], apagando)}`
}

/** Vazio ou só o DDI, sem número: o campo conta como vazio. */
export const celularVazio = (valor: string) => /^\s*(\+\d*)?\s*\(?\s*$/.test(valor)
