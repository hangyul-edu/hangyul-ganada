/**
 * A server for the built app, started only if one is not already there.
 *
 * ## Why the checks cannot just assume one
 *
 * Two gates render the product in a browser — `qa:locales` and
 * `screens:audit` — and both used to fail with `ERR_CONNECTION_REFUSED`
 * unless somebody had happened to leave `vite preview` running. They passed
 * inside `verify:release` for exactly as long as that was true, and the day it
 * was not, the release chain stopped on a connection error that says nothing
 * about the product. A gate whose result depends on what else is running is
 * not a gate.
 *
 * ## Why it reuses one that is already listening
 *
 * Because starting a second is a port conflict, and because a developer with a
 * preview open wants the check to look at what they are looking at. The reuse
 * is detected by asking, not by a lock file: if something answers on the port,
 * that is the server.
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Whether something is already answering on `url`. */
async function answers(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Ensures a preview server, and returns how to stop it.
 *
 * The returned function is a no-op when the server was already there — it
 * belongs to whoever started it, and killing somebody else's dev server as a
 * side effect of running a check would be its own kind of rude.
 */
export async function ensurePreview(url = 'http://127.0.0.1:4477') {
  if (await answers(url)) return () => {};

  const port = new URL(url).port || '4477';
  const child = spawn(
    'npx',
    ['vite', 'preview', '--port', port, '--strictPort', '--host', '127.0.0.1'],
    { cwd: join(ROOT, 'apps/web'), stdio: 'ignore', detached: true },
  );
  child.unref();

  // Poll rather than parse the banner: the banner is a formatting detail and
  // the thing that matters is whether a request is answered.
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await answers(url)) {
      return () => {
        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch {
          /* already gone */
        }
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
  throw new Error(
    `no preview server on ${url} after 30s — run \`npm run build\` first, ` +
      'since `vite preview` serves `dist` and has nothing to serve without it',
  );
}
