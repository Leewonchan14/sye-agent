import { randomBytes } from "node:crypto";
import { mkdir, open, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export interface StoredObject {
  key: string;
  bytes: number;
}

/**
 * 키는 우리가 만든 아티팩트 id만 온다. 그래도 루트 밖 경로는 거부한다.
 * (BLOB 어댑터로 바꿀 때도 같은 경계를 유지한다.)
 */
const resolveKey = (key: string): string => {
  const root = path.resolve(
    process.env.ARTIFACT_DIR ?? path.join(process.cwd(), ".data", "artifacts")
  );
  const target = path.resolve(root, key);
  if (!target.startsWith(`${root}${path.sep}`)) {
    throw new Error("invalid artifact key");
  }
  return target;
};

export const putObject = async (
  key: string,
  body: Uint8Array,
  mime: string
): Promise<StoredObject> => {
  // mime은 저장 백엔드의 메타데이터 자리 — 로컬 FS는 DB의 mime을 쓴다.
  void mime;
  const target = resolveKey(key);
  await mkdir(path.dirname(target), { recursive: true });

  // 같은 키를 동시에 읽는 요청이 반쯤 쓰인 파일을 보지 않도록 원자적 교체.
  const temp = `${target}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(temp, body);
  await rename(temp, target);

  return { key, bytes: body.byteLength };
};

export const statObject = async (key: string): Promise<{ size: number } | null> => {
  try {
    const info = await stat(resolveKey(key));
    return info.isFile() ? { size: info.size } : null;
  } catch {
    return null;
  }
};

/** [start, endInclusive] 구간을 읽는다. EOF를 넘으면 실제로 읽은 만큼만 돌려준다. */
export const readObjectRange = async (
  key: string,
  start: number,
  endInclusive: number
): Promise<Uint8Array<ArrayBuffer>> => {
  const target = resolveKey(key);
  const length = Math.max(0, endInclusive - start + 1);
  const handle = await open(target, "r");

  try {
    const buffer = new Uint8Array(length);
    let offset = 0;
    while (offset < length) {
      const { bytesRead } = await handle.read(
        buffer,
        offset,
        length - offset,
        start + offset
      );
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    return offset === length ? buffer : buffer.slice(0, offset);
  } finally {
    await handle.close();
  }
};
