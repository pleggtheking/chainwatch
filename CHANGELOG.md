# Changelog

All notable changes to ChainWatch are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-08-13

### Added — Phase 1: Runtime Interceptor
- Core interceptor wrapping `fs`, `net`, `http`, `https`, `dns`, `child_process`
- Call-stack package attribution with symlink-aware path resolution
- Chain scorer detecting credential_access → self_propagation → network_exfil sequences
- Live worm-catch demo with simulated Shai-Hulud attack chain
- Policy engine with configurable signal scores and block thresholds

### Added — Phase 2: Static Scanner + CLI
- `chainwatch scan` — static analysis of node_modules with 6 detection rules
- `chainwatch watch -- <cmd>` — live runtime monitoring via `--import` preload
- Detection rules: postinstall_network, postinstall_shell, credential_file_access,
  obfuscation_score, suspicious_publish, dependency_confusion
- Output formats: pretty (terminal), JSON, SARIF
- `--sarif-output <file>` flag for CI integration

### Added — Phase 3: Baseline + Drift Detection
- `chainwatch baseline record -- <cmd>` — records behavioral baseline
- `chainwatch baseline show` — inspect recorded baseline
- `chainwatch baseline clear` — delete baseline file
- `chainwatch baseline pull` — download team baseline from cloud
- `chainwatch watch --drift -- <cmd>` — compare current run to baseline
- `--block-on-drift` — kill process if drift exceeds threshold
- Path normalization with `{HOME}`, `{CWD}`, `{TMP}` tokens for portable baselines
- Drift scorer: raw IP network call (+50), credential read (+40), chain bonus (+20)

### Added — Phase 4: GitHub Action + CI/CD
- GitHub Action (`action/action.yml`) with node20 runtime
- SARIF 2.1.0 output with 7 rule IDs (CW001–CW007)
- `action/dist/index.js` — esbuild-bundled single file (committed)
- Dogfood workflow (`.github/workflows/chainwatch-ci.yml`)
- Example workflow with baseline drift detection in CI
- GitHub step summary with findings table

### Added — Phase 5: Cloud Sync + Dashboard + Publish
- `chainwatch sync` — push findings to ChainWatch Cloud API
- `--sync` flag on scan, watch, and baseline commands
- `chainwatch baseline pull` — download team baseline from cloud
- `CHAINWATCH_API_KEY` env var support throughout
- Fastify API server with PostgreSQL + Redis
- API endpoints: events, baselines, dashboard, alerts, api-keys
- WebSocket server for real-time live event feed
- Slack + webhook alert dispatch with HMAC signing
- React + Tailwind dashboard with Overview, RepoDetail, EventFeed, Settings pages
- Recharts trend chart for findings over time
- Freemium tier gate (free: full scanner + CI; team: dashboard + cloud sync)
- npm publish config with `files`, `publishConfig`, keywords
- GitHub Action branding (shield icon, red color)

### Security
- API keys stored as bcrypt hashes (never raw)
- HMAC-SHA256 webhook signing
- Freemium gate blocks cloud features without a team plan

## [0.1.0] — 2026-08-01

Initial prototype with basic interceptor and chain scorer.
