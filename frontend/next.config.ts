import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // This app lives in a `frontend/` subdirectory of the VeriCred repo,
  // alongside the Hardhat project's own package-lock.json. Pin the file
  // tracing root here so Next.js doesn't have to guess (and warn) about it.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
