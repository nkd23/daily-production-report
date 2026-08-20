import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: path.join(__dirname),
  },
  // Lets other devices on the LAN load the dev server via the machine's IP
  // instead of only localhost - Next.js blocks cross-origin dev requests by
  // default (see allowedDevOrigins docs).
  allowedDevOrigins: ["172.17.6.145"],
};

export default nextConfig;
