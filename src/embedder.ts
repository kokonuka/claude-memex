import { pipeline } from "@huggingface/transformers";

const MODEL_NAME = "mochiya98/ruri-v3-310m-onnx";

let extractor: any = null;

async function getExtractor() {
  if (!extractor) {
    extractor = await (pipeline as any)("feature-extraction", MODEL_NAME, {
      dtype: "q8",
    });
  }
  return extractor;
}

// 保存用: ドキュメントとしてベクトル化
export async function embedTexts(texts: string[]): Promise<Float32Array[]> {
  const ext = await getExtractor();
  const prefixed = texts.map((t) => `検索文書: ${t}`);
  const results: Float32Array[] = [];

  for (const text of prefixed) {
    const output = await ext(text, { pooling: "mean", normalize: true });
    results.push(new Float32Array(output.data as ArrayLike<number>));
  }

  return results;
}

// 検索用: クエリとしてベクトル化
export async function embedQuery(query: string): Promise<Float32Array> {
  const ext = await getExtractor();
  const output = await ext(`検索クエリ: ${query}`, {
    pooling: "mean",
    normalize: true,
  });
  return new Float32Array(output.data as ArrayLike<number>);
}
