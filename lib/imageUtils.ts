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
