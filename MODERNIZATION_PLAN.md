# Mawimbi Modernization Plan

## Current State Summary

| Area | Current | Status |
|---|---|---|
| Node.js | 12.16.3 | EOL since April 2022 |
| React | 16.13.1 | EOL; two major versions behind |
| TypeScript | 3.9.7 | EOL; two major versions behind |
| Build tooling | CRA 4 + react-app-rewired | CRA is effectively abandoned |
| Package manager | Yarn Classic (v1) | Functional but lacks modern features |
| UI library | Ant Design 4 + Less | v4 in maintenance mode; Less is a liability |
| Router | React Router 5 | v5 is legacy; v6/v7 have different API |
| Testing | Jest + React Testing Library | Functional but test runner is slow |
| Linting | CRA built-in ESLint only | No explicit config, no standalone lint command |
| CI/CD | None | Only Netlify auto-build on push |
| Deployment | Netlify | Functional |

The project is well-structured (functional components, Context + useReducer, co-located tests, strict TypeScript), which makes modernization easier than it would otherwise be. The main risks are in the audio libraries (Tone.js, WaveSurfer.js), which have specific browser API dependencies.

---

## 1. Build Tooling & Dev Server

The most impactful decision. CRA is no longer maintained and react-app-rewired is a workaround for CRA's rigidity.

### Option A: Vite (Recommended)

- **What changes:** Replace CRA + react-app-rewired + customize-cra with Vite. Remove `config-overrides.js`. Add `vite.config.ts`.
- **Pros:**
  - Fast HMR and dev server (native ESM, no bundling in dev)
  - First-class TypeScript support
  - Actively maintained with a large ecosystem
  - Simple, explicit config (no "rewiring" hacks)
  - Rollup-based production builds with tree-shaking
  - Easy to add PostCSS/CSS Modules/Tailwind
- **Cons:**
  - Migration requires updating entry points (`index.html` moves to project root)
  - Some CRA-specific env var conventions (`REACT_APP_*`) need changing to `VITE_*`
  - Jest doesn't work out-of-the-box with Vite (see Testing section)

### Option B: Next.js (App Router)

- **What changes:** Restructure to Next.js file-based routing. Remove React Router. Server components by default.
- **Pros:**
  - Full-featured framework (routing, SSR/SSG, API routes, image optimization)
  - Strong community and corporate backing (Vercel)
  - Built-in optimizations (code splitting, prefetching)
- **Cons:**
  - Overkill for this app — Mawimbi is a client-side SPA with no server data needs
  - Audio APIs (Tone.js, WaveSurfer) are strictly browser-side; Server Components add friction
  - Significant restructuring of routing and component architecture
  - Deployment is simplest on Vercel; Netlify support exists but is second-class

### Option C: Remix / React Router v7 (framework mode)

- **What changes:** Adopt React Router v7 in framework mode (the Remix successor). File-based routing with loaders/actions.
- **Pros:**
  - Natural upgrade path from React Router v5
  - Progressive enhancement, good performance defaults
  - Vite-based under the hood
- **Cons:**
  - Server-centric model (loaders, actions) doesn't align with Mawimbi's fully client-side nature
  - Smaller ecosystem than Next.js or plain Vite
  - Still extra framework weight for a client-only app

### Recommendation: **Vite**

Mawimbi is a client-side audio application with no SSR/SSG needs. Vite gives the fastest dev experience, the simplest config, and avoids the impedance mismatch of server-oriented frameworks with a purely browser-based audio workstation.

---

## 2. React Version

### Option A: React 19 (Recommended)

- **What changes:** Upgrade from React 16 to React 19. Update `ReactDOM.render()` to `createRoot()`. Remove legacy API usage.
- **Pros:**
  - Latest stable version with all performance improvements
  - New features: Actions, `use()`, improved Suspense, `ref` as prop
  - Best long-term support window
  - The existing codebase already uses functional components and hooks, so most code will work as-is
