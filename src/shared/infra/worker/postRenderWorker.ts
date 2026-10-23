import { parentPort, workerData } from "node:worker_threads";
import { renderSvgToPngSync } from "../../../modules/posts/services/postSvgRenderer";
import { renderPostLayers } from "../../../modules/posts/templates/_engine/render";
import { getEngineFonts } from "../../../modules/posts/templates/_engine/fonts";
import type { PostRenderJob, PostRenderReply } from "./postRenderProtocol";

const port = parentPort;
if (!port) {
  throw new Error("postRenderWorker precisa rodar dentro de um worker thread");
}

/**
 * Warm-up medido: popula o registry de fontes e paga o 1º render (parse das
 * fontes + WASM do yoga/harfbuzz + init do resvg) UMA vez no boot. O pool só
 * recebe job depois do `ready`, então o custo frio fica medido em `warmMs`
 * e fora do caminho dos renders seguintes.
 *
 * `warmMs` = Date.now() - startedAt (spawn da thread) no fim do aquecimento:
 * boot (tsx/entry) + import do motor + warm. Não usar performance.now() aqui —
 * o timeOrigin do worker não é o da própria thread.
 */
async function warmUp(): Promise<number> {
  if (process.env.POST_RENDER_WARM === "0") return Date.now() - workerData.startedAt;
  getEngineFonts();
  await renderPostLayers({
    width: 320,
    height: 180,
    bg: "#000000",
    layers: [
      {
        kind: "vector",
        node: {
          type: "div",
          props: {
            style: {
              width: "320px",
              height: "180px",
              display: "flex",
              alignItems: "center",
              fontFamily: "Inter",
              fontSize: 40,
              color: "#ffffff",
            },
            children: ["WARM"],
          },
        },
      },
    ],
    output: "png",
  });
  return Date.now() - workerData.startedAt;
}

async function handleJob(job: PostRenderJob): Promise<PostRenderReply> {
  if (job.kind === "v2") {
    const result = await renderPostLayers(job.spec);
    return {
      id: job.id,
      ok: true,
      png: new Uint8Array(result.buffer),
      mimeType: result.mimeType,
      bytes: result.bytes,
      timings: result.timings,
    };
  }
  return { id: job.id, ok: true, png: renderSvgToPngSync(job.svg) };
}

// Handler ANTES do warm-up para não perder mensagem; o pool (gate de `ready`)
// só despacha depois da resposta de aquecimento.
port.on("message", (job: PostRenderJob) => {
  handleJob(job).then(
    (reply) => port.postMessage(reply),
    (err: unknown) =>
      port.postMessage({
        id: job.id,
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      } satisfies PostRenderReply)
  );
});

warmUp().then(
  (warmMs) => port.postMessage({ id: 0, ready: true, warmMs } satisfies PostRenderReply),
  (err: unknown) => {
    // Boot falhou (fonte/WASM indisponível) → thread morre e o pool recria.
    throw err instanceof Error ? err : new Error(String(err));
  }
);
