/**
 * `unpdf` é ESM-only e publica os tipos pelo mapa `exports` — o
 * `moduleResolution: node` (node10) deste projeto não resolve esse mapa.
 *
 * A declaração local cobre só a parte usada pelo leitor de PDF da importação
 * (`getDocumentProxy` + `extractTextItems`).
 */
declare module "unpdf" {
  export interface UnpdfTextItem {
    str: string;
    /** Posição X no espaço do PDF (origem embaixo à esquerda). */
    x: number;
    /** Posição Y no espaço do PDF (origem embaixo à esquerda). */
    y: number;
    width: number;
    height: number;
    fontSize: number;
    fontFamily: string;
    dir: "ltr" | "rtl" | "ttb";
    hasEOL: boolean;
  }

  export interface UnpdfDocumentProxy {
    numPages: number;
    destroy(): Promise<void>;
  }

  export function getDocumentProxy(
    data: Uint8Array | ArrayBuffer,
    options?: Record<string, unknown>,
  ): Promise<UnpdfDocumentProxy>;

  export function extractTextItems(
    proxy: UnpdfDocumentProxy,
  ): Promise<{ totalPages: number; items: UnpdfTextItem[][] }>;
}
