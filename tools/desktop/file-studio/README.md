# File Studio

Offline Windows desktop app for HTML tables, JSON and XML, images, and PDFs. It does not ask for an account or send file contents anywhere.

| | |
| --- | --- |
| Id | `file-studio` |
| Platform | desktop |
| Tech | Electron, React, TypeScript |
| Status | building |

## Develop

```
cd tools/desktop/file-studio
npm install
npm test
npm run dev
```

`npm run dev` opens the Electron window. The UI calls the same conversion functions the unit tests cover. Heavy image and PDF work runs in a worker thread so the main process stays responsive.

## Checks

```
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

`test:e2e` needs a production build first (`npm run build`). It launches Electron and checks that the home screen is visible.

## Package

```
npm run icons
npm run rebuild:native
npm run build:win
```

This writes an NSIS installer and a portable exe under `release/`. The build is not code-signed. Windows SmartScreen may warn until the app has a certificate and reputation. Do not describe the installer as signed.

## Where things live

Domain code is in `src/core` and can be called without Electron. The shell is `src/main`, the preload bridge is `src/preload`, and the React UI is `src/renderer`. See `docs/architecture.md` and `docs/known-limitations.md`.
