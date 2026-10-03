import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const files: Record<string, string> = {
  salon: "salon-editorial.png",
  barber: "barber-editorial.png",
  beauty: "beauty-editorial.png",
  "promo-offer": "promo-offer-graphite.png",
  "promo-service": "promo-service-graphite.png",
  "promo-beauty": "promo-beauty-ivory.png",
  "promo-agenda": "promo-agenda-graphite.png",
  "promo-menu": "promo-menu-graphite.png",
  "promo-notice": "promo-notice-ivory.png",
  "promo-editorial": "promo-editorial-dark.png",
  "promo-flash": "promo-flash-copper.png",
  "promo-combo": "promo-combo-graphite.png",
  "promo-slots": "promo-slots-premium.png",
  "promo-beauty-luxe": "promo-beauty-luxe.png",
  "promo-gift": "promo-gift-card.png",
  "promo-loyalty": "promo-loyalty-reward.png",
  "promo-review": "promo-review-warm.png",
  "promo-launch": "promo-launch-premium.png",
};
const cache = new Map<string, string>();

/** Generated illustrative stock; never used for actual client results or before/after. */
export function loadPostStockImage(key: string | undefined): string | null {
  if (!key || !files[key]) return null;
  if (cache.has(key)) return cache.get(key)!;
  const candidates = [
    path.join(process.cwd(), "src/modules/posts/assets", files[key]),
    path.join(process.cwd(), "dist/modules/posts/assets", files[key]),
  ];
  const file = candidates.find(candidate => existsSync(candidate));
  if (!file) return null;
  const dataUrl = `data:image/png;base64,${readFileSync(file).toString("base64")}`;
  cache.set(key, dataUrl);
  return dataUrl;
}
