# StudyDesk 1.0.0 release verification

Verified on **23 October 2026**, on the current Apple Silicon Mac (Darwin 27.0.0, arm64). Development used Node 22.23.4 and npm. No additional paid service was required.

## Deliverables

| Deliverable | Result |
|---|---|
| Native Electron app | Launched successfully |
| Real tasks, notes and settings | Implemented and verified through native UI |
| Local persistence after quit/relaunch | Passed for tasks, notes, pin state, settings, theme and active timer |
| Pomodoro timer | Start, pause, resume, reset, recovery and exactly-once completion passed |
| Light/dark themes | Passed; system theme uses OS media query and is persisted as a preference |
| Domain tests | **20 passed**, 0 failed |
| TypeScript | `npm run typecheck` passed as part of production build |
| ESLint | `npm run lint` passed |
| Production build | `npm run build` passed |
| Installer build | `npm run dist:mac` passed |
| DMG checksum/mount | `hdiutil verify` passed; mounted read-only successfully |
| Packaged app signature | `codesign --verify --deep --strict` passed (local ad-hoc signature) |
| Source native E2E | **3 passed**, 0 failed; final offline run **19.6 seconds** |
| Packaged native E2E | **3 passed**, 0 failed; final run **25.7 seconds** |
| Offline packaged operation | All three workflows ran after forcing Playwright’s browser context offline and reloading local assets |
| Development command | `npm run dev -- --remoteDebuggingPort 9225` rendered, reloaded and navigated successfully with no page errors |
| Dependency audit | `npm audit` during installation/lock verification: 0 vulnerabilities |
| MCP tools | Context7 and Playwright MCP both started and listed callable tools; both used |
| Repository | `main`; GitHub remote [abuzarhaideri/StudyDesk](https://github.com/abuzarhaideri/StudyDesk) |

The source Electron suite also passed all three workflows before packaging. Final verification uses the identical suite against the generated installer, not a frontend mock or browser storage substitute. Every test uses an isolated temporary `userData` directory. No sample data was inserted in the regular StudyDesk profile.

## Installer identity

- File: **`release/StudyDesk-1.0.0-arm64.dmg`**
- Absolute path: `/Users/abuzarhaideri/StudyDesk/release/StudyDesk-1.0.0-arm64.dmg`
- Size: **126,528,837 bytes** (about 121 MiB)
- SHA-256: **`03ba768e2b4e585f8517f194fcd9cfb5a9186d3c301b8a745c1340befc4e6a4c`**
- Executable: `StudyDesk.app/Contents/MacOS/StudyDesk`, verified Mach-O **arm64**.
- Packaged bundle’s declared minimum macOS version: **13.0**. Only the current Mac was exercised; older OS compatibility was not separately tested.
- DMG contains `StudyDesk.app` and an `Applications → /Applications` link.
- Application ID: `org.studydesk.desktop`.
- Signing: free local ad-hoc (`identity: '-'`), **no Apple Developer certificate, no notarization**. Gatekeeper acceptance is not claimed.
- Intel: build command configured, but **x64 was not built or tested**.

## Native workflow coverage

The long workflow creates a task with description/category/priority/date; edits, completes and reopens it; checks the completed filter, task search and sort; confirms deletion of a temporary task; creates, edits, autosaves and pins a note; searches notes; starts/pauses/resumes/resets focus; changes all three timer durations; switches dark/light themes; exports and reimports a real temporary JSON backup; quits/relaunches; verifies persisted task/note/settings/theme; deletes another note; checks the new timer duration; and visits all primary sections at 860 × 620 without horizontal overflow. It also checks Node `require` is absent from the renderer and only the four intended bridge methods are exposed.

Recovery workflow seeds an expired running focus timer in an isolated profile, verifies a single completion across two launches, rejects invalid task input through IPC, then verifies malformed JSON is preserved byte-for-byte as a damaged-file backup before recovery.

Active-timer workflow starts a one-minute session, relaunches and verifies the same deadline, then advances the main-process wall clock to exercise the real completion loop. The next break appears and exactly one session is recorded.

The unit suite additionally covers required/oversized/date/priority/ID validation; task timestamps; plain-text note operations and missing-note rejection; settings validation; immutable mutations; pause/resume drift; duplicate starts; reset/skip behavior; active-duration preservation; automatic-break recovery policy; fourth-session long breaks; local midnight; and pauses spanning midnight.

## MCP verification

`codex mcp list` showed the requested `context7` and `playwright` entries enabled. Newly registered tools did not hot-load into this conversation, so actual server calls were made with the free MCP JavaScript SDK from a temporary tools directory.

- Context7 v4.4.4 started on stdio, listed `resolve-library-id` and `query-docs`, resolved Electron and returned documentation for Electron, electron-builder, Playwright, Tailwind, React, Radix/shadcn and electron-store. The electron-vite library identifier redirected; official electron-vite documentation was also consulted. No API key or paid plan was used.
- Playwright MCP started on stdio and listed its browser tools. It attached over local CDP to an isolated native Electron window, listed the StudyDesk page, returned the accessibility snapshot, saved `docs/screenshots/mcp-dashboard.png`, and reported **0 console errors and 0 warnings**.
- Native testing used Playwright’s Electron API independently of MCP.
- No other MCP servers were added for this project. MCP is not a runtime dependency.

## Security and persistence checks

Electron main owns storage, validates commands with Zod, checks the sender is its own main frame, and acknowledges changes after synchronous atomic electron-store persistence. Context isolation, sandboxing and disabled Node integration are explicit. Navigation/popups/webviews and remote network requests are denied. No raw IPC event or filesystem API is exposed. The packaged CSP uses self-only scripts. Only development permits the inline preamble required by React Refresh.

The standard data path is `~/Library/Application Support/StudyDesk/studydesk.json`. Timer deadlines, focus intervals, sessions, tasks, notes, themes and preferences are local. Corruption and import backups preserve original data. A single-instance lock protects concurrent writers. Data is plain JSON, not encrypted.

## Limits and non-blocking observations

- No certificate/notarization; macOS may require its supported **Open Anyway** flow for a downloaded copy.
- Native notifications are implemented and optional. Actual macOS notification permission/delivery was not automatically asserted.
- System theme subscribes to the OS preference; changing the entire Mac’s appearance was not automated.
- Sleep/wake behavior is implemented with deadline reconciliation and `powerMonitor`; expired-deadline recovery was automated, not a physical machine sleep cycle.
- The production renderer emits a non-blocking Vite warning for a roughly 560 kB minified JS chunk. It is bundled locally; rendering and navigation tests passed. No remote network fetch is involved.
- electron-builder emits duplicate dependency-reference notices and skips notarization as expected; packaging completed successfully.
- Installed data is not encrypted, and backup files contain readable student content.
- Intel architecture and older macOS versions remain unverified. No auto-update or cloud sync is included.
- The supplied shared ChatGPT URL could not be retrieved by the browsing tool; implementation followed the complete attached build brief.

## Submission

Submit the source repository or **`release/StudyDesk-1.0.0-source.zip`**, the **arm64 DMG**, this verification report, and README. Screenshots and original icon source are included in the source. Generated reports, `node_modules`, temporary student profiles, release binaries and build caches are excluded from Git. The README contains exact development, test, installer and GitHub push commands.

GitHub downloads: [StudyDesk v1.0.0 release](https://github.com/abuzarhaideri/StudyDesk/releases/tag/v1.0.0). The release includes the DMG, source ZIP, verification report and SHA-256 checksums. The repository was created private; academic reviewers need repository access unless its owner changes visibility.

Required additional paid services or ongoing service costs: **none (₹0)**.
