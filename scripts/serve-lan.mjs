#!/usr/bin/env node
/**
 * Serves the app to every device on the same network, and says where.
 *
 *   npm run dev:lan       the dev server, with hot reload
 *   npm run preview:lan   the production build, as it will actually ship
 *
 * ## Why this is not just `vite --host`
 *
 * `--host` binds to every interface, which is the necessary half. The missing
 * half is telling a human which address to type. Vite prints its own list, but
 * on a machine with Docker bridges, WSL adapters and a VPN — which is most
 * development machines — that list has four entries and only one of them
 * reaches a phone. This picks the one that does, prints it once, large, and
 * draws it as a QR code so nobody types an IPv4 address into a phone keyboard.
 *
 * ## The address is detected, never configured
 *
 * A hard-coded IP is wrong the first time the laptop joins a different network,
 * and the failure looks like the server being broken. The address here comes
 * from the machine's own interfaces every time the command runs. `SCORES` below
 * is the whole of the opinion: prefer a real private LAN range, prefer a
 * physically named interface, and never offer something a phone cannot reach.
 */
import { spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';

import qrcode from 'qrcode-terminal';

const mode = process.argv[2] === 'preview' ? 'preview' : 'dev';
const DEFAULT_PORT = mode === 'preview' ? 4173 : 5173;
const port = Number(process.env.PORT ?? DEFAULT_PORT);

/**
 * How much an interface looks like the one a phone can reach.
 *
 * Virtual adapters are the problem this solves: Docker's `172.17.x.x` bridge
 * and WSL's `172.x` host adapter are both private IPv4 and both completely
 * unreachable from a phone, and on many machines they sort ahead of the real
 * wireless adapter.
 */
const SCORES = [
  // A real wireless or wired adapter, by the names the three platforms use.
  [/^(wl|en|eth|wlan|Wi-?Fi|Ethernet)/i, 40],
  // Home and office networks live here far more often than anywhere else.
  [/^192\.168\./, 30],
  [/^10\./, 20],
  // 172.16–31 is private too, but it is also where Docker and WSL live, so it
  // is the last resort rather than an equal.
  [/^172\.(1[6-9]|2\d|3[01])\./, 5],
  // Named like something virtual: almost certainly not reachable.
  [/^(docker|br-|veth|virbr|vmnet|vboxnet|tun|tap|utun|ZeroTier|Loopback)/i, -100],
];

/** Every non-internal IPv4 address on this machine, best candidate first. */
function candidates() {
  const found = [];
  for (const [name, addresses] of Object.entries(networkInterfaces())) {
    for (const address of addresses ?? []) {
      // `family` is the string 'IPv4' on Node 18+ and the number 4 on older
      // builds; both spellings are checked so this cannot silently find
      // nothing.
      const isIPv4 = address.family === 'IPv4' || address.family === 4;
      if (!isIPv4 || address.internal) continue;
      let score = 0;
      for (const [pattern, weight] of SCORES) {
        if (pattern.test(name) || pattern.test(address.address)) score += weight;
      }
      found.push({ name, address: address.address, score });
    }
  }
  return found.sort((a, b) => b.score - a.score);
}

const interfaces = candidates();
const best = interfaces.find((candidate) => candidate.score > 0) ?? interfaces[0];

const lines = [];
lines.push('');
if (best) {
  const url = `http://${best.address}:${port}/`;
  lines.push(`  Hangyul ganada — ${mode === 'preview' ? 'production build' : 'development'}`);
  lines.push('');
  lines.push(`  On this computer   http://localhost:${port}/`);
  lines.push(`  On your phone      ${url}`);
  lines.push(`                     (interface: ${best.name})`);
  if (interfaces.length > 1) {
    lines.push('');
    lines.push('  Other addresses on this machine, if that one does not reach:');
    for (const other of interfaces.filter((candidate) => candidate !== best)) {
      lines.push(`    http://${other.address}:${port}/  (${other.name})`);
    }
  }
  lines.push('');
  lines.push('  The phone has to be on the same network. A "guest" wifi network');
  lines.push('  usually blocks device-to-device traffic and will not work.');
  console.log(lines.join('\n'));
  console.log('');
  qrcode.generate(url, { small: true });
} else {
  console.log('  This machine has no external network interface, so only');
  console.log(`  http://localhost:${port}/ will work.`);
  console.log(lines.join('\n'));
}

// `--host 0.0.0.0` rather than `--host`: the bare flag also binds IPv6, and a
// phone connecting over IPv6 link-local is not the thing being tested here.
const vite = spawn(
  'npm',
  [
    'run',
    mode === 'preview' ? 'preview' : 'dev',
    '--workspace',
    '@hangyul-ganada/web',
    '--',
    '--host',
    '0.0.0.0',
    '--port',
    String(port),
  ],
  { stdio: 'inherit' },
);

vite.on('exit', (code) => process.exit(code ?? 0));
