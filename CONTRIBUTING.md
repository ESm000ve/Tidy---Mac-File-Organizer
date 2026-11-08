# Contributing to Tidy

Thank you for your interest in contributing! Here's how to get started.

## Development Setup

```bash
git clone https://github.com/ESm000ve/Tidy---Mac-File-Organizer.git
cd Tidy---Mac-File-Organizer
npm ci
npm run dev
```

The core workflow runs without credentials. To work on Gemini features, enter your own key in Tidy’s Settings or use the optional development override in [`.env.example`](.env.example).

## Workflow

1. **Fork** the repository and create a new branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. **Make your changes.** Keep commits focused — one logical change per commit.
3. **Run a type check** before pushing:
   ```bash
   npm run typecheck
   ```
4. **Open a Pull Request** against `main` with a clear title and description of what changed and why.

For file handling changes, also run `npm run test:files` and `npm run test:desktop` after `npm run build:app`. UI changes should pass `npm test`, `npm run test:a11y`, and `npm run test:preview`. See [Tidy for macOS](README.md) for prerequisites.

## Guidelines

- **Code style** — TypeScript throughout. Follow the patterns already in the codebase (functional components, IPC for Electron ↔ renderer communication, no business logic in the renderer).
- **Electron security** — Keep `contextIsolation: true` and `nodeIntegration: false`. All Node.js access must go through the context bridge in `electron/preload.ts`.
- **AI features** — Handle a missing Gemini key and preserve the manual and on-device workflows.
- **No new dependencies without discussion** — Open an issue first if you need to add a new package.

## Reporting Issues

Please open an issue on GitHub with:
- A clear title describing the problem
- Steps to reproduce
- Expected vs. actual behaviour
- Your OS and Node.js version
