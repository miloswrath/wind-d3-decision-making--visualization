# Repository Guidelines

## Project Structure & Module Organization
This Vite + TypeScript app renders the decision layout UI in the browser. Entry point `src/main.ts` bootstraps the router and mounts the `#app` outlet. The interactive chart logic lives in `src/DecisionLayoutChart.ts`, while reusable helpers sit in `src/lib/`. Page-level views under `src/pages/` should stay lean and defer D3 interactions to library modules. Global styles reside in `src/styles.css`; `index.html` only prepares the mount point, and `vite.config.ts` carries build wiring.

## Build, Test, and Development Commands
Use pnpm throughout: `pnpm install` syncs dependencies, `pnpm dev` starts the hot-reload dev server, `pnpm build` emits the optimized bundle into `dist/`, and `pnpm preview` serves that bundle for smoke tests (pass `--host` when testing on other devices).

## Coding Style & Naming Conventions
TypeScript modules use ES imports/exports with the repo-wide module flag. Follow the current 2-space indentation, double quotes, and trailing semicolons. Name page files with UpperCamelCase (`src/pages/LayoutBuilder.ts`), keep utility modules in camelCase, and prefer explicit return types for exported functions. Encapsulate D3 mutations inside factories or functions that accept the host element to avoid leaking global selectors.

## Testing Guidelines
Automated tests are not yet configured. Until a harness is added, rely on manual verification: run `pnpm dev`, exercise drag interactions in the builder, and confirm recalculated WADD scores in `src/DecisionLayoutChart.ts`. If you add logic that warrants regression coverage, place lightweight tests in `src/__tests__/` and document how to run them in your PR.

## Commit & Pull Request Guidelines
Write commit subjects in the imperative mood and keep them under 72 characters; prefer semantic prefixes (`feat:`, `fix:`, `chore:`) as used in `feat: update WADD during score drag`. Group related changes together. In pull requests, include a concise summary, testing notes (`pnpm build`, manual steps executed), and screenshots or GIFs for UI adjustments. Link related issues and surface follow-up work or known gaps in the description.
