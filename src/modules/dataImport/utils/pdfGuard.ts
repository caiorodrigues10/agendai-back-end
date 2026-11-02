/**
 * Guarda do container PDF.
 *
 * O PDF é um arquivo de objetos: cada objeto pode declarar o tamanho do seu
 * stream (`/Length 999999999`). Um PDF malicioso declara gigabytes num
 * arquivo de poucos KB — quem acredita no valor declarado aloca por ele.
 *
 * A guarda lê o arquivo **cru** (sem interpretador de PDF) e recusa o
 * arquivo antes que a biblioteca de texto o descompacte.
 */
import { AppError } from "@/shared/errors/AppError";

/** Total de bytes que os objetos do PDF podem declarar. */
export const MAX_PDF_DECLARED_BYTES = 60 * 1024 * 1024;

/**
 * `/Length <n>` com **valor direto**.
 *
 * `/Length 12 0 R` é referência indireta (o tamanho está em outro objeto) e
 * não entra na conta — o lookahead evita somar o número do objeto como se
 * fosse o tamanho do stream.
 */
const DIRECT_LENGTH = /\/Length\s+(\d+)(?!\s+\d+\s+R)/g;

export interface PdfInspection {
  /** Soma dos tamanhos declarados diretamente no arquivo. */
  declaredBytes: number;
}

/**
 * Lê o PDF cru e devolve a soma dos tamanhos declarados.
 *
 * Lança `AppError` (400) quando o arquivo declara mais do que pode caber.
 */
export function inspectPdf(buffer: Buffer): PdfInspection {
  let declaredBytes = 0;
  DIRECT_LENGTH.lastIndex = 0;

  const text = buffer.toString("latin1");
  let match = DIRECT_LENGTH.exec(text);
  while (match) {
    declaredBytes += Number(match[1]);
    if (declaredBytes > MAX_PDF_DECLARED_BYTES) {
      throw new AppError(
        "O conteúdo do PDF é grande demais para ser processado com segurança.",
        400,
      );
    }
    match = DIRECT_LENGTH.exec(text);
  }

  return { declaredBytes };
}
