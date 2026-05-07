# Project Environment
- Package Manager: bun
- Runtime: bun

## Commands
- Install: bun install
- Run: bun run <script>
- Execute: bunx <package>
- Test: bun test

## Strict Rule
- NEVER use npm or npx. If a tool suggests npm, rewrite the command to use bun or bunx automatically.
- NEVER use `localhost` for internal Docker communication or health checks (causes IPv6/IPv4 ambiguity). Use `127.0.0.1` for loopback or service names (e.g., `api:3000`) for inter-container networking. Focus strictly on IPv4.
