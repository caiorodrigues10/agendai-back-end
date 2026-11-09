import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const files: Record<string, string> = {
  'law-columns': 'law-columns-editorial-v2.png',
  'law-desk': 'law-desk-editorial-v2.png',
  'law-office': 'law-office-editorial-v3.png',
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
  "promo-photo-barber-tools": "promo-combo-graphite.png",
  "promo-photo-barber-copper": "promo-flash-copper.png",
  "promo-photo-salon-lobby": "promo-launch-premium.png",
  "promo-photo-salon-calendar": "promo-slots-premium.png",
  "promo-photo-beauty-products": "promo-beauty-luxe.png",
  "promo-photo-beauty-gift": "promo-gift-card.png",
};
const cache = new Map<string, string>();
// Bases antigas promo-* têm molduras/selos rasterizados, que não acompanham o
// formato nem a paleta. Usamos fotos limpas e desenhamos os elementos em SVG.
const promotionalPhotos: Record<string, string> = {
  "promo-offer": "barber", "promo-service": "barber", "promo-beauty": "beauty",
  "promo-agenda": "salon", "promo-menu": "barber", "promo-notice": "beauty",
  "promo-editorial": "salon", "promo-flash": "barber", "promo-combo": "barber",
  "promo-slots": "salon", "promo-beauty-luxe": "beauty", "promo-gift": "beauty",
  "promo-loyalty": "salon", "promo-review": "salon", "promo-launch": "salon",
};

/** Generated illustrative stock; never used for actual client results or before/after. */
export function loadPostStockImage(key: string | undefined): string | null {
  if (!key || !files[key]) return null;
  key = promotionalPhotos[key] ?? key;
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
