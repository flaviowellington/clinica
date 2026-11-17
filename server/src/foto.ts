// Foto de perfil (profissional, paciente, usuário): recebe, recorta e reduz com o sharp.
import type { Request, RequestHandler, Response } from 'express'
import multer from 'multer'
import sharp from 'sharp'

const FOTO_LADO = 400
const FOTO_MAXIMO_MB = 10
const FORMATOS_FOTO = ['jpeg', 'png', 'webp', 'gif', 'tiff']

// Em memória: a foto vai para o banco já tratada, nada fica em disco.
const multerFoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: FOTO_MAXIMO_MB * 1024 * 1024, files: 1 },
}).single('foto')

export const receberFoto: RequestHandler = (req, res, next) =>
  multerFoto(req, res, (e: unknown) => {
    if (!e) return next()
    const grande = e instanceof multer.MulterError && e.code === 'LIMIT_FILE_SIZE'
    res.status(400).json({
      erro: grande
        ? `A foto pode ter no máximo ${FOTO_MAXIMO_MB} MB.`
        : 'Não foi possível receber a foto.',
    })
  })

/**
 * Corta o quadrado escolhido na tela (x, y, tamanho em pixels da imagem original),
 * reduz para 400x400 e devolve em WebP. Com problema, responde 400 e devolve null.
 */
export async function tratarFoto(
  req: Request,
  res: Response,
): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!req.file) return (res.status(400).json({ erro: 'Escolha uma foto.' }), null)

  const erroImagem = { erro: 'Envie uma imagem JPEG, PNG ou WEBP.' }
  const meta = await sharp(req.file.buffer)
    .metadata()
    .catch(() => null)
  if (!meta?.width || !meta.height || !FORMATOS_FOTO.includes(meta.format ?? ''))
    return (res.status(400).json(erroImagem), null)
  // Foto de celular deitada pelo EXIF: a tela mostrou já em pé, então as medidas trocam.
  const deitada = (meta.orientation ?? 1) >= 5
  const largura = deitada ? meta.height : meta.width
  const altura = deitada ? meta.width : meta.height

  const [x, y, tamanho] = ['x', 'y', 'tamanho'].map((k) => Math.round(Number(req.body?.[k])))
  if (
    ![x, y, tamanho].every(Number.isFinite) ||
    x < 0 ||
    y < 0 ||
    tamanho < 1 ||
    x + tamanho > largura ||
    y + tamanho > altura
  )
    return (res.status(400).json({ erro: 'Recorte fora da imagem.' }), null)

  const foto = await sharp(req.file.buffer)
    .rotate() // endireita pelo EXIF antes de cortar
    .extract({ left: x, top: y, width: tamanho, height: tamanho })
    .resize(FOTO_LADO, FOTO_LADO)
    .webp({ quality: 82 })
    .toBuffer()
    .catch(() => null)
  if (!foto) return (res.status(400).json(erroImagem), null)
  return new Uint8Array(foto)
}

/** Devolve a foto guardada (ou 404). A URL muda a cada foto nova (?v=fotoEm), então o cache pode ser longo. */
export function mandarFoto(res: Response, foto: Uint8Array | null | undefined) {
  if (!foto) return res.status(404).json({ erro: 'Sem foto.' })
  res.type('image/webp').set('Cache-Control', 'private, max-age=31536000, immutable')
  res.send(Buffer.from(foto))
}
