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
};

export default nextConfig;
