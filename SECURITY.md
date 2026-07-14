# Security Policy

## Reporting a vulnerability

Please report suspected security vulnerabilities **privately** to
**imsur02@outlook.com** — do not open a public issue for security reports.

Include what you can: affected file/area, reproduction steps or a proof of
concept, and impact as you understand it. You will receive an acknowledgement
within 7 days.

## Scope

Graphite is currently a client-side application (no deployed backend). The
most relevant surfaces today are:

- Parsing of `.graphite` documents and other untrusted input
  (`apps/web/src/features/files/`, `apps/web/src/document/validate.ts`)
- The WASM engine boundary (`packages/engine`, worker IPC in
  `packages/protocol`)
- Supply chain (dependency manifests, CI workflows)

## Supported versions

Pre-1.0: only the latest `main` receives fixes.
