"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ImageDropzone from "@/components/ImageDropzone";
import ProcessingPreview from "@/components/ProcessingPreview";
import DownloadPanel from "@/components/DownloadPanel";
import {
  validateAndLoadImage,
  ImageValidationError,
  type LoadedImage,
} from "@/lib/imageUtils";
import {
  removeImageBackground,
  BackgroundRemovalError,
  type RemovalProgress,
} from "@/lib/backgroundRemoval";
import {
  traceToSvg,
  SvgTraceError,
  DEFAULT_SMOOTHNESS,
} from "@/lib/svgTrace";

export default function Home() {
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [transparentPng, setTransparentPng] = useState<Blob | null>(null);
  const [transparentUrl, setTransparentUrl] = useState<string | null>(null);
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null);
  const [progress, setProgress] = useState<RemovalProgress | null>(null);
  const [isTracing, setIsTracing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [smoothness, setSmoothness] = useState(DEFAULT_SMOOTHNESS);

  // スライダー変更時の再トレースを管理（連続変更時は最後の値のみ反映）
  const traceSeqRef = useRef(0);

  const revokeUrls = useCallback(() => {
    setImage((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return prev;
    });
    setTransparentUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return prev;
    });
  }, []);

  const reset = useCallback(() => {
    revokeUrls();
    setImage(null);
    setTransparentPng(null);
    setTransparentUrl(null);
    setSvgMarkup(null);
    setProgress(null);
    setIsTracing(false);
    setIsProcessing(false);
    setError(null);
    setWarning(null);
    setSmoothness(DEFAULT_SMOOTHNESS);
  }, [revokeUrls]);

  const runTrace = useCallback(
    async (png: Blob, smooth: number) => {
      const seq = ++traceSeqRef.current;
      setIsTracing(true);
      setSvgMarkup(null);
      try {
        const svg = await traceToSvg(png, { smoothness: smooth });
        if (traceSeqRef.current === seq) {
          setSvgMarkup(svg);
        }
      } catch (err) {
        if (traceSeqRef.current === seq) {
          setError(
            err instanceof SvgTraceError
              ? err.message
              : "SVG パスの抽出中に予期しないエラーが発生しました。"
          );
        }
      } finally {
        if (traceSeqRef.current === seq) {
          setIsTracing(false);
        }
      }
    },
    []
  );

  const handleFileSelected = useCallback(
    async (file: File) => {
      reset();
      setIsProcessing(true);
      setError(null);

      let loaded: LoadedImage;
      try {
        loaded = await validateAndLoadImage(file);
      } catch (err) {
        setIsProcessing(false);
        setError(
          err instanceof ImageValidationError
            ? err.message
            : "画像の読み込み中に予期しないエラーが発生しました。"
        );
        return;
      }

      setImage(loaded);
      if (loaded.resized) {
        setWarning(
          `画像の長辺が4000pxを超えていたため、${loaded.width}×${loaded.height}px に自動縮小しました。`
        );
      }

      // 背景除去
      let png: Blob;
      try {
        setProgress({ stage: "loading-model" });
        png = await removeImageBackground(loaded.blob, setProgress);
      } catch (err) {
        setProgress(null);
        setIsProcessing(false);
        setError(
          err instanceof BackgroundRemovalError
            ? err.message
            : "背景除去処理中に予期しないエラーが発生しました。"
        );
        return;
      }

      setProgress(null);
      setTransparentPng(png);
      setTransparentUrl(URL.createObjectURL(png));

      // SVG トレース
      await runTrace(png, DEFAULT_SMOOTHNESS);
      setIsProcessing(false);
    },
    [reset, runTrace]
  );

  // スライダー変更時に再トレース（300ms デバウンス）
  useEffect(() => {
    if (!transparentPng) return;
    const timer = setTimeout(() => {
      void runTrace(transparentPng, smoothness);
    }, 300);
    return () => clearTimeout(timer);
    // transparentPng 設定直後の初回トレースは handleFileSelected 側で実行済み
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smoothness]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">
          画像パス抜きツール
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          商品画像の背景をAIで除去し、透過PNGと輪郭SVGパスを生成します。
          <span className="font-medium text-emerald-700">
            画像はサーバーに送信されず、すべてブラウザ内で処理されます。
          </span>
        </p>
        <p className="mt-1 text-xs text-slate-500">
          対応ブラウザ：Chrome / Edge 最新版　※初回はAIモデルの読み込みに数秒〜十数秒かかります
        </p>
      </header>

      <div className="space-y-4">
        {!image && (
          <ImageDropzone
            onFileSelected={handleFileSelected}
            disabled={isProcessing}
          />
        )}

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            <span className="font-semibold">エラー：</span>
            {error}
          </div>
        )}

        {warning && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <span className="font-semibold">お知らせ：</span>
            {warning}
          </div>
        )}

        {image && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-600">
                <span className="font-medium">{image.baseName}</span>（
                {image.width}×{image.height}px）
              </p>
              <button
                type="button"
                onClick={reset}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
              >
                別の画像を選択
              </button>
            </div>

            <ProcessingPreview
              originalUrl={image.url}
              transparentUrl={transparentUrl}
              svgMarkup={svgMarkup}
              progress={progress}
              isTracing={isTracing}
            />

            {transparentPng && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <label
                  htmlFor="smoothness"
                  className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-700"
                >
                  <span>トレース精度（パスの滑らかさ）</span>
                  <span className="font-mono text-slate-500">
                    {smoothness.toFixed(1)}
                  </span>
                </label>
                <input
                  id="smoothness"
                  type="range"
                  min={0.5}
                  max={5}
                  step={0.1}
                  value={smoothness}
                  disabled={isTracing}
                  onChange={(e) => setSmoothness(Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
                <div className="mt-1 flex justify-between text-xs text-slate-500">
                  <span>細かい（輪郭に忠実）</span>
                  <span>滑らか（パスを単純化）</span>
                </div>
              </div>
            )}

            <DownloadPanel
              baseName={image.baseName}
              transparentPng={transparentPng}
              svgMarkup={svgMarkup}
            />
          </>
        )}
      </div>

      <footer className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-400">
        画像処理はすべてお使いのブラウザ内で完結します。アップロードした画像が外部サーバーへ送信されることはありません。
      </footer>
    </main>
  );
}
