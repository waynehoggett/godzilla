import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

// Short build id shown in feedback reports: commit when known, otherwise the build date.
let build = process.env.BUILD_ID || (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7);
if (!build) { try { build = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { build = new Date().toISOString().slice(0, 10); } }

export default defineConfig({
  define: { __BUILD__: JSON.stringify(build) },
  build: { target: 'es2020', chunkSizeWarningLimit: 1200 },
  server: { host: true },
});
