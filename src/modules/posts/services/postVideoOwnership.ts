import { container } from "tsyringe";
import type { IStorageProvider } from "@/shared/container/providers/StorageProvider/IStorageProvider";
import { AppError } from "@/shared/errors/AppError";

/** Accept only objects in our storage and with the salon-specific upload name. */
export function assertOwnedPostVideo(url: string | null | undefined, salonId: string): void {
  if (!url) return;
  const storage = container.resolve<IStorageProvider>("StorageProvider");
  let objectName: string | null = null;
  try { objectName = storage.extractObjectName(url); } catch { /* invalid/unconfigured origin */ }
  const filename = objectName?.split("/").at(-1)?.split(/[?#]/)[0];
  if (!objectName || !objectName.split("/").includes("posts") || !filename?.startsWith(`video-${salonId}-`)) {
    throw new AppError("Envie um vídeo para este salão pela plataforma", 400);
  }
}
