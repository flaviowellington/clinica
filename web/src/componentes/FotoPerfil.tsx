import { useEffect, useRef, useState, type ReactNode } from 'react'
import { api, mensagemDeErro } from '../api'
import { avisar } from '../estado'
import { Dialogo } from './Dialogo'
import { Icone } from './Icones'
import { FotoRecortada, LADO_FINAL, RecorteFoto, type FotoNova } from './RecorteFoto'

export const FOTO_MAXIMO_MB = 10

/** Foto escolhida no formulário: nova (enviada ao salvar), 'remover' ou nada mudou. */
export type FotoPendente = FotoNova | 'remover' | null

/** Grava a foto pendente em `${base}/foto` (ex.: /pacientes/12). */
export async function salvarFoto(base: string, foto: FotoPendente) {
  if (foto === 'remover') return (await api.delete(`${base}/foto`)).data
  if (!foto) return
  const f = new FormData()
  f.append('foto', foto.arquivo)
  for (const [k, v] of Object.entries(foto.recorte)) f.append(k, String(v))
  return (await api.post(`${base}/foto`, f)).data
}

/** Logo depois de criar o cadastro: se a foto falhar, avisa mas não desfaz o cadastro (nem deixa criar duplicado). */
export const salvarFotoDoNovo = (base: string, foto: FotoPendente) =>
  salvarFoto(base, foto).catch((e) => {
    avisar(`Cadastro salvo, mas a foto não: ${mensagemDeErro(e)}`, true)
  })

/** URL da foto guardada; o ?v= muda a cada foto nova, então o cache nunca mostra a antiga. */
export const urlFoto = (base: string, fotoEm: string | null | undefined) =>
  fotoEm ? `/api${base}/foto?v=${encodeURIComponent(fotoEm)}` : null

type Etapa = 'origem' | 'camera' | 'ver' | File | null

/**
 * Foto de perfil clicável: no hover fica cinza com o ícone de câmera.
 * Com foto, o clique abre "Ver foto" / "Alterar foto"; sem foto, vai direto para escolher.
 * Alterar: arquivo do computador ou câmera (webcam), depois o recorte.
 */
