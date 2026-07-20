import type { NextConfig } from 'next';
import path from 'node:path';
import { loadEnvConfig } from '@next/env';

loadEnvConfig(path.join(__dirname, '../..'));

const nextConfig: NextConfig = {
 reactStrictMode: true,
 async headers() {
  return [
   {
    source: '/api/render',
    headers: [
     { key: 'Access-Control-Allow-Origin', value: '*' },
     { key: 'Access-Control-Allow-Methods', value: 'POST, OPTIONS' },
     { key: 'Access-Control-Allow-Headers', value: 'authorization, content-type' },
     { key: 'Access-Control-Max-Age', value: '86400' },
    ],
   },
   {
    source: '/api/render-health',
    headers: [
     { key: 'Access-Control-Allow-Origin', value: '*' },
     { key: 'Access-Control-Allow-Methods', value: 'GET, OPTIONS' },
     { key: 'Access-Control-Allow-Headers', value: 'authorization, content-type' },
    ],
   },
  ];
 },
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
   'apps/web/assets/fonts/**/*',
   'assets/fonts/**/*',
  ],
 },
};
export default nextConfig;
