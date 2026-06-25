import fs from 'node:fs';
import path from 'node:path';

const cacheDir = path.resolve(process.cwd(), '.next');

try {
  fs.rmSync(cacheDir, { recursive: true, force: true });
  console.log('[clean-next-cache] Removed .next cache');
} catch (error) {
  console.error('[clean-next-cache] Failed to remove .next cache');
  console.error(error);
  process.exit(1);
}
