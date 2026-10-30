export const ARTIFACT_KINDS = ["image", "video", "svg", "html", "glb"] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export const MAX_ARTIFACT_BYTES = 20 * 1024 * 1024;

const MIME_TO_KIND: Record<string, ArtifactKind> = {
  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
  "image/gif": "image",
  "image/svg+xml": "svg",
  "video/mp4": "video",
  "video/webm": "video",
  "model/gltf-binary": "glb",
  "text/html": "html",
};

const EXTENSION_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
  glb: "model/gltf-binary",
  html: "text/html",
  htm: "text/html",
};

export const isAllowedMime = (mime: string): boolean =>
  Object.hasOwn(MIME_TO_KIND, mime.toLowerCase());

export const inferArtifactKind = (mime: string): ArtifactKind | null => {
  const key = mime.toLowerCase();
  return Object.hasOwn(MIME_TO_KIND, key) ? MIME_TO_KIND[key] : null;
};

export const isPosterMime = (mime: string): boolean => {
  const kind = inferArtifactKind(mime);
  return kind === "image" || kind === "svg";
};

/** 확장자가 알려져 있으면 mime과 일치해야 한다. 확장자 없음/모르는 확장자는 통과. */
export const extensionMatchesMime = (filename: string, mime: string): boolean => {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1) return true;
  const extension = filename.slice(dot + 1).toLowerCase();
  if (!Object.hasOwn(EXTENSION_TO_MIME, extension)) return true;
  return EXTENSION_TO_MIME[extension] === mime.toLowerCase();
};
