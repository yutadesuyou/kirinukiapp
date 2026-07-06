# 画像パス抜きツール（kirinukiapp）

> **🔒 画像データは一切サーバーに送信されません。**
> 背景除去（AI推論）と SVG パス抽出は、すべてお使いのブラウザ内（WASM）で実行されます。
> サーバーの役割はこの Web アプリの配信のみで、画像処理サーバーは存在しません。

EC 商品画像の背景抜き作業を効率化する社内向け Web アプリです。
画像をドラッグ&ドロップするだけで、以下の 2 つを生成・ダウンロードできます。

1. **背景透過 PNG**（`元ファイル名_transparent.png`）
2. **輪郭線の SVG パス**（`元ファイル名_outline.svg`）

## 対応環境

| 項目 | 要件 |
|---|---|
| ブラウザ | **Chrome / Edge 最新版**（WASM・WebGL 対応が前提） |
| 入力形式 | JPEG / PNG / WebP |
| サイズ上限 | 1 枚あたり 10MB・長辺 4000px（超過時は自動縮小＋警告表示） |

> ⏳ **初回のみ**、AI モデル（約 90MB）の読み込みに数秒〜十数秒かかります。
> 2 回目以降はブラウザキャッシュにより高速に処理されます。
>
> AI モデル・WASM アセットは**このアプリ自身が配信**します（自己ホスト構成）。
> 実行時（ブラウザ）に外部 CDN への接続は発生しないため、**社内ネットワーク限定の環境でも動作します**。

## 技術スタック

- [Next.js 14](https://nextjs.org/)（App Router）+ TypeScript
- [Tailwind CSS](https://tailwindcss.com/)
- [@imgly/background-removal](https://github.com/imgly/background-removal-js) — クライアントサイド AI 背景除去（MIT ライセンス）
- [imagetracerjs](https://github.com/jankovicsandras/imagetracerjs) — アルファマスクからの SVG 輪郭トレース

## セットアップ（開発）

```bash
# 依存パッケージのインストール
npm install

# 開発サーバー起動（http://localhost:3000）
npm run dev
```

> `npm run dev` / `npm run build` の実行前に、AI モデルアセット（約 160MB）が
> `public/imgly-data/` へ自動ダウンロードされます（`scripts/fetch-model-assets.mjs`）。
> **この取得時のみインターネット接続が必要**です。取得済みの場合はスキップされます。
> 手動で取得する場合は `npm run fetch-assets` を実行してください。

## 本番ビルド

```bash
npm run build
npm run start
```

## Docker で起動（社内サーバーデプロイ用）

```bash
# イメージのビルド
docker build -t kirinukiapp .

# コンテナ起動（http://localhost:3000）
docker run -p 3000:3000 kirinukiapp
```

## Vercel へのデプロイ

リポジトリを Vercel に接続するだけでデプロイできます（追加設定・`vercel.json` は不要です）。
ビルドコマンド等は自動検出されます。

## 使い方

1. トップ画面に画像をドラッグ&ドロップ（またはクリックして選択）
2. 背景除去が自動実行されます（モデルロード → 推論の 2 段階プログレス表示）
3. 「元画像／透過 PNG／輪郭 SVG」の 3 面プレビューで結果を確認
4. **手動補正**：AI が台・スタンドなどを誤って含めた／削りすぎた場合は、
   中央パネルを直接なぞって補正できます
   - **消す**：不要な部分（例：ジッポライターの下の台）を透明化
   - **戻す**：切り抜かれすぎた部分を元画像から復元
   - ブラシ太さ調整・元に戻す（10回まで）・AI結果へのリセットに対応
   - 補正すると輪郭 SVG も自動で再生成されます
5. スライダーでトレース精度（パスの滑らかさ）を調整可能
6. 「透過 PNG」「輪郭 SVG」ボタンでダウンロード

> 📐 出力される透過 PNG は**元画像とまったく同じピクセルサイズ・無劣化**です。
> 変わるのは透明化された部分のみで、商品部分の画素・デザインは一切変更されません
> （長辺 4000px 超で自動縮小された場合のみ例外・画面に警告表示）。

## ディレクトリ構成

```
/app
  page.tsx               … メイン画面
  layout.tsx / globals.css
/components
  ImageDropzone.tsx      … ドラッグ&ドロップアップロード UI
  ProcessingPreview.tsx  … 3面比較プレビュー＋プログレス表示
  RefineCanvas.tsx       … 手動補正（消す/戻すブラシ・Undo・リセット）
  DownloadPanel.tsx      … ダウンロードボタン
/lib
  imageUtils.ts          … バリデーション・自動リサイズ・ダウンロード補助
  backgroundRemoval.ts   … @imgly/background-removal ラッパー
  svgTrace.ts            … imagetracerjs ラッパー（アルファマスク→輪郭SVG）
/scripts
  fetch-model-assets.mjs … AIモデルアセットの自己ホスト用ダウンロード
/public/imgly-data       … 自己ホストされたモデル・WASM（git管理外・自動取得）
/types
  imagetracerjs.d.ts     … imagetracerjs の型定義
Dockerfile               … 社内サーバーデプロイ用
```

## スコープ外（将来拡張）

- アクセス制限（Basic 認証等）— 社内限定公開が必要になった場合に後付け予定
- 複数画像のバッチ処理 — 処理ロジックは 1 枚単位で分離済みのため拡張可能
