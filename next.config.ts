import type { NextConfig } from "next";

function allowedDevOrigins(): string[] {
  return (
    process.env.ALLOWED_DEV_ORIGINS?.split(",")
      .map((value) => value.trim())
      .filter(Boolean) ?? []
  );
}

const devOrigins = allowedDevOrigins();

const nextConfig: NextConfig = {
  output: "standalone",
  ...(devOrigins.length > 0 ? { allowedDevOrigins: devOrigins } : {}),
};

export default nextConfig;
