/**
 * Redes sociais do dono (perfil público).
 *
 * Formato gravado em `barbershops.socialLinks` (JSONB): mapa `rede → URL`
 * canônica, sempre `https://`. Aceita na entrada `@usuario`, `usuario`,
 * `rede.com/usuario` ou URL com/sem `https://`; `http://` é normalizado para
 * `https://`. Hosts fora da allowlist da rede (inclusive IPs, localhost,
 * `javascript:`, `data:`) são recusados com mensagem PT-BR.
 *
 * Para estender (Kwai, LinkedIn...): adicione a entrada em SOCIAL_NETWORKS e
 * SOCIAL_NETWORK_DEFS — o resto (schema, repositório, front) segue a lista.
 */

export const SOCIAL_NETWORKS = ["instagram", "tiktok", "x", "youtube", "facebook"] as const;

export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];

export interface SocialNetworkDef {
  id: SocialNetwork;
  /** Rótulo PT-BR usado nas mensagens de erro. */
  label: string;
  /** Hosts aceitos na entrada; todos normalizados para canonicalHost. */
  hosts: string[];
  canonicalHost: string;
  /** Monta a URL canônica a partir do caminho aceito (sem query/hash). */
  build: (path: string) => string;
  /** Mensagem quando host/protocolo/porta não são desta rede. */
  hostError: string;
  /** Formato do "handle" puro (sem host). */
  handlePattern: RegExp;
  /** Mensagem quando o handle não segue o padrão da rede. */
  handleError?: string;
  /** Mensagem quando o caminho não é um perfil/canal aceito (ex.: YouTube). */
  pathError?: string;
}

export const SOCIAL_NETWORK_DEFS: Record<SocialNetwork, SocialNetworkDef> = {
  instagram: {
    id: "instagram",
    label: "Instagram",
    hosts: ["instagram.com", "www.instagram.com", "m.instagram.com"],
    canonicalHost: "instagram.com",
    build: (path) => `https://instagram.com/${path}`,
    hostError: "O link do Instagram precisa ser de instagram.com",
    handlePattern: /^[A-Za-z0-9._]{1,30}$/,
  },
  tiktok: {
    id: "tiktok",
    label: "TikTok",
    hosts: ["tiktok.com", "www.tiktok.com", "m.tiktok.com"],
    canonicalHost: "tiktok.com",
    build: (path) => `https://tiktok.com/@${path}`,
    hostError: "O link do TikTok precisa ser de tiktok.com",
    handlePattern: /^[A-Za-z0-9._]{1,24}$/,
  },
  x: {
    id: "x",
    label: "X",
    hosts: [
      "x.com",
      "www.x.com",
      "mobile.x.com",
      "twitter.com",
      "www.twitter.com",
      "mobile.twitter.com",
    ],
    canonicalHost: "x.com",
    build: (path) => `https://x.com/${path}`,
    hostError: "O link do X precisa ser de x.com",
    handlePattern: /^[A-Za-z0-9_]{1,15}$/,
    handleError: "O usuário do X aceita até 15 letras, números e _",
  },
  youtube: {
    id: "youtube",
    label: "YouTube",
    hosts: ["youtube.com", "www.youtube.com", "m.youtube.com"],
    canonicalHost: "youtube.com",
    build: (path) => `https://youtube.com/${path}`,
    hostError: "O link do YouTube precisa ser de youtube.com",
    handlePattern: /^[A-Za-z0-9._-]{1,40}$/,
    pathError: "Informe o link do canal do YouTube (ex.: youtube.com/@seucanal)",
  },
  facebook: {
    id: "facebook",
    label: "Facebook",
    hosts: ["facebook.com", "www.facebook.com", "m.facebook.com", "web.facebook.com"],
    canonicalHost: "facebook.com",
    build: (path) => `https://facebook.com/${path}`,
    hostError: "O link do Facebook precisa ser de facebook.com",
    handlePattern: /^[A-Za-z0-9._]{1,50}$/,
    pathError: "Informe a página do Facebook (ex.: facebook.com/suapagina)",
  },
};

export type SocialLinkResult = { ok: true; url: string } | { ok: false; error: string };

const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;
const MAX_LENGTH = 300;
/** Prefixos de URL de canal do YouTube (fora do formato @handle). */
const YOUTUBE_CHANNEL_PREFIXES = ["channel", "c", "user"];

function hint(def: SocialNetworkDef): string {
  if (def.id === "youtube") return def.pathError as string;
  return `Informe o usuário do ${def.label} (ex.: @seuusuario).`;
}

