import path from 'path';
import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const packageJsonText = readFileSync(new URL('./package.json', import.meta.url), { encoding: 'utf-8' });
    const packageJson = JSON.parse(packageJsonText) as unknown;
    const appVersion =
      typeof packageJson === 'object' && packageJson !== null && 'version' in packageJson && typeof (packageJson as { version?: unknown }).version === 'string'
        ? (packageJson as { version: string }).version
        : '0.0.0';
    return {
      base: mode === 'production' ? './' : '/',
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        __APP_VERSION__: JSON.stringify(appVersion),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
