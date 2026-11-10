import { spotMediaUrls, toSpotVideo } from "@/lib/dates/media";

/**
 * 인스타그램 게시물 사진 주소를 공식 임베드(`/p/<코드>/embed/captioned/`)에서 읽는다.
 *
 * 여러 장 게시물은 임베드에 들어 있는 게시물 데이터(`contextJSON`)에서 사진을 순서대로 모두 꺼내고,
 * 데이터가 없으면 임베드에 보이는 대표 사진 한 장만 쓴다.
 * 영상은 영상 주소(.mp4)에 표지 사진을 붙여 넣고(`toSpotVideo`), 카드에서 GIF처럼 소리 없이 반복 재생한다.
 * 게시물 데이터에 영상 주소가 없으면 예전처럼 표지 사진을 쓴다.
 *
 * 사진 파일은 저장하지 않는다. CDN 주소에 만료 시각(`oe`, 16진수 초)이 붙어 있어 4~5일 뒤 열리지 않으므로,
 * 주소와 가장 이른 만료 시각만 저장해 두고 만료가 가까우면 다시 읽는다. 화면은 인스타그램 CDN에서 바로 받는다.
 */

/** 카드 너비(최대 약 480px, 2배 화면)에 맞는 크기 */
const TARGET_WIDTH = 640;
/** 한 게시물에서 보여 줄 최대 장수 — 인스타그램은 20장까지 올릴 수 있다. */
export const MAX_SPOT_PHOTOS = 10;
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

const isHttp = (url: unknown): url is string =>
  typeof url === "string" && /^https?:\/\//.test(url);

/** TARGET_WIDTH 이상 중 가장 작은 것, 없으면 가장 큰 것 */
const pickSize = (candidates: { url: string; width: number }[]): string | null => {
  const sorted = candidates
    .filter((c) => isHttp(c.url) && c.width > 0)
    .sort((a, b) => a.width - b.width);
  if (!sorted.length) return null;
  return (sorted.find((c) => c.width >= TARGET_WIDTH) ?? sorted.at(-1)!).url;
};

export const pickFromSrcset = (srcset: string): string | null =>
  pickSize(
    srcset
      .split(",")
      .map((part) => part.trim().match(/^(\S+)\s+(\d+)w$/))
      .filter((m): m is RegExpMatchArray => Boolean(m))
      .map((m) => ({ url: m[1], width: Number(m[2]) }))
  );

/** CDN 주소의 `oe`(만료 시각, 16진수 유닉스 초) */
export const photoExpiresAt = (url: string, now = Date.now()): Date => {
  const oe = new URL(url).searchParams.get("oe");
  const seconds = oe && /^[0-9a-f]+$/i.test(oe) ? parseInt(oe, 16) : NaN;
  return new Date(Number.isFinite(seconds) ? seconds * 1000 : now + FALLBACK_TTL_MS);
};

interface EmbedMediaNode {
  is_video?: unknown;
  video_url?: unknown;
  display_url?: unknown;
  display_resources?: { src?: unknown; config_width?: unknown }[];
  edge_sidecar_to_children?: { edges?: { node?: EmbedMediaNode }[] };
}

/** 알맞은 크기의 사진(영상이면 표지 사진) 주소 */
const nodeImage = (node: EmbedMediaNode): string | null => {
  const sized = pickSize(
    (node.display_resources ?? []).map((r) => ({
      url: String(r.src ?? ""),
      width: Number(r.config_width ?? 0),
    }))
  );
  return sized ?? (isHttp(node.display_url) ? node.display_url : null);
};

/** 영상이면 표지 사진을 붙인 영상 주소, 아니면(또는 영상 주소가 없으면) 사진 주소 */
const nodePhoto = (node: EmbedMediaNode | undefined): string | null => {
  if (!node) return null;
  const image = nodeImage(node);
  if (node.is_video === true && isHttp(node.video_url)) {
    return toSpotVideo(node.video_url, image);
  }
  return image;
};

/** 임베드 안의 게시물 데이터. 형식이 바뀌었거나 없으면 null */
const readEmbedMedia = (html: string): EmbedMediaNode | null => {
  const raw = html.match(/"contextJSON":"((?:[^"\\]|\\.)*)"/)?.[1];
  if (!raw) return null;
  try {
    const context = JSON.parse(JSON.parse(`"${raw}"`)) as {
      gql_data?: { shortcode_media?: EmbedMediaNode };
    };
    return context.gql_data?.shortcode_media ?? null;
  } catch {
    return null;
  }
};

/** 임베드에 보이는 대표 사진 한 장 */
const readEmbedImage = (html: string): string | null => {
  const tag = html.match(/<img[^>]*class="EmbeddedMediaImage"[^>]*>/)?.[0];
  if (!tag) return null;
  const srcset = attr(tag, "srcset");
  const url = (srcset && pickFromSrcset(decodeEntities(srcset))) || attr(tag, "src");
  const decoded = url ? decodeEntities(url) : null;
  return isHttp(decoded) ? decoded : null;
};

/** 임베드 HTML에서 게시물 사진·영상 주소들을 순서대로 꺼낸다. */
export const parseEmbedPhotos = (html: string): string[] => {
  const media = readEmbedMedia(html);
  const children = media?.edge_sidecar_to_children?.edges ?? [];
  const photos = (
    children.length
      ? children.map((edge) => nodePhoto(edge.node))
      : [nodePhoto(media ?? undefined)]
  ).filter((url): url is string => Boolean(url));
  if (!photos.length) {
    const single = readEmbedImage(html);
    if (single) photos.push(single);
  }
  return [...new Set(photos)].slice(0, MAX_SPOT_PHOTOS);
};

const shortcode = (instagramUrl: string) =>
  instagramUrl.match(/\/p\/([A-Za-z0-9_-]+)/)?.[1] ?? null;

export interface SpotPhotos {
  urls: string[];
  /** 가장 먼저 만료되는 주소의 만료 시각 */
  expiresAt: Date;
}

/** 못 읽으면(비공개·삭제·차단) null */
export const fetchInstagramPhotos = async (
  instagramUrl: string
): Promise<SpotPhotos | null> => {
  const code = shortcode(instagramUrl);
  if (!code) return null;
  try {
    const res = await fetch(`${embedOrigin()}/p/${code}/embed/captioned/`, {
      headers: { "Accept-Language": "ko-KR,ko;q=0.9" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const urls = parseEmbedPhotos(await res.text());
    if (!urls.length) return null;
    const expiresAt = new Date(
      Math.min(...urls.flatMap(spotMediaUrls).map((url) => photoExpiresAt(url).valueOf()))
    );
    return { urls, expiresAt };
  } catch {
    return null;
  }
};