- **Cons:**
  - Some third-party libraries may not yet declare React 19 peer dependency support (though most work fine)
  - `react-beautiful-dnd` is unmaintained and does not support React 18+; must be replaced (see below)

### Option B: React 18

- **What changes:** Same migration path as above but targeting React 18 instead.
- **Pros:**
  - Broader library compatibility than React 19
  - Concurrent features (Suspense, transitions) available
- **Cons:**
  - Will need another upgrade soon as the ecosystem moves to React 19
  - No significant advantage over going straight to 19

### Recommendation: **React 19**

The jump from 16 to 19 is feasible because the codebase already uses functional components and hooks. The main breaking change is `ReactDOM.render()` -> `createRoot()`, which is a one-line change. Going to 18 first provides no real benefit — it just delays a second upgrade.

---

## 3. TypeScript

### Option A: TypeScript 5.x (Recommended)

- **What changes:** Upgrade from 3.9 to latest 5.x. Update `tsconfig.json` (set `jsx: "react-jsx"` for the new JSX transform, update `module`/`moduleResolution` for bundler mode).
- **Pros:**
  - Performance improvements in type checking
  - Better inference, template literal types, `satisfies` operator, decorators
  - `"moduleResolution": "bundler"` aligns with Vite
  - Required for modern `@types/*` packages
- **Cons:**
  - Some stricter checks may surface new type errors (which is a good thing)

There is no real alternative here. TypeScript 3.9 is incompatible with modern tooling and type definitions. Upgrade to 5.x.

---

## 4. Package Manager

### Option A: npm (Recommended)

- **What changes:** Delete `yarn.lock`, run `npm install` to generate `package-lock.json`. Update scripts and CI to use `npm`.
- **Pros:**
  - Ships with Node.js — zero setup
  - Workspaces support if needed later
  - No additional tooling to install or maintain
  - `npm` v10+ (ships with Node 22) has performance comparable to Yarn Classic
- **Cons:**
  - Historically slower than Yarn, though the gap is now minimal
  - Migration means regenerating lockfile (one-time cost)

### Option B: pnpm

- **What changes:** Install pnpm, delete `yarn.lock`, generate `pnpm-lock.yaml`.
- **Pros:**
  - Fastest install times, strictest dependency resolution
  - Content-addressable storage saves disk space
  - Strict by default (catches phantom dependencies)
- **Cons:**
  - Requires separate installation
  - Some older packages may have issues with its strict linking model
  - Smaller community than npm

### Option C: Yarn (stay, but upgrade to v4/Berry)

- **What changes:** Upgrade Yarn to v4. Decide on Plug'n'Play or `nodeLinker: node-modules`.
- **Pros:**
  - Least disruptive for existing contributors
  - Yarn PnP is fast and strict
- **Cons:**
  - Yarn Berry (v2+) has a different mental model than Yarn Classic
  - PnP has compatibility issues with some tools
  - `nodeLinker: node-modules` mode makes it essentially slower npm

### Recommendation: **npm**

For a small project with no monorepo needs, npm eliminates a dependency and works everywhere. pnpm is a strong alternative if install speed matters to your workflow.

---

## 5. UI Component Library

### Option A: Ant Design 5 (Recommended)

- **What changes:** Upgrade Ant Design from v4 to v5. Remove Less, `@ant-design/dark-theme`, `babel-plugin-import`, `less-loader`, and `config-overrides.js` theming. Use Ant Design 5's built-in CSS-in-JS (via `@ant-design/cssinjs`) with the `darkAlgorithm` theme token.
- **Pros:**
  - Direct upgrade path — same component API with minor breaking changes
  - Eliminates the entire Less toolchain and `config-overrides.js` complexity
  - Built-in dark theme via `ConfigProvider` and `theme.darkAlgorithm`
  - Tree-shaking works without `babel-plugin-import`
  - Actively maintained
- **Cons:**
  - CSS-in-JS has a runtime cost (though small)
  - Some component API changes between v4 and v5

