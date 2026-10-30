import { createHash, timingSafeEqual } from "node:crypto";

/**
 * 에이전트용 업로드 토큰. `ARTIFACT_TOKEN`이 비어 있으면 이 경로는 꺼진다.
 * 길이 차이로 정보가 새지 않도록 양쪽을 SHA-256으로 고정 길이로 만든 뒤 비교한다.
 */
export const hasArtifactToken = (req: Request): boolean => {
  const expected = process.env.ARTIFACT_TOKEN;
  const provided = req.headers.get("x-artifact-token");
  if (!expected || !provided) return false;

  const providedDigest = createHash("sha256").update(provided).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
};
