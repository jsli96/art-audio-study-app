/** @type {import('next').NextConfig} */
const nextConfig = {
  // For research prototypes, it is common to allow remote images.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }, { protocol: "http", hostname: "**" }]
  }
};

export default nextConfig;
