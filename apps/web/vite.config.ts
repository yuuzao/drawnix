/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig(({ mode }) => {
  // 从环境变量读取WebDAV URL
  const webdavUrl = process.env.VITE_WEBDAV_URL || 'https://file.qwila.xyz';

  return {
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/web',

  server: {
    port: 7200,
    host: 'localhost',
    // 代理WebDAV请求，绕过CORS
    proxy: {
      '/webdav-proxy': {
        target: webdavUrl,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/webdav-proxy/, ''),
        secure: false,
      }
    }
  },

  preview: {
    port: 4300,
    host: 'localhost',
  },

  plugins: [react(), nxViteTsPaths()],

  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [ nxViteTsPaths() ],
  // },

  build: {
    outDir: '../../dist/apps/web',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  };
});
