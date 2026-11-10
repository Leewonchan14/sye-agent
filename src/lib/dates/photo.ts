/**
 * 인스타그램 게시물 대표 사진 주소를 공식 임베드(`/p/<코드>/embed/captioned/`)에서 읽는다.
 *
 * 사진 파일은 저장하지 않는다. CDN 주소에 만료 시각(`oe`, 16진수 초)이 붙어 있어 4~5일 뒤 열리지 않으므로,
 * 주소와 만료 시각만 저장해 두고 만료가 가까우면 다시 읽는다. 화면은 인스타그램 CDN에서 바로 받는다.
 */

/** 카드 너비(최대 약 480px, 2배 화면)에 맞는 크기 */
const TARGET_WIDTH = 640;
const FETCH_TIMEOUT_MS = 8_000;
/** `oe`가 없을 때 쓰는 보수적인 유효 기간 */
const FALLBACK_TTL_MS = 24 * 60 * 60 * 1000;

const embedOrigin = () =>
  (process.env.INSTAGRAM_EMBED_ORIGIN || "https://www.instagram.com").replace(/\/+$/, "");

const decodeEntities = (value: string) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&#064;/g, "@")
    .replace(/&quot;/g, '"')
    .replace(/&#x2F;|&#47;/g, "/");

const attr = (tag: string, name: string) =>
  tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null;

/** srcset에서 TARGET_WIDTH 이상 중 가장 작은 것, 없으면 가장 큰 것 */
export const pickFromSrcset = (srcset: string): string | null => {
  const candidates = srcset
    .split(",")
    .map((part) => part.trim().match(/^(\S+)\s+(\d+)w$/))
    .filter((m): m is RegExpMatchArray => Boolean(m))
    .map((m) => ({ url: m[1], width: Number(m[2]) }))
    .sort((a, b) => a.width - b.width);
  if (!candidates.length) return null;
  return (candidates.find((c) => c.width >= TARGET_WIDTH) ?? candidates.at(-1)!).url;
};

/** CDN 주소의 `oe`(만료 시각, 16진수 유닉스 초) */
export const photoExpiresAt = (url: string, now = Date.now()): Date => {
  const oe = new URL(url).searchParams.get("oe");
  const seconds = oe && /^[0-9a-f]+$/i.test(oe) ? parseInt(oe, 16) : NaN;
  return new Date(Number.isFinite(seconds) ? seconds * 1000 : now + FALLBACK_TTL_MS);
};

/** 임베드 HTML에서 대표 사진 주소를 꺼낸다. 영상·여러 장 게시물은 표지 사진. */
export const parseEmbedPhoto = (html: string): string | null => {
  const tag = html.match(/<img[^>]*class="EmbeddedMediaImage"[^>]*>/)?.[0];
  if (!tag) return null;
  const srcset = attr(tag, "srcset");
  const url = (srcset && pickFromSrcset(decodeEntities(srcset))) || attr(tag, "src");
  if (!url) return null;
  const decoded = decodeEntities(url);
  return /^https?:\/\//.test(decoded) ? decoded : null;
};

const shortcode = (instagramUrl: string) =>
  instagramUrl.match(/\/p\/([A-Za-z0-9_-]+)/)?.[1] ?? null;

export interface SpotPhoto {
  url: string;
  expiresAt: Date;
}

/** 못 읽으면(비공개·삭제·차단) null */
export const fetchInstagramPhoto = async (
  instagramUrl: string
): Promise<SpotPhoto | null> => {
  const code = shortcode(instagramUrl);
  if (!code) return null;
  try {
    const res = await fetch(`${embedOrigin()}/p/${code}/embed/captioned/`, {
      headers: { "Accept-Language": "ko-KR,ko;q=0.9" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const url = parseEmbedPhoto(await res.text());
    return url ? { url, expiresAt: photoExpiresAt(url) } : null;
  } catch {
    return null;
  }
};
