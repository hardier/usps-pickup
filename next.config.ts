import type { NextConfig } from 'next';

const config: NextConfig = {
  serverExternalPackages: ['playwright-core', '@sparticuz/chromium-min'],
};

export default config;
