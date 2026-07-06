import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "画像パス抜きツール | 背景除去 & SVG輪郭抽出",
  description:
    "ブラウザ内で完結する商品画像の背景除去・SVGパス抽出ツール。画像はサーバーに送信されません。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
