/**
 * imagetracerjs のラッパー。
 * 透過 PNG のアルファチャンネルから二値マスクを生成し、
 * 輪郭をトレースして SVG パスを抽出する。すべてブラウザ内で完結する。
 */

import { blobToImageData } from "./imageUtils";

export class SvgTraceError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SvgTraceError";
  }
}

export interface TraceOptions {
  /**
   * パスの滑らかさ（0.5〜5.0 目安）。
   * 小さいほど輪郭に忠実、大きいほど滑らかで単純なパスになる。
   */
  smoothness: number;
  /** アルファ二値化の閾値（0〜255）。既定 128 */
  alphaThreshold?: number;
}

export const DEFAULT_SMOOTHNESS = 1.0;
const DEFAULT_ALPHA_THRESHOLD = 128;

/** 被写体＝黒 / 背景＝白 の二値マスク ImageData を生成する */
function buildBinaryMask(src: ImageData, alphaThreshold: number): ImageData {
  const mask = new ImageData(src.width, src.height);
  const s = src.data;
  const d = mask.data;
  for (let i = 0; i < s.length; i += 4) {
    const isSubject = s[i + 3] >= alphaThreshold;
    const v = isSubject ? 0 : 255;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
    d[i + 3] = 255;
  }
  return mask;
}

/**
 * トレース結果の SVG から背景（白）のパスを取り除き、
 * 輪郭線（黒ストローク・塗りなし）の SVG に変換する。
 */
function toOutlineSvg(rawSvg: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(rawSvg, "image/svg+xml");
  const svg = doc.documentElement;

  if (svg.nodeName !== "svg") {
    throw new SvgTraceError("SVG の生成結果を解析できませんでした。");
  }

  const paths = Array.from(svg.querySelectorAll("path"));
  let kept = 0;
  for (const path of paths) {
    const fill = (path.getAttribute("fill") ?? "").replace(/\s/g, "");
    // 白（背景）パスを除去し、黒（被写体）パスのみ残す
    const isBackground =
      fill.includes("255,255,255") ||
      fill === "#ffffff" ||
      fill === "#fff" ||
      fill === "white";
    if (isBackground) {
      path.remove();
      continue;
    }
    // 輪郭線表示：塗りなし・黒ストローク
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#000000");
    path.setAttribute("stroke-width", "2");
    path.removeAttribute("opacity");
    path.removeAttribute("stroke-opacity");
    kept++;
  }

  if (kept === 0) {
    throw new SvgTraceError(
      "輪郭を検出できませんでした。被写体が写っている画像かご確認ください。"
    );
  }

  // width/height 属性から viewBox を補完（拡大縮小表示のため）
  if (!svg.getAttribute("viewBox")) {
    const w = svg.getAttribute("width");
    const h = svg.getAttribute("height");
    if (w && h) {
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    }
  }
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  return new XMLSerializer().serializeToString(svg);
}

/**
 * 透過 PNG の Blob から輪郭 SVG 文字列を生成する。
 */
export async function traceToSvg(
  transparentPng: Blob,
  options: TraceOptions
): Promise<string> {
  const { smoothness, alphaThreshold = DEFAULT_ALPHA_THRESHOLD } = options;

  const ImageTracer = (await import("imagetracerjs")).default;

  try {
    const imageData = await blobToImageData(transparentPng);
    const mask = buildBinaryMask(imageData, alphaThreshold);

    const rawSvg = ImageTracer.imagedataToSVG(mask, {
      // 固定 2 色パレット（黒＝被写体 / 白＝背景）で決定的にトレース
      pal: [
        { r: 0, g: 0, b: 0, a: 255 },
        { r: 255, g: 255, b: 255, a: 255 },
      ],
      colorsampling: 0,
      numberofcolors: 2,
      colorquantcycles: 1,
      // 滑らかさ：直線・曲線の許容誤差に反映
      ltres: smoothness,
      qtres: smoothness,
      // 小さなノイズパスを除去
      pathomit: 8,
      rightangleenhance: false,
      strokewidth: 0,
      linefilter: false,
      roundcoords: 1,
      viewbox: true,
      desc: false,
    });

    return toOutlineSvg(rawSvg);
  } catch (err) {
    if (err instanceof SvgTraceError) throw err;
    throw new SvgTraceError(
      "SVG パスの抽出に失敗しました。別の画像で再度お試しください。",
      { cause: err }
    );
  }
}