### Option B: shadcn/ui + Tailwind CSS

- **What changes:** Replace Ant Design entirely with shadcn/ui components (copy-paste component library built on Radix UI primitives) and Tailwind CSS for styling.
- **Pros:**
  - Full control over components (they live in your repo)
  - Excellent accessibility (Radix primitives)
  - Tailwind is zero-runtime
  - Very popular in the React ecosystem
- **Cons:**
  - Significant rewrite of all UI components — every Ant Design usage must be replaced
  - No direct equivalent for some Ant Design components (e.g., complex tables, upload components)
  - Need to build/compose more things yourself
  - Dark theme requires custom Tailwind config

### Option C: Keep Ant Design 4 (do nothing)

- **Pros:** Zero work.
- **Cons:** v4 is in maintenance mode. Less dependency remains. Increasingly hard to find compatible plugins.

### Recommendation: **Ant Design 5**

The v4 -> v5 migration is well-documented and the component APIs are similar. The big win is eliminating the entire Less/config-overrides toolchain. A full UI rewrite to shadcn/ui is only worth it if you actively dislike Ant Design's design language.

---

## 6. Routing

### Option A: React Router v7 (Recommended)

- **What changes:** Upgrade from React Router v5 to v7 (library mode, not framework mode). Migrate from `<Switch>` to `<Routes>`, `useHistory()` to `useNavigate()`, component-based route definitions.
- **Pros:**
  - Actively maintained, large community
  - Library mode works exactly like a traditional SPA router
  - Relative routes, data loading APIs available if needed later
  - Only 3 routes in the app, so migration is small
- **Cons:**
  - API changes from v5 are significant (but the app only has 3 routes)

### Option B: TanStack Router

- **What changes:** Replace React Router with TanStack Router.
- **Pros:**
  - Type-safe routing (search params, path params fully typed)
  - Built-in search param management
  - Good Vite integration
- **Cons:**
  - Smaller ecosystem
  - More complex setup for a simple 3-route app
  - No practical benefit over React Router for this use case

### Recommendation: **React Router v7 (library mode)**

Three routes. React Router v7 is the obvious choice — familiar API, minimal migration, widely supported.

---

## 7. Drag and Drop

`react-beautiful-dnd` is unmaintained and does not work with React 18+ StrictMode. It must be replaced.

### Option A: @dnd-kit (Recommended)

- **What changes:** Replace `react-beautiful-dnd` with `@dnd-kit/core` + `@dnd-kit/sortable`.
- **Pros:**
  - Actively maintained
  - Works with React 18/19
  - Lightweight, modular architecture
  - Accessible by default
  - Good TypeScript support
- **Cons:**
  - Different API — requires rewriting drag-and-drop logic

### Option B: @hello-pangea/dnd

- **What changes:** Drop-in fork of `react-beautiful-dnd` with React 18/19 support.
- **Pros:**
  - API-compatible with `react-beautiful-dnd` — minimal code changes
  - Actively maintained community fork
- **Cons:**
  - Inherits the same architectural limitations
  - Smaller community than dnd-kit

### Recommendation: **@dnd-kit**

It's the modern standard for drag-and-drop in React. The Mawimbi track reordering is a straightforward sortable list, so the migration is small.

---

## 8. Testing

### Option A: Vitest (Recommended)

- **What changes:** Replace Jest with Vitest. Update test config, keep React Testing Library.
- **Pros:**
  - Native Vite integration — shares the same config and transform pipeline
  - Jest-compatible API (minimal test code changes)
  - Significantly faster execution (native ESM, no babel transforms)
  - Built-in coverage via v8 or istanbul
  - Watch mode with HMR
- **Cons:**
  - Some Jest plugins may not have Vitest equivalents (unlikely to matter here)
  - Need to update `setupTests.ts` imports

### Option B: Keep Jest (with SWC or esbuild transform)

