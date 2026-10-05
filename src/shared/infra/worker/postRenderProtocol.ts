/**
 * Contrato de mensagens entre o pool e o worker de render de posts.
 * Structured clone do `postMessage` transforma `Buffer` em `Uint8Array`,
 * por isso a resposta declara `Uint8Array` e o pool reconverte para `Buffer`.
 */
export type PostRenderJob = {
  id: number;
  svg: string;
};

export type PostRenderReply =
  | { id: number; ok: true; png: Uint8Array }
  | { id: number; ok: false; message: string };

export type PostRenderWorkerData = {
  entry: string;
  needsTsx: boolean;
};
