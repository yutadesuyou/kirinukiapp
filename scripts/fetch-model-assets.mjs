/**
 * @imgly/background-removal の AI モデル・WASM アセットを
 * public/imgly-data/ にダウンロードして自己ホストするスクリプト。
 *
 * これにより実行時（ブラウザ）は外部 CDN に接続せず、
 * アプリを配信するサーバーからのみアセットを取得する。
 * 社内ネットワーク限定の環境でも動作する。
 *
 * `npm run build` / `npm run dev` の前に自動実行される（prebuild / predev）。
 * ダウンロード済みのファイルはスキップされる。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(rootDir, "public", "imgly-data");

// package.json は exports 制限があるため直接読み込む
const pkg = JSON.parse(
  fs.readFileSync(
    path.join(rootDir, "node_modules", "@imgly", "background-removal", "package.json"),
    "utf-8"
  )
);
const CDN_BASE = `https://staticimgly.com/@imgly/background-removal-data/${pkg.version}/dist/`;

// ミラー対象のリソースキー。
// フルサイズの "/models/isnet"（約170MB）は使用しないため除外している。
const RESOURCE_KEYS = [
  "/onnxruntime-web/ort-wasm-simd-threaded.wasm",
  "/onnxruntime-web/ort-wasm-simd-threaded.mjs",
  "/onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm",
  "/onnxruntime-web/ort-wasm-simd-threaded.jsep.mjs",
  "/models/isnet_fp16",
  "/models/isnet_quint8",
];

const RETRIES = 4;
const CONCURRENCY = 4;

async function fetchWithRetry(url) {
  let lastErr;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastErr = err;
      const wait = 1000 * 2 ** attempt;
      console.warn(`  retry ${attempt + 1}/${RETRIES} (${err.message}) in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`AI モデルアセットを取得します: ${CDN_BASE}`);
  const resourcesBuf = await fetchWithRetry(new URL("resources.json", CDN_BASE));
  const resources = JSON.parse(resourcesBuf.toString("utf-8"));

  // チャンク一覧を収集（期待サイズ = offsets[1] - offsets[0]）
  const jobs = [];
  for (const key of RESOURCE_KEYS) {
    const entry = resources[key];
    if (!entry?.chunks) {
      console.warn(`  警告: resources.json に ${key} が見つかりません`);
      continue;
    }
    for (const chunk of entry.chunks) {
      jobs.push({
        name: chunk.name,
        size: chunk.offsets ? chunk.offsets[1] - chunk.offsets[0] : null,
      });
    }
  }

  // 未使用エントリを除いた resources.json を配置
  const filtered = Object.fromEntries(
    Object.entries(resources).filter(([k]) => RESOURCE_KEYS.includes(k))
  );
  fs.writeFileSync(
    path.join(outDir, "resources.json"),
    JSON.stringify(filtered)
  );

  let done = 0;
  let skipped = 0;
  const queue = [...jobs];

  async function worker() {
    for (;;) {
      const job = queue.shift();
      if (!job) return;
      const dest = path.join(outDir, job.name);
      if (fs.existsSync(dest)) {
        const stat = fs.statSync(dest);
        if (job.size === null || stat.size === job.size) {
          skipped++;
          continue;
        }
      }
      const buf = await fetchWithRetry(new URL(job.name, CDN_BASE));
      if (job.size !== null && buf.length !== job.size) {
        throw new Error(
          `サイズ不一致: ${job.name}（期待 ${job.size} / 実際 ${buf.length}）`
        );
      }
      fs.writeFileSync(dest, buf);
      done++;
      console.log(`  [${done + skipped}/${jobs.length}] ${job.name.slice(0, 16)}… (${(buf.length / 1024 / 1024).toFixed(1)}MB)`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const totalMB =
    jobs.reduce((s, j) => s + (j.size ?? 0), 0) / 1024 / 1024;
  console.log(
    `完了: ${done} 件ダウンロード / ${skipped} 件スキップ（合計 約${totalMB.toFixed(0)}MB） → public/imgly-data/`
  );
}

main().catch((err) => {
  console.error("モデルアセットの取得に失敗しました:", err.message);
  process.exit(1);
});
