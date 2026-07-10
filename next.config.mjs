import { BASE_PATH } from './site.config.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: BASE_PATH,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
