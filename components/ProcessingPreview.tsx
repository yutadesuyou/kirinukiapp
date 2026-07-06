"use client";

import type { RemovalProgress } from "@/lib/backgroundRemoval";

interface ProcessingPreviewProps {
  originalUrl: string;
  transparentUrl: string | null;
  svgMarkup: string | null;
  progress: RemovalProgress | null;
  isTracing: boolean;
}

function ProgressBar({ ratio }: { ratio?: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
      {ratio !== undefined ? (
        <div
          className="h-full rounded-full bg-blue-500 transition-all duration-200"
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      ) : (
        <div className="h-full w-1/3 animate-pulse rounded-full bg-blue-500" />
      )}
    </div>
  );
}

function PanelFrame({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
        {title}
      </div>
      <div className="flex min-h-64 flex-1 items-center justify-center p-3">
        {children}
      </div>
    </div>
  );
}

/**
 * 元画像／透過 PNG／SVG 輪郭の 3 面比較プレビュー。
 * 処理中はプログレス（モデルロード → 推論の 2 段階）を表示する。
 */
export default function ProcessingPreview({
  originalUrl,
  transparentUrl,
  svgMarkup,
  progress,
  isTracing,
}: ProcessingPreviewProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <PanelFrame title="① 元画像">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={originalUrl}
          alt="元画像"
          className="max-h-96 max-w-full object-contain"
        />
      </PanelFrame>

      <PanelFrame title="② 背景除去（透過PNG）">
        {transparentUrl ? (
          <div className="checkerboard flex max-h-96 items-center justify-center rounded p-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={transparentUrl}
              alt="背景除去後の透過PNG"
              className="max-h-[23rem] max-w-full object-contain"
            />
          </div>
        ) : progress ? (
          <div className="w-full max-w-xs space-y-3 text-center">
            <p className="text-sm font-medium text-slate-700">
              {progress.stage === "loading-model"
                ? "ステップ 1/2：AIモデルを読み込んでいます…"
                : "ステップ 2/2：背景を除去しています…"}
            </p>
            <ProgressBar ratio={progress.ratio} />
            {progress.stage === "loading-model" && (
              <p className="text-xs text-slate-500">
                初回はモデルのダウンロードに数秒〜十数秒かかります。
                2回目以降は高速に処理されます。
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-400">処理待ち</p>
        )}
      </PanelFrame>

      <PanelFrame title="③ 輪郭SVGパス（アウトライン）">
        {svgMarkup ? (
          <div
            className="flex max-h-96 w-full items-center justify-center [&_svg]:max-h-[23rem] [&_svg]:h-auto [&_svg]:w-auto [&_svg]:max-w-full"
            // トレース結果の SVG をインライン表示（自アプリ内で生成した安全なデータ）
            dangerouslySetInnerHTML={{ __html: svgMarkup }}
          />
        ) : isTracing ? (
          <div className="w-full max-w-xs space-y-3 text-center">
            <p className="text-sm font-medium text-slate-700">
              輪郭をトレースしています…
            </p>
            <ProgressBar />
          </div>
        ) : (
          <p className="text-sm text-slate-400">処理待ち</p>
        )}
      </PanelFrame>
    </div>
  );
}
