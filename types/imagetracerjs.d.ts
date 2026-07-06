declare module "imagetracerjs" {
  export interface ImageTracerOptions {
    /** 直線化の許容誤差（大きいほど単純化） */
    ltres?: number;
    /** 曲線化の許容誤差（大きいほど滑らか） */
    qtres?: number;
    /** これ未満のノード数のパスを除去（ノイズ除去） */
    pathomit?: number;
    /** 右角の検出を有効化 */
    rightangleenhance?: boolean;
    /** 0: 固定パレット, 1: ランダムサンプリング, 2: 決定的サンプリング */
    colorsampling?: number;
    /** 出力色数 */
    numberofcolors?: number;
    /** 色量子化の閾値 */
    mincolorratio?: number;
    /** 色量子化の繰り返し回数 */
    colorquantcycles?: number;
    /** 固定パレット */
    pal?: Array<{ r: number; g: number; b: number; a: number }>;
    /** 線の描画幅 */
    strokewidth?: number;
    /** ラインフィルタ */
    linefilter?: boolean;
    /** 出力スケール */
    scale?: number;
    /** 座標の小数点以下桁数 */
    roundcoords?: number;
    /** viewBox を使用 */
    viewbox?: boolean;
    /** 補間の説明を出力 */
    desc?: boolean;
    blurradius?: number;
    blurdelta?: number;
  }

  const ImageTracer: {
    imagedataToSVG(imgd: ImageData, options?: ImageTracerOptions): string;
    imageToSVG(
      url: string,
      callback: (svgstr: string) => void,
      options?: ImageTracerOptions
    ): void;
  };

  export default ImageTracer;
}
