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

> ⏳ **初回のみ**、AI モデル（約 40〜80MB）のダウンロードに数秒〜十数秒かかります。
> 2 回目以降はブラウザキャッシュにより高速に処理されます。
> ※ モデルファイルは CDN から取得しますが、**画像データが外部に送られることはありません**。

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
4. スライダーでトレース精度（パスの滑らかさ）を調整可能
5. 「透過 PNG」「輪郭 SVG」ボタンでダウンロード

## ディレクトリ構成

```
/app
  page.tsx               … メイン画面
  layout.tsx / globals.css
/components
  ImageDropzone.tsx      … ドラッグ&ドロップアップロード UI
  ProcessingPreview.tsx  … 3面比較プレビュー＋プログレス表示
  DownloadPanel.tsx      … ダウンロードボタン
/lib
  imageUtils.ts          … バリデーション・自動リサイズ・ダウンロード補助
  backgroundRemoval.ts   … @imgly/background-removal ラッパー
  svgTrace.ts            … imagetracerjs ラッパー（アルファマスク→輪郭SVG）
/types
  imagetracerjs.d.ts     … imagetracerjs の型定義
Dockerfile               … 社内サーバーデプロイ用
```

## スコープ外（将来拡張）

- アクセス制限（Basic 認証等）— 社内限定公開が必要になった場合に後付け予定
- 複数画像のバッチ処理 — 処理ロジックは 1 枚単位で分離済みのため拡張可能
