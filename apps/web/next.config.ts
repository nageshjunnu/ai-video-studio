import type { NextConfig } from 'next';
import path from 'node:path';
const nextConfig: NextConfig = {
 reactStrictMode: true,
 serverExternalPackages: [
  '@ffmpeg-installer/ffmpeg',
  '@ffmpeg-installer/linux-x64',
  '@ffprobe-installer/ffprobe',
  '@ffprobe-installer/linux-x64',
 ],
 outputFileTracingRoot: path.join(__dirname, '../..'),
 outputFileTracingIncludes: {
  '/api/render': [
   'node_modules/@ffmpeg-installer/linux-x64/**/*',
   'node_modules/@ffprobe-installer/linux-x64/**/*',
   '../../node_modules/@ffmpeg-installer/linux-x64/**/*',
   '../../node_modules/@ffprobe-installer/linux-x64/**/*',
  ],
 },
};
export default nextConfig;
