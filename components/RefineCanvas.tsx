"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Tool = "erase" | "restore";

interface RefineCanvasProps {
  /** 元画像（復元ブラシの参照元） */
  originalBlob: Blob;
  /** AI 背景除去の結果（補正の基準・リセット先） */
  aiResult: Blob;
  /** ブラシ操作が確定するたびに編集後の透過 PNG を通知 */
  onEdited: (blob: Blob) => void;
}

const MAX_UNDO = 10;

/**
 * 透過 PNG の手動補正キャンバス。
 * - 消す：なぞった部分を透明化（台・スタンドなど不要部分の除去）
 * - 戻す：なぞった部分を元画像から復元（切り抜かれすぎた部分の修復)
 * 画像サイズ・画素は編集箇所以外一切変更しない。
 */
export default function RefineCanvas({
  originalBlob,
  aiResult,
  onEdited,
}: RefineCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tmpRef = useRef<HTMLCanvasElement | null>(null);
  const originalRef = useRef<ImageBitmap | null>(null);
  const aiRef = useRef<ImageBitmap | null>(null);
  const undoStack = useRef<ImageBitmap[]>([]);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const strokeMoved = useRef(false);

  const [tool, setTool] = useState<Tool>("erase");
  const [brushSize, setBrushSize] = useState(30);
  const [canUndo, setCanUndo] = useState(false);
  const [edited, setEdited] = useState(false);
  const [ready, setReady] = useState(false);

  // 初期化：AI 結果と元画像を読み込みキャンバスへ描画
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setEdited(false);
    undoStack.current.forEach((b) => b.close());
    undoStack.current = [];
    setCanUndo(false);

    (async () => {
      const [orig, ai] = await Promise.all([
        createImageBitmap(originalBlob),
        createImageBitmap(aiResult),
      ]);
      if (cancelled) {
        orig.close();
        ai.close();
        return;
      }
      originalRef.current?.close();
      aiRef.current?.close();
      originalRef.current = orig;
      aiRef.current = ai;

      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = ai.width;
      canvas.height = ai.height;
      canvas.getContext("2d")?.drawImage(ai, 0, 0);

      const tmp = document.createElement("canvas");
      tmp.width = ai.width;
      tmp.height = ai.height;
      tmpRef.current = tmp;
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [originalBlob, aiResult]);

  /** 表示座標 → キャンバス内部座標 */
  const toCanvasPoint = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }, []);

  /** ブラシ 1 セグメントを描画 */
  const drawSegment = useCallback(
    (
      from: { x: number; y: number },
      to: { x: number; y: number },
      dot: boolean
    ) => {
      const canvas = canvasRef.current;
      const original = originalRef.current;
      if (!canvas || !original) return;
      const ctx = canvas.getContext("2d")!;
      // 表示倍率に応じて実ブラシ径を補正（見た目のサイズを一定に）
      const rect = canvas.getBoundingClientRect();
      const scale = canvas.width / rect.width;
      const width = brushSize * scale;

      const tracePath = (c: CanvasRenderingContext2D) => {
        c.lineCap = "round";
        c.lineJoin = "round";
        c.lineWidth = width;
        if (dot) {
          c.beginPath();
          c.arc(to.x, to.y, width / 2, 0, Math.PI * 2);
          c.fill();
        } else {
          c.beginPath();
          c.moveTo(from.x, from.y);
          c.lineTo(to.x, to.y);
          c.stroke();
        }
      };

      if (tool === "erase") {
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
        ctx.fillStyle = "rgba(0,0,0,1)";
        tracePath(ctx);
        ctx.restore();
      } else {
        // 復元：ストローク形状に元画像を焼き込む
        const tmp = tmpRef.current!;
        const tctx = tmp.getContext("2d")!;
        tctx.save();
        tctx.clearRect(0, 0, tmp.width, tmp.height);
        tctx.strokeStyle = "rgba(0,0,0,1)";
        tctx.fillStyle = "rgba(0,0,0,1)";
        tracePath(tctx);
        tctx.globalCompositeOperation = "source-in";
        tctx.drawImage(original, 0, 0);
        tctx.restore();
        ctx.drawImage(tmp, 0, 0);
      }
    },
    [brushSize, tool]
  );

  const handlePointerDown = useCallback(
    async (e: React.PointerEvent) => {
      if (!ready) return;
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      const canvas = canvasRef.current!;
      // Undo 用スナップショット（GPU コピーで高速）
      const snap = await createImageBitmap(canvas);
      undoStack.current.push(snap);
      if (undoStack.current.length > MAX_UNDO) {
        undoStack.current.shift()?.close();
      }
      setCanUndo(true);
      drawing.current = true;
      strokeMoved.current = false;
      lastPoint.current = toCanvasPoint(e);
    },
    [ready, toCanvasPoint]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drawing.current || !lastPoint.current) return;
      const p = toCanvasPoint(e);
      drawSegment(lastPoint.current, p, false);
      lastPoint.current = p;
      strokeMoved.current = true;
    },
    [drawSegment, toCanvasPoint]
  );

  const commit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setEdited(true);
    canvas.toBlob((blob) => {
      if (blob) onEdited(blob);
    }, "image/png");
  }, [onEdited]);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!drawing.current) return;
      drawing.current = false;
      // クリックのみ（移動なし）の場合は点を打つ
      if (!strokeMoved.current && lastPoint.current) {
        drawSegment(lastPoint.current, lastPoint.current, true);
      }
      lastPoint.current = null;
      commit();
    },
    [commit, drawSegment]
  );

  const handleUndo = useCallback(() => {
    const snap = undoStack.current.pop();
    const canvas = canvasRef.current;
    if (!snap || !canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(snap, 0, 0);
    snap.close();
    setCanUndo(undoStack.current.length > 0);
    commit();
  }, [commit]);

  const handleReset = useCallback(() => {
    const canvas = canvasRef.current;
    const ai = aiRef.current;
    if (!canvas || !ai) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(ai, 0, 0);
    undoStack.current.forEach((b) => b.close());
    undoStack.current = [];
    setCanUndo(false);
    setEdited(false);
    canvas.toBlob((blob) => {
      if (blob) onEdited(blob);
    }, "image/png");
  }, [onEdited]);

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="checkerboard flex items-center justify-center rounded p-1">
        <canvas
          ref={canvasRef}
          className="max-h-[19rem] max-w-full cursor-crosshair touch-none object-contain"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
      </div>

      {/* 補正ツールバー */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="flex overflow-hidden rounded-lg border border-slate-300">
          <button
            type="button"
            onClick={() => setTool("erase")}
            className={`px-3 py-1.5 font-medium transition-colors ${
              tool === "erase"
                ? "bg-red-600 text-white"
                : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            消す
          </button>
          <button
            type="button"
            onClick={() => setTool("restore")}
            className={`px-3 py-1.5 font-medium transition-colors ${
              tool === "restore"
                ? "bg-blue-600 text-white"
                : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            戻す
          </button>
        </div>
        <label className="flex items-center gap-1.5 text-slate-600">
          太さ
          <input
            type="range"
            min={5}
            max={100}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className="w-20 accent-blue-600"
            aria-label="ブラシの太さ"
          />
        </label>
        <button
          type="button"
          onClick={handleUndo}
          disabled={!canUndo}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          元に戻す
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={!edited}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          AIの結果に戻す
        </button>
      </div>
      <p className="text-xs text-slate-500">
        台・スタンドなど不要な部分が残った場合は「<span className="font-medium text-red-700">消す</span>」でなぞって除去、
        切り抜かれすぎた部分は「<span className="font-medium text-blue-700">戻す</span>」でなぞって復元できます。
        補正すると輪郭SVGも自動で再生成されます。
      </p>
    </div>
  );
}
