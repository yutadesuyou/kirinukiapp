/** @type {import('next').NextConfig} */
const nextConfig = {
  // Docker デプロイ用にスタンドアロン出力を有効化
  output: "standalone",
  // onnxruntime-web（@imgly/background-removal の依存）の minified バンドルを
  // SWC が解析できないため、Terser にフォールバックする
  swcMinify: false,
};

export default nextConfig;