- **What changes:** Keep Jest, but replace Babel transform with `@swc/jest` or `esbuild-jest` for speed.
- **Pros:**
  - No test API changes at all
  - Jest is well-known
- **Cons:**
  - Doesn't share config with Vite (two separate transform pipelines)
  - More config to maintain
  - Still slower than Vitest

### Recommendation: **Vitest**

If you adopt Vite for builds, Vitest is the natural testing companion. The test API is nearly identical to Jest, so migration is mostly config changes, not test rewrites.

---

## 9. Linting & Formatting

### Option A: ESLint 9 + Prettier (Recommended)

- **What changes:** Add explicit `eslint.config.js` (flat config). Add `eslint-plugin-react`, `eslint-plugin-react-hooks`, `@typescript-eslint/eslint-plugin`. Keep Prettier for formatting. Add a `lint` script.
- **Pros:**
  - Explicit, auditable lint rules
  - Catches bugs the compiler misses (hooks rules, exhaustive deps)
  - Flat config is simpler than the old `.eslintrc` cascade
  - Separates concerns: ESLint for logic errors, Prettier for formatting
- **Cons:**
  - ESLint 9 flat config is different from what most guides show (v8 style)
  - Need to configure TypeScript parser

### Option B: Biome (lint + format in one tool)

- **What changes:** Replace both ESLint and Prettier with Biome.
- **Pros:**
  - Single tool for linting and formatting
  - Extremely fast (written in Rust)
  - Simple configuration
- **Cons:**
  - Fewer rules than ESLint (no `eslint-plugin-react-hooks` equivalent with exhaustive-deps)
  - Smaller plugin ecosystem
  - May not catch React-specific issues as well

### Recommendation: **ESLint 9 + Prettier**

The React hooks lint rules (`eslint-plugin-react-hooks`) are important for correctness in a hooks-heavy codebase. Biome doesn't have full parity here yet.

---

## 10. Git Hooks

### Option A: Husky 9 + lint-staged (Recommended)

- **What changes:** Upgrade from Husky 4 to Husky 9 (different config format — `.husky/` directory with shell scripts instead of package.json config). Update lint-staged.
- **Pros:**
  - Direct upgrade of existing setup
  - Well-established, widely used
  - lint-staged handles partial staging correctly
- **Cons:**
  - Husky 9 config is different from v4 (migration needed but straightforward)

### Option B: lefthook

- **What changes:** Replace Husky + lint-staged with lefthook.
- **Pros:**
  - Single tool (no need for lint-staged separately)
  - Fast (written in Go)
  - Parallel task execution
- **Cons:**
  - Less widely used
  - Different config format to learn

### Recommendation: **Husky 9 + lint-staged**

Familiar, minimal migration, well-supported.

---

## 11. Node.js Version

### Option A: Node 22 LTS (Recommended)

- **What changes:** Update `.nvmrc` to `22`. Add `engines` field to `package.json`.
- **Pros:**
  - Current LTS (supported until April 2027)
  - Native fetch, native test runner, performance improvements
  - Required by modern tooling (Vite 6, ESLint 9, TypeScript 5.x)
- **Cons:** None meaningful.

### Option B: Node 20 LTS

- **Pros:** LTS until April 2026.
- **Cons:** Approaching end of maintenance window. No advantage over 22.

### Recommendation: **Node 22 LTS**

---

## 12. CI/CD

Currently there is no CI pipeline. Tests and builds are not verified before merge.

### Option A: GitHub Actions (Recommended)

- **What changes:** Add `.github/workflows/ci.yml` with jobs for lint, typecheck, test, and build.
- **Pros:**
  - Free for public repos, generous minutes for private
  - Native GitHub integration (PR checks, status badges)
  - Huge marketplace of reusable actions
- **Cons:**
  - YAML configuration

### Option B: Netlify Build Plugins

- **What changes:** Add test/lint steps to the Netlify build pipeline.
- **Pros:**
  - No additional service
  - Tests run as part of deploy
