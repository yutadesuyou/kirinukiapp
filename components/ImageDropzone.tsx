"use client";

import { useCallback, useRef, useState } from "react";

interface ImageDropzoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

/**
 * ドラッグ&ドロップ / クリック選択の両対応の画像アップロード UI。
 */
export default function ImageDropzone({
  onFileSelected,
  disabled = false,
}: ImageDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (disabled || !files || files.length === 0) return;
      onFileSelected(files[0]);
    },
    [disabled, onFileSelected]
  );

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="画像をアップロード"
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setIsDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={`flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
        disabled
          ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
          : isDragOver
            ? "border-blue-500 bg-blue-50"
            : "border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50/50"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          handleFiles(e.target.files);
          // 同じファイルを再選択できるようリセット
          e.target.value = "";
        }}
      />
      <svg
        className="mb-3 h-10 w-10 text-slate-400"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
        />
      </svg>
      <p className="text-base font-medium">
        ここに画像をドラッグ&ドロップ
        <span className="block text-sm font-normal text-slate-500">
          またはクリックしてファイルを選択
        </span>
      </p>
      <p className="mt-3 text-xs text-slate-500">
        対応形式：JPEG / PNG / WebP　（上限：10MB・長辺4000px、超過時は自動縮小）
      </p>
    </div>
  );
}
