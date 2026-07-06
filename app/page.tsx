"use client";

import { useCallback, useEffect, useState } from "react";
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
  /** AI 背景除去の結果（手動補正のリセット先） */
  const [aiPng, setAiPng] = useState<Blob | null>(null);
  /** 現在の透過 PNG（手動補正が反映された最新版。DL・SVG 生成の元） */
  const [currentPng, setCurrentPng] = useState<Blob | null>(null);
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null);
  const [progress, setProgress] = useState<RemovalProgress | null>(null);
  const [isTracing, setIsTracing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [smoothness, setSmoothness] = useState(DEFAULT_SMOOTHNESS);

  const reset = useCallback(() => {
    setImage((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setAiPng(null);
    setCurrentPng(null);
    setSvgMarkup(null);
    setProgress(null);
    setIsTracing(false);
    setIsProcessing(false);
    setError(null);
    setWarning(null);
    setSmoothness(DEFAULT_SMOOTHNESS);
  }, []);

  const handleFileSelected = useCallback(
    async (file: File) => {
      reset();
      setIsProcessing(true);

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
      setAiPng(png);
      setCurrentPng(png); // ここから下流（SVG トレース）は effect が担当
      setIsProcessing(false);
    },
    [reset]
  );

  // 手動補正の確定時：最新の透過 PNG に差し替え（SVG は effect が再生成）
  const handleEdited = useCallback((blob: Blob) => {
    setCurrentPng(blob);
  }, []);

  // 透過 PNG／滑らかさが変わったら SVG を再トレース（300ms デバウンス）
  useEffect(() => {
    if (!currentPng) return;
    let cancelled = false;
    setIsTracing(true);
    const timer = setTimeout(async () => {
      try {
        const svg = await traceToSvg(currentPng, { smoothness });
        if (!cancelled) setSvgMarkup(svg);
      } catch (err) {
        if (!cancelled) {
          setSvgMarkup(null);
          setError(
            err instanceof SvgTraceError
              ? err.message
              : "SVG パスの抽出中に予期しないエラーが発生しました。"
          );
        }
      } finally {
        if (!cancelled) setIsTracing(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [currentPng, smoothness]);

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
                {currentPng && (
                  <span className="ml-2 text-xs text-slate-500">
                    出力サイズ：{image.width}×{image.height}px（元画像と同一・無劣化）
                  </span>
                )}
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
              originalBlob={image.blob}
              aiResult={aiPng}
              onEdited={handleEdited}
              svgMarkup={svgMarkup}
              progress={progress}
              isTracing={isTracing}
            />

            {currentPng && (
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
              transparentPng={currentPng}
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
