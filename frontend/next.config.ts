import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Standalone output is only for the Docker image; Vercel packages the app
  // itself, and its build adapter fails when standalone tracing is requested.
  output: process.env.VERCEL ? undefined : "standalone",
  turbopack: {
    root: path.join(__dirname),
  },
  // Lets other devices on the LAN load the dev server via the machine's IP
  // instead of only localhost - Next.js blocks cross-origin dev requests by
  // default (see allowedDevOrigins docs).
  allowedDevOrigins: ["172.17.6.103"],
};

export default nextConfig;
