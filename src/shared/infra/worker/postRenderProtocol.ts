/**
 * Contrato de mensagens entre o pool e o worker de render de posts.
 *
 * Structured clone do `postMessage` transforma `Buffer` em `Uint8Array`,
 * por isso as respostas declaram `Uint8Array` e o pool reconverte.
 *
 * Duas gerações de job convivem:
 *  - v1 (`svg`): legado — SVG pronto → PNG (postImageService).
 *  - v2 (`spec`): motor de camadas — `RenderSpec` serializável (VNode é objeto
 *    simples) → renderPostLayers DENTRO da thread, devolvendo buffer +
 *    mimeType + timings.
 * `ready` é enviado 1× por thread depois do warm-up (fontes + WASM pagos no
 * boot); o pool não despacha nada antes disso.
 */
import type { RenderSpec, RenderResult } from "@/modules/posts/templates/_engine/types";

export type PostRenderJob =
  | { id: number; kind?: "v1"; svg: string }
  | { id: number; kind: "v2"; spec: RenderSpec };

export type PostRenderReply =
  | { id: number; ok: true; png: Uint8Array; mimeType?: RenderResult["mimeType"]; bytes?: number; timings?: RenderResult["timings"] }
  | { id: number; ok: false; message: string }
  | { id: number; ready: true; warmMs: number };

export type PostRenderWorkerData = {
  entry: string;
  needsTsx: boolean;
  /** Date.now() no spawn da thread (p/ medir boot+warm honestamente). */
  startedAt: number;
};
