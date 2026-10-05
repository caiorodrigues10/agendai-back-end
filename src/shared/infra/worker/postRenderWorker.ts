import { parentPort } from "node:worker_threads";
import { renderSvgToPngSync } from "../../../modules/posts/services/postSvgRenderer";
import type { PostRenderJob, PostRenderReply } from "./postRenderProtocol";

const port = parentPort;
if (!port) {
  throw new Error("postRenderWorker precisa rodar dentro de um worker thread");
}

port.on("message", (job: PostRenderJob) => {
  let reply: PostRenderReply;
  try {
    reply = { id: job.id, ok: true, png: renderSvgToPngSync(job.svg) };
  } catch (err) {
    reply = {
      id: job.id,
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
  port.postMessage(reply);
});
