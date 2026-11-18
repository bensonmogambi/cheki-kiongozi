// Local-only demonstration mode. It is deliberately rejected on non-loopback hosts.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.MVP_DEMO_MODE = 'true';
process.env.HOST = '127.0.0.1';
process.env.SCORECARD_DATA_DIR ||= path.join(path.dirname(fileURLToPath(import.meta.url)), 'data-demo');
await import('./server.mjs');