function buildFromHandle(def: SocialNetworkDef, handle: string): SocialLinkResult {
  if (!def.handlePattern.test(handle)) {
    return {
      ok: false,
      error: def.handleError ?? def.pathError ?? `Informe um usuário válido do ${def.label} (ex.: @seuusuario).`,
    };
  }
  // No YouTube o @ faz parte do caminho canônico (@handle); no TikTok o @ já
  // é adicionado pelo build(); nas demais redes o caminho é o handle puro.
  const path = def.id === "youtube" ? `@${handle}` : handle;
  return { ok: true, url: def.build(path) };
}

function buildFromPath(def: SocialNetworkDef, segments: string[]): SocialLinkResult {
  const first = (segments[0] ?? "").replace(/^@/, "");
  if (!first) return { ok: false, error: hint(def) };

  if (def.id === "youtube") {
    const isHandle = segments[0].startsWith("@");
    const isChannel = YOUTUBE_CHANNEL_PREFIXES.includes(first) && segments.length >= 2;
    if (!isHandle && !isChannel) return { ok: false, error: def.pathError as string };
    if (isHandle && !def.handlePattern.test(first)) return { ok: false, error: def.pathError as string };
    return { ok: true, url: def.build(segments.join("/")) };
  }

  if (def.id === "facebook" && first === "profile.php") {
    return { ok: false, error: def.pathError as string };
  }
  if (def.id === "facebook" && first === "pages" && segments.length >= 3) {
    return { ok: true, url: def.build(segments.slice(0, 3).join("/")) };
  }

  return buildFromHandle(def, first);
}

/**
 * Normaliza uma entrada para a URL canônica da rede.
 * Rede desconhecida, host fora da allowlist, esquema não-http(s), porta não
 * padrão, IP/localhost e handle/caminho inválidos retornam `{ ok: false }`.
 */
export function normalizeSocialLink(network: string, raw: string): SocialLinkResult {
  const def = SOCIAL_NETWORK_DEFS[network as SocialNetwork];
  if (!def) return { ok: false, error: `Rede social desconhecida: ${network}.` };

  const value = String(raw ?? "").trim();
  if (!value) return { ok: false, error: `Informe o usuário ou o link do ${def.label}.` };
  if (value.length > MAX_LENGTH) {
    return { ok: false, error: `O link do ${def.label} está muito longo (máximo ${MAX_LENGTH} caracteres).` };
  }

  // @usuario / usuario / usuario.comum sem host → handle direto.
  if (!SCHEME_RE.test(value) && !value.includes("/")) {
    const handle = value.startsWith("@") ? value.slice(1) : value;
    if (handle === "localhost" || IPV4_RE.test(handle)) return { ok: false, error: def.hostError };
    return buildFromHandle(def, handle);
  }

  // URL com ou sem esquema; http é aceito e normalizado para https.
  const candidate = SCHEME_RE.test(value) ? value : `https://${value}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, error: def.hostError };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, error: def.hostError };
  if (url.port) return { ok: false, error: def.hostError };
  if (!def.hosts.includes(url.hostname.toLowerCase())) return { ok: false, error: def.hostError };

  const segments = url.pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });
  if (!segments.length) return { ok: false, error: hint(def) };
  return buildFromPath(def, segments);
}

/**
 * Valida e normaliza o mapa vindo do PATCH na ordem fixa das redes; entradas
 * vazias são removidas; tudo vazio → `links: null` (limpa o JSON no banco).
 * Chaves desconhecidas viram erro claro ("Rede social desconhecida").
 */
export function buildSocialLinksUpdate(input: Record<string, string | null | undefined>): {
  links: Record<string, string> | null;
  errors: Record<string, string>;
} {
  const links: Record<string, string> = {};
  const errors: Record<string, string> = {};

  const known = new Set<string>(SOCIAL_NETWORKS);
  const keys = [...SOCIAL_NETWORKS, ...Object.keys(input).filter((key) => !known.has(key))];

  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    const value = (input[key] ?? "").trim();
    if (!value) continue;
    const result = normalizeSocialLink(key, value);
    if (result.ok) links[key] = result.url;
    else errors[key] = result.error;
  }

  return { links: Object.keys(links).length ? links : null, errors };
}

/** Saída segura/ordenada (só redes conhecidas, só strings não vazias). */
export function orderSocialLinks(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const links: Record<string, string> = {};
  for (const id of SOCIAL_NETWORKS) {
    const link = record[id];
    if (typeof link === "string" && link.trim()) links[id] = link.trim();
  }
  return Object.keys(links).length ? links : null;
}
