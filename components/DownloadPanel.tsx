"use client";

import { downloadBlob } from "@/lib/imageUtils";

interface DownloadPanelProps {
  baseName: string;
  transparentPng: Blob | null;
  svgMarkup: string | null;
}

/**
 * 透過 PNG / SVG のダウンロードパネル。
 * ファイル名は元ファイル名を引き継ぐ（例：product1_transparent.png）。
 */
export default function DownloadPanel({
  baseName,
  transparentPng,
  svgMarkup,
}: DownloadPanelProps) {
  const pngName = `${baseName}_transparent.png`;
  const svgName = `${baseName}_outline.svg`;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
      <h2 className="text-sm font-semibold text-slate-700 sm:mr-auto">
        ダウンロード
      </h2>
      <button
        type="button"
        disabled={!transparentPng}
        onClick={() => transparentPng && downloadBlob(transparentPng, pngName)}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        <DownloadIcon />
        透過PNG（{pngName}）
      </button>
      <button
        type="button"
        disabled={!svgMarkup}
        onClick={() =>
          svgMarkup &&
          downloadBlob(
            new Blob([svgMarkup], { type: "image/svg+xml" }),
            svgName
          )
        }
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        <DownloadIcon />
        輪郭SVG（{svgName}）
      </button>
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
      />
    </svg>
  );
}