- **Cons:**
  - Slower feedback (only runs on deploy, not on every push/PR)
  - Limited parallelism
  - Tight coupling to Netlify

### Recommendation: **GitHub Actions**

Run lint + typecheck + tests on every PR. Let Netlify handle deployment only.

---

## 13. Deployment

### Option A: Stay on Netlify (Recommended)

- **What changes:** Update `netlify.toml` for Vite output directory (`dist` instead of `build`). Keep SPA redirect.
- **Pros:**
  - Already configured and working
  - Good CDN, free tier, deploy previews on PRs
  - No migration needed
- **Cons:**
  - None for a static SPA

### Option B: Vercel

- **Pros:** Excellent DX, fast deployments, good Next.js support.
- **Cons:** Migration effort for no clear gain. Vercel's advantages are mostly for SSR apps.

### Option C: Cloudflare Pages

- **Pros:** Fast global CDN, generous free tier, good for static sites.
- **Cons:** Migration effort. Slightly less mature preview deployments.

### Recommendation: **Stay on Netlify**

There's no reason to switch. Netlify works well for static SPAs and is already set up.

---

## 14. Audio Libraries

### Tone.js (keep at latest)

Tone.js v14 is the current version. Upgrade to latest patch. The API is stable and there is no alternative with comparable features for web audio scheduling, transport, and effects. No action needed beyond ensuring compatibility with the new build toolchain.

### WaveSurfer.js (upgrade to v7)

WaveSurfer.js v7 is a complete rewrite with a new API. It's smaller, faster, and has better TypeScript support. The migration requires rewriting the `Waveform.tsx` and `Spectrogram.tsx` components, but the new API is cleaner.

---

## Recommended Migration Order

A phased approach minimizes risk. Each phase should result in a working, deployable application.

### Phase 1: Foundation (do first)

1. **Node 22 LTS** — Update `.nvmrc`, verify everything still builds
2. **TypeScript 5.x** — Upgrade, fix any new type errors
3. **React 19** — Update React/ReactDOM, switch to `createRoot()`, update JSX transform

### Phase 2: Build Tooling

4. **Vite** — Replace CRA + react-app-rewired. Remove `config-overrides.js`. New `vite.config.ts`
5. **Vitest** — Replace Jest. Migrate test config, keep test code mostly as-is

### Phase 3: Libraries

6. **Ant Design 5** — Remove Less toolchain, use CSS-in-JS dark theme
7. **React Router v7** — Migrate 3 routes from v5 API to v7 API
8. **@dnd-kit** — Replace react-beautiful-dnd
9. **WaveSurfer.js v7** — Migrate waveform components

### Phase 4: Developer Experience

10. **ESLint 9 + explicit config** — Add `eslint.config.js`, add lint script
11. **Husky 9 + lint-staged** — Update git hooks
12. **GitHub Actions CI** — Add workflow for lint, typecheck, test, build

### Phase 5: Cleanup

13. **Update Netlify config** — Point to Vite's `dist` output
14. **Update `CLAUDE.md`** — Reflect new stack, commands, and architecture
15. **Remove dead dependencies** — `react-app-rewired`, `customize-cra`, `babel-plugin-import`, `less`, `less-loader`, `@ant-design/dark-theme`, `react-scripts`

---

## Dependencies: Final Target State

| Area | Target |
|---|---|
| Node.js | 22 LTS |
| React | 19.x |
| TypeScript | 5.x |
| Build | Vite 6 |
| Test | Vitest + React Testing Library |
| UI | Ant Design 5 (CSS-in-JS, dark theme via ConfigProvider) |
| Router | React Router 7 (library mode) |
| DnD | @dnd-kit |
| Audio | Tone.js 14 (latest patch) + WaveSurfer.js 7 |
| Lint | ESLint 9 flat config + Prettier |
| Hooks | Husky 9 + lint-staged |
| CI | GitHub Actions |
| Deploy | Netlify |
| Package mgr | npm |
