/**
 * Tipos da pilha de camadas do motor de render.
 *
 * Um template devolve `Layer[]` ordenada (de baixo p/ cima). O motor compõe:
 *  - `photo`: processada via sharp (fetch + resize + focal + blur + tint + mask).
 *  - `vector`: renderizada via satori (fundo transparente) → resvg → PNG com alpha.
 *
 * Assim #2–#4 (fotos circulares com anel, recorte diagonal, fundo com blur)
 * não exigem reescrever o motor — só novas camadas.
 */

export type Rect = { x: number; y: number; w: number; h: number };

export type PhotoMask = "rect" | "circle" | "polygon";

export type PhotoLayer = {
  kind: "photo";
  /** URL http(s) (host permitido), data-URI, ou stock key (ex.: "barber"). */
  src: string;
  /**
   * Fallback do segmento (stock local) quando `src` falha — fetch derrubado,
   * host não permitido, bytes inválidos… O motor tenta este e, se ele também
   * falhar, segue SEM a camada (fundo sólido). Nunca 500 por causa de foto.
   */
  fallbackSrc?: string;
  rect: Rect;
  /** Enquadramento 0..1 (object-position) ao usar fit=cover. */
  focal?: { x: number; y: number };
  fit?: "cover" | "contain";
  mask?: PhotoMask;
  /** Pontos do recorte diagonal/polígono em coords do próprio retângulo (0..1). */
  polygonPoints?: string;
  /** Raio de desfoque pré-aplicado com sharp (px). */
  blur?: number;
  /** Tinta de cor sobre a foto (brilho/diagonal). */
  tint?: { color: string; opacity: number; angle?: number };
};

export type VectorLayer = {
  kind: "vector";
  /** Elemento satori (árvore h()); fundo transparente. */
  node: unknown;
  /** Área de render; omitido = canvas inteiro. */
  rect?: Rect;
};

export type Layer = PhotoLayer | VectorLayer;

export type RenderOutput = "jpeg" | "png";

export type RenderSpec = {
  width: number;
  height: number;
  /** Cor de fundo base (fica atrás de tudo). */
  bg: string;
  layers: Layer[];
  /** com foto → jpeg q90 4:4:4; sem foto → png otimizado. */
  output?: RenderOutput;
  /** Prévia 540: jpeg q75–80 (composto lossless → resize → encode). */
  preview?: boolean;
  /** Largura da prévia (padrão 540). */
  previewWidth?: number;
};

export type RenderResult = {
  buffer: Buffer;
  mimeType: "image/jpeg" | "image/png";
  bytes: number;
  timings: { photoMs: number; vectorMs: number; composeMs: number; totalMs: number };
};
