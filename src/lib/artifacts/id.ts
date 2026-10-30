import { nanoid } from "nanoid";

/** 아티팩트 id — `art_` 접두사 + nanoid 24자. */
export const ARTIFACT_ID_PATTERN = /^art_[A-Za-z0-9_-]{16,32}$/;

export const createArtifactId = (): string => `art_${nanoid(24)}`;
