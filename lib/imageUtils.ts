/**
 * 画像ファイルのバリデーションとリサイズユーティリティ。
 * すべてブラウザ内で完結し、画像データはサーバーに送信されない。
 */

export const SUPPORTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_DIMENSION = 4000; // 長辺の上限 px

export class ImageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageValidationError";
  }
}

export interface LoadedImage {
  /** 表示・処理に使う Blob（リサイズ済みの場合あり） */
  blob: Blob;
  /** プレビュー用 Object URL */
  url: string;
  width: number;
  height: number;
  /** 長辺超過で自動リサイズされたか */
  resized: boolean;
  /** 元ファイル名から拡張子を除いた部分 */
  baseName: string;
}

/** ファイル名から拡張子を除いた部分を取得する */
export function getBaseName(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  return idx > 0 ? fileName.slice(0, idx) : fileName;
}

/**
 * ファイルを検証して読み込む。
 * - 非対応形式・10MB 超はエラー
 * - 長辺 4000px 超は自動で縮小（resized: true を返す）
 */
export async function validateAndLoadImage(file: File): Promise<LoadedImage> {
  if (!SUPPORTED_TYPES.includes(file.type)) {
    throw new ImageValidationError(
      "対応していないファイル形式です。JPEG / PNG / WebP の画像を選択してください。"
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new ImageValidationError(
      `ファイルサイズが上限（10MB）を超えています（${(
        file.size /
        1024 /
        1024
      ).toFixed(1)}MB）。画像を圧縮してから再度お試しください。`
    );
  }

  const bitmap = await createImageBitmap(file).catch(() => {
    throw new ImageValidationError(
      "画像の読み込みに失敗しました。ファイルが破損していないかご確認ください。"
    );
  });

  try {
    const { width, height } = bitmap;
    const longSide = Math.max(width, height);

    if (longSide <= MAX_DIMENSION) {
      const url = URL.createObjectURL(file);
      return {
        blob: file,
        url,
        width,
        height,
        resized: false,
        baseName: getBaseName(file.name),
      };
    }

    // 長辺 4000px に収まるよう縮小
    const scale = MAX_DIMENSION / longSide;
    const newWidth = Math.round(width * scale);
    const newHeight = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = newWidth;
    canvas.height = newHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new ImageValidationError(
        "画像処理用の Canvas を初期化できませんでした。ブラウザを最新版に更新してください。"
      );
    }
    ctx.drawImage(bitmap, 0, 0, newWidth, newHeight);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) =>
          b
            ? resolve(b)
            : reject(
                new ImageValidationError("リサイズ後の画像生成に失敗しました。")
              ),
        "image/png"
      );
    });

    return {
      blob,
      url: URL.createObjectURL(blob),
      width: newWidth,
      height: newHeight,
      resized: true,
      baseName: getBaseName(file.name),
    };
  } finally {
    bitmap.close();
  }
}

/** ImageData を PNG Blob に変換する */
export async function imageDataToBlob(data: ImageData): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = data.width;
  canvas.height = data.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas の初期化に失敗しました。");
  ctx.putImageData(data, 0, 0);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("PNG の生成に失敗しました。"))),
      "image/png"
    );
  });
}

/**
 * 推論専用の前処理：ガンマ補正でシャドウ部を持ち上げ、
 * 黒背景と被写体エッジの分離をしやすくする。
 * ※ この画像は AI モデルへの入力のみに使い、出力画素には使用しない。
 */
export async function enhanceForInference(blob: Blob): Promise<Blob> {
  const GAMMA = 0.7;
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    lut[i] = Math.round(255 * Math.pow(i / 255, GAMMA));
  }
  const data = await blobToImageData(blob);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = lut[d[i]];
    d[i + 1] = lut[d[i + 1]];
    d[i + 2] = lut[d[i + 2]];
  }
  return imageDataToBlob(data);
}

/**
 * AI が生成したマスク（透過 PNG）のアルファだけを元画像に適用する。
 * 出力の RGB 画素は元画像と完全に同一（デザイン・画質無劣化）。
 */
export async function applyMaskAlphaToOriginal(
  original: Blob,
  masked: Blob
): Promise<Blob> {
  const [o, m] = await Promise.all([
    blobToImageData(original),
    blobToImageData(masked),
  ]);
  if (o.width !== m.width || o.height !== m.height) {
    throw new Error("マスクと元画像のサイズが一致しません。");
  }
  const out = new ImageData(o.width, o.height);
  const od = o.data;
  const md = m.data;
  const rd = out.data;
  for (let i = 0; i < od.length; i += 4) {
    rd[i] = od[i];
    rd[i + 1] = od[i + 1];
    rd[i + 2] = od[i + 2];
    rd[i + 3] = md[i + 3];
  }
  return imageDataToBlob(out);
}

/**
 * アルファチャンネルにスムーズステップ閾値を適用し、
 * 影・半透明のもや（黒背景写真で残りがち）を除去する。
 * @param strength 0（無効）〜100（強）
 */
export async function applyAlphaCurve(
  blob: Blob,
  strength: number
): Promise<Blob> {
  if (strength <= 0) return blob;
  const low = strength * 1.6; // 0〜160
  const high = Math.min(255, low + 64);
  const data = await blobToImageData(blob);
  const d = data.data;
  for (let i = 3; i < d.length; i += 4) {
    const a = d[i];
    if (a <= low) {
      d[i] = 0;
    } else if (a < high) {
      const t = (a - low) / (high - low);
      d[i] = Math.round(255 * t * t * (3 - 2 * t));
    } else {
      d[i] = 255;
    }
  }
  return imageDataToBlob(data);
}

/** Blob から ImageData を取得する */
export async function blobToImageData(blob: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas の初期化に失敗しました。");
    }
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

/** Blob をファイルとしてダウンロードさせる */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
