type FeatureExtractor = (
  texts: string[],
  options?: { pooling?: "mean" | "cls"; normalize?: boolean }
) => Promise<{ data: Float32Array; dims: number[] }>;

let extractor: FeatureExtractor | null = null;

const MODEL = "Xenova/all-MiniLM-L6-v2";

const getExtractor = async (): Promise<FeatureExtractor> => {
  if (extractor) return extractor;

  // Dynamic import: @huggingface/transformers depends on onnxruntime native binary
  // (libonnxruntime.so.1) which is unavailable in Vercel serverless environment.
  // Lazy import prevents crash on routes that import this module but never call embed().
  const { pipeline } = await import("@huggingface/transformers");
  const pipe = await pipeline("feature-extraction", MODEL, {
    dtype: "q8",
  });

  extractor = pipe as unknown as FeatureExtractor;
  return extractor;
};

export const embed = async (text: string): Promise<number[]> => {
  const pipe = await getExtractor();

  const result = await pipe([text], {
    pooling: "mean",
    normalize: true,
  });

  return Array.from(result.data);
};

export const embedBatch = async (
  texts: string[],
  onProgress?: (done: number, total: number) => void
): Promise<number[][]> => {
  const pipe = await getExtractor();
  let completed = 0;
  const total = texts.length;

  const results = await Promise.all(
    texts.map(async (text) => {
      if (!text.trim()) {
        onProgress?.(++completed, total);
        return [];
      }

      const result = await pipe([text], {
        pooling: "mean",
        normalize: true,
      });

      onProgress?.(++completed, total);
      return Array.from(result.data);
    })
  );

  return results;
};
