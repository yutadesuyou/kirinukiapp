/**
 * @imgly/background-removal のラッパー。
 * 推論はすべてブラウザ内（WASM）で実行され、画像データは外部に送信されない。
 *
 * AI モデル・WASM アセットはこのアプリ自身（/imgly-data/）から配信される
 * 自己ホスト構成のため、実行時に外部 CDN への接続は発生しない。
 * ※ 初回のみモデルの読み込みに数秒〜十数秒かかる。2 回目以降はキャッシュが使われる。
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
 *
 * 精度向上のため、AI モデルにはガンマ補正でシャドウを持ち上げた
 * 「推論専用コピー」を渡し（黒背景×暗い被写体のエッジ対策）、
 * 得られたアルファマスクだけを元画像に適用する。
 * 出力の RGB 画素は元画像と完全に同一（デザイン・画質無劣化）。
 *
 * @param image 入力画像の Blob
 * @param onProgress 進捗コールバック（モデルロード → 推論の 2 段階）
 */
export async function removeImageBackground(
  image: Blob,
  onProgress?: (progress: RemovalProgress) => void
): Promise<Blob> {
  // SSR 時にバンドルされないよう動的 import
  const { removeBackground } = await import("@imgly/background-removal");
  const { enhanceForInference, applyMaskAlphaToOriginal } = await import(
    "./imageUtils"
  );

  let inferenceStarted = false;

  try {
    const enhanced = await enhanceForInference(image);
    const masked = await removeBackground(enhanced, {
      // アプリ自身が配信する自己ホストアセットを参照（外部 CDN 非依存）
      publicPath: new URL("/imgly-data/", window.location.origin).toString(),
      model: "isnet_fp16",
      device: "cpu",
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
    // アルファのみ採用し、RGB は元画像から復元
    return await applyMaskAlphaToOriginal(image, masked);
  } catch (err) {
    throw new BackgroundRemovalError(
      "背景除去処理に失敗しました。ネットワーク接続を確認のうえ、ページを再読み込みして再度お試しください。",
      { cause: err }
    );
  }
}
