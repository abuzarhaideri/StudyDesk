# StudyDesk engineering guide

StudyDesk is a zero-budget, offline Electron application. Never add paid services, remote assets, telemetry, accounts, or API integrations. Do not create sample data in the real store.

Architecture: `backend/main` owns electron-store, validated IPC, timer reconciliation and native dialogs. `backend/preload` exposes only the typed StudyDesk API. `shared` contains Zod models and pure domain operations. `frontend` is React, Tailwind, Radix/shadcn-style primitives, Lucide and Motion.

Use strict TypeScript and small pure domain functions. Validate mutations in main; never trust the renderer. Keep context isolation and sandboxing enabled, Node integration disabled, navigation blocked, and a restrictive CSP. Persist before acknowledging writes. Back up malformed files before recovery. Tests must use isolated temporary userData, never actual student data.

Design: warm ivory and sage, charcoal dark mode, generous spacing, system typography, visible focus rings, meaningful empty states. All visible controls must work. Respect reduced motion. Preserve native traffic lights and draggable title bar.

Definition of done: typecheck, ESLint, domain tests, actual Playwright Electron CRUD/restart/theme/timer tests, production build, `npm run dist:mac`, mounted DMG inspection and packaged-app E2E. Document exact failures and limitations honestly.

Use Node 22.12+ (`nvm use`). `npm ci`, `npm run dev`, `npm run build`, `npm test`, `npm run lint`, `npm run test:e2e`. Package the arm64 DMG with free local ad-hoc signing with `npm run dist:mac`; Intel is optional using `npm run dist:mac:intel`. Do not purchase signing. Runtime data belongs in app.getPath('userData'), not resources. Keep generated outputs out of Git. No force pushes.