export function FotoPerfil(props: {
  /** Foto guardada no servidor (urlFoto). */
  src: string | null
  /** Foto escolhida e ainda não enviada: aparece no lugar da guardada. */
  nova?: FotoNova | null
  /** O que aparece sem foto (iniciais). Recebe o tamanho e a forma pelo className. */
  vazio: ReactNode
  /** Lado em px. */
  lado: number
  /** Forma, ex.: 'rounded-full'. */
  className?: string
  podeEditar: boolean
  aoEscolher: (f: FotoNova) => void
  aoRemover?: () => void
}) {
  const [menu, setMenu] = useState(false)
  const [etapa, setEtapa] = useState<Etapa>(null)
  const caixa = useRef<HTMLDivElement>(null)
  const temFoto = !!props.nova || !!props.src
  const forma = props.className ?? 'rounded-full'

  // Clique fora fecha o menu.
  useEffect(() => {
    if (!menu) return
    const fechar = (e: PointerEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setMenu(false)
    }
    document.addEventListener('pointerdown', fechar)
    return () => document.removeEventListener('pointerdown', fechar)
  }, [menu])

  const imagem = (lado: number) =>
    props.nova ? (
      <FotoRecortada foto={props.nova} lado={lado} className={forma} />
    ) : props.src ? (
      <img
        src={props.src}
        alt=""
        className={`shrink-0 object-cover ${forma}`}
        style={{ width: lado, height: lado }}
      />
    ) : null

  const clicar = () => {
    if (temFoto && props.podeEditar) setMenu(!menu)
    else if (temFoto) setEtapa('ver')
    else setEtapa('origem')
  }
  const opcao = 'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-superficie-2'

  if (!temFoto && !props.podeEditar)
    return <span style={{ width: props.lado, height: props.lado }}>{props.vazio}</span>

  return (
    <div
      ref={caixa}
      className="relative shrink-0"
      style={{ width: props.lado, height: props.lado }}
    >
      <button
        type="button"
        onClick={clicar}
        aria-haspopup={temFoto && props.podeEditar ? 'menu' : 'dialog'}
        aria-expanded={menu}
        aria-label={temFoto ? 'Foto de perfil: ver ou alterar' : 'Adicionar foto de perfil'}
        title={temFoto ? 'Ver ou alterar foto' : 'Adicionar foto'}
        className={`group relative block size-full overflow-hidden ${forma} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primaria`}
      >
        {imagem(props.lado) ?? props.vazio}
        <span
          aria-hidden
          className="absolute inset-0 grid place-items-center bg-neutral-800/55 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <Icone nome="foto" className={props.lado >= 56 ? 'size-6' : 'size-4'} />
        </span>
      </button>

      {menu && (
        <div
          role="menu"
          className="absolute top-full left-0 z-30 mt-2 w-44 overflow-hidden rounded-xl border border-borda bg-superficie py-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            className={opcao}
            autoFocus
            onClick={() => (setMenu(false), setEtapa('ver'))}
          >
            <Icone nome="busca" className="size-4" />
            Ver foto
          </button>
          <button
            type="button"
            role="menuitem"
            className={opcao}
            onClick={() => (setMenu(false), setEtapa('origem'))}
          >
            <Icone nome="lapis" className="size-4" />
            Alterar foto
          </button>
          {props.aoRemover && (
            <button
              type="button"
              role="menuitem"
              className={`${opcao} text-perigo`}
              onClick={() => (setMenu(false), props.aoRemover!())}
            >
              <Icone nome="fechar" className="size-4" />
              Remover foto
            </button>
          )}
        </div>
      )}

      <Dialogo
        aberto={!!etapa}
        aoFechar={() => setEtapa(null)}
        titulo={
          etapa === 'ver'
            ? 'Foto de perfil'
            : etapa === 'camera'
              ? 'Tirar foto'
              : etapa instanceof File
                ? 'Ajustar foto'
                : 'Alterar foto'
        }
      >
        {etapa === 'ver' && (
          <div className="flex justify-center">
            {props.nova ? (
              <FotoRecortada
                foto={props.nova}
                lado={Math.min(LADO_FINAL, 320)}
                className="rounded-2xl"
              />
            ) : (
              <img
                src={props.src!}
                alt="Foto de perfil"
                className="aspect-square w-full max-w-[400px] rounded-2xl object-cover"
              />
            )}
          </div>
        )}
        {etapa === 'origem' && <Origem aoArquivo={setEtapa} aoCamera={() => setEtapa('camera')} />}
        {etapa === 'camera' && <Camera aoTirar={setEtapa} aoVoltar={() => setEtapa('origem')} />}
        {etapa instanceof File && (
          <RecorteFoto
            arquivo={etapa}
            aoCancelar={() => setEtapa('origem')}
            aoConfirmar={(f) => {
              props.aoEscolher(f)
              setEtapa(null)
            }}
          />
        )}
      </Dialogo>
    </div>
  )
}

function Origem(props: { aoArquivo: (f: File) => void; aoCamera: () => void }) {
  const cartao =
    'flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-borda p-5 text-center font-bold hover:border-primaria hover:bg-primaria-clara'
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label
          className={`${cartao} has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primaria`}
        >
          <Icone nome="pasta" className="size-8 text-primaria" />
          Selecionar arquivo
          {/* Sem name: não vai junto com os dados do formulário. */}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = '' // deixa escolher o mesmo arquivo de novo
              if (!f) return
              if (f.size > FOTO_MAXIMO_MB * 1024 * 1024)
                return avisar(`A foto pode ter no máximo ${FOTO_MAXIMO_MB} MB.`, true)
              props.aoArquivo(f)
            }}
          />
        </label>
        <button type="button" className={cartao} onClick={props.aoCamera}>
          <Icone nome="foto" className="size-8 text-primaria" />
          Usar câmera
        </button>
      </div>
      <p className="ajuda mt-0">JPEG, PNG ou WEBP até {FOTO_MAXIMO_MB} MB.</p>
    </div>
  )
}

