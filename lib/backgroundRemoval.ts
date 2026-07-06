/**
 * @imgly/background-removal のラッパー。
 * 推論はすべてブラウザ内（WASM / WebGPU）で実行され、画像データは外部に送信されない。
 * ※ 初回のみ AI モデルファイル（約 40〜80MB）を CDN からダウンロードするため、
 *   数秒〜十数秒かかる。2 回目以降はブラウザキャッシュが使われる。
 */

export type RemovalStage = "loading-model" | "inference";

export interface RemovalProgress {
  stage: RemovalStage;
  /** 0〜1。不明な場合は undefined */
  ratio?: number;
}

export class BackgroundRemovalError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "BackgroundRemovalError";
  }
}

/**
 * 背景を除去して透過 PNG の Blob を返す。
 * @param image 入力画像の Blob
 * @param onProgress 進捗コールバック（モデルロード → 推論の 2 段階）
 */
export async function removeImageBackground(
  image: Blob,
  onProgress?: (progress: RemovalProgress) => void
): Promise<Blob> {
  // SSR 時にバンドルされないよう動的 import
  const { removeBackground } = await import("@imgly/background-removal");

  let inferenceStarted = false;

  try {
    const result = await removeBackground(image, {
      output: {
        format: "image/png",
        quality: 1.0,
      },
      progress: (key, current, total) => {
        // key は "fetch:..."（モデル取得）または "compute:inference"（推論）
        if (key.startsWith("compute")) {
          inferenceStarted = true;
          onProgress?.({
            stage: "inference",
            ratio: total > 0 ? current / total : undefined,
          });
        } else if (!inferenceStarted) {
          onProgress?.({
            stage: "loading-model",
            ratio: total > 0 ? current / total : undefined,
          });
        }
      },
    });
    return result;
  } catch (err) {
    throw new BackgroundRemovalError(
      "背景除去処理に失敗しました。ネットワーク接続を確認のうえ、ページを再読み込みして再度お試しください。",
      { cause: err }
    );
  }
}
