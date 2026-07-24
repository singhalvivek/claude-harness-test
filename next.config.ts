import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp is a native module; keep it external so Next does not try to bundle
  // its prebuilt binaries into the server output.
  serverExternalPackages: ["sharp", "@prisma/client"],
};

export default nextConfig;