/** Webcam do computador: mostra o vídeo e tira a foto num quadro. */
function Camera(props: { aoTirar: (f: File) => void; aoVoltar: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [cameraId, setCameraId] = useState('')
  const [erro, setErro] = useState(
    typeof navigator.mediaDevices?.getUserMedia === 'function'
      ? ''
      : 'Este navegador não dá acesso à câmera (é preciso abrir o sistema em https).',
  )
  const [pronta, setPronta] = useState(false)

  useEffect(() => {
    let fluxo: MediaStream | null = null
    let ativo = true
    if (!navigator.mediaDevices?.getUserMedia) return
    navigator.mediaDevices
      .getUserMedia({ video: cameraId ? { deviceId: { exact: cameraId } } : true, audio: false })
      .then(async (s) => {
        if (!ativo) return s.getTracks().forEach((t) => t.stop())
        fluxo = s
        video.current!.srcObject = s
        // Os nomes das câmeras só aparecem depois da permissão.
        const todas = await navigator.mediaDevices.enumerateDevices()
        if (ativo) setCameras(todas.filter((d) => d.kind === 'videoinput'))
      })
      .catch((e: DOMException) =>
        setErro(
          e.name === 'NotAllowedError'
            ? 'O acesso à câmera foi negado. Libere a câmera para este site no navegador.'
            : e.name === 'NotFoundError'
              ? 'Nenhuma câmera encontrada neste computador.'
              : 'Não foi possível abrir a câmera. Ela pode estar em uso por outro programa.',
        ),
      )
    // Fecha a câmera ao sair (a luz da webcam apaga).
    return () => {
      ativo = false
      fluxo?.getTracks().forEach((t) => t.stop())
    }
  }, [cameraId])

  const tirar = () => {
    const v = video.current!
    const c = document.createElement('canvas')
    c.width = v.videoWidth
    c.height = v.videoHeight
    const g = c.getContext('2d')!
    // Espelhada como na tela, para sair igual ao que a pessoa viu.
    g.translate(c.width, 0)
    g.scale(-1, 1)
    g.drawImage(v, 0, 0)
    c.toBlob(
      (b) => b && props.aoTirar(new File([b], 'camera.jpg', { type: 'image/jpeg' })),
      'image/jpeg',
      0.92,
    )
  }

  return (
    <div className="space-y-4">
      {erro ? (
        <p className="alerta-perigo">{erro}</p>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-black">
          <video
            ref={video}
            autoPlay
            playsInline
            muted
            onLoadedData={() => setPronta(true)}
            className="aspect-video w-full -scale-x-100 object-contain"
          />
        </div>
      )}
      {cameras.length > 1 && (
        <label className="block">
          <span className="rotulo">Câmera</span>
          <select
            className="campo"
            value={cameraId || cameras[0]?.deviceId}
            onChange={(e) => {
              setPronta(false)
              setErro('')
              setCameraId(e.target.value)
            }}
          >
            {cameras.map((c, i) => (
              <option key={c.deviceId} value={c.deviceId}>
                {c.label || `Câmera ${i + 1}`}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex justify-end gap-2 border-t border-borda pt-4">
        <button type="button" className="botao-leve" onClick={props.aoVoltar}>
          Voltar
        </button>
        <button type="button" className="botao" disabled={!pronta || !!erro} onClick={tirar}>
          <Icone nome="foto" className="size-4" />
          Tirar foto
        </button>
      </div>
    </div>
  )
}
