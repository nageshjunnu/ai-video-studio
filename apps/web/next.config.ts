import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
 reactStrictMode: true,
 serverExternalPackages: ['@ffmpeg-installer/ffmpeg', '@ffprobe-installer/ffprobe'],
};
export default nextConfig;
