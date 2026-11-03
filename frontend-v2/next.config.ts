import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@react-pdf/renderer"],
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@hugeicons/react",
      "dayjs",
      "recharts",
      "framer-motion",
    ],
  },
  webpack: (config) => {
    // MediaPipe's prebuilt bundle contains an unused computed import.
    // https://github.com/google-ai-edge/mediapipe/issues/6285
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      {
        module: /[\\/]@mediapipe[\\/]tasks-vision[\\/]vision_bundle\.mjs/,
        message: /Critical dependency: the request of a dependency is an expression/,
      },
    ];
    config.module.rules.push({
      test: /\.m?js$/,
      resolve: {
        fullySpecified: false,
      },
    });
    
    // Fix monaco-vim attempting to import a strict ESM path that conflicts with monaco-editor's package.json exports
    config.resolve.alias = {
      ...config.resolve.alias,
      "monaco-editor/esm/vs/editor/editor.api": path.resolve(process.cwd(), "node_modules/monaco-editor/esm/vs/editor/editor.api.js"),
      "@vladmandic/human": path.resolve(process.cwd(), "node_modules/@vladmandic/human/dist/human.esm.js"),
    };
    
    return config;
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: process.env.INTERNAL_BACKEND_URL || "http://127.0.0.1:5001/api/:path*",
      },
      {
        source: "/uploads/:path*",
        destination: `${(process.env.INTERNAL_BACKEND_URL || "http://127.0.0.1:5001/api").replace(/\/api\/?$/, "")}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
