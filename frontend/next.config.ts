import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  webpack(config) {
    // @coinbase/cdp-sdk (pulled in by @base-org/account → @reown/appkit-utils)
    // has a dynamic import of @x402/svm (Solana VM) which isn't installed and
    // is irrelevant for EVM-only usage. Alias it to false so webpack emits an
    // empty module instead of failing.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@x402/svm/exact/client": false,
    };
    return config;
  },
  // Same as the webpack alias above, for `next dev --turbopack` — Turbopack
  // doesn't support aliasing to `false`, so this points at a real empty
  // module instead. Keep both in sync; drop whichever bundler's block once
  // the @x402/svm import itself is removed or made optional upstream.
  turbopack: {
    resolveAlias: {
      "@x402/svm/exact/client": "./src/lib/empty-module.ts",
    },
  },
};

export default nextConfig;
