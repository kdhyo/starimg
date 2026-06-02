# Repository Guidelines

## Project Structure & Module Organization

This project is a Vite React app with an Express server. Client code lives in `src/`: `App.jsx` contains the main UI, `main.jsx` mounts React, `styles.css` holds global styles, and `src/game/engine.js` contains reusable game logic. Tests sit beside covered code; shared setup is in `src/test/setup.js`.

Server code lives in `server/`, with `app.js` defining the Express app, `index.js` starting it, and route helpers in `images.js` and `results.js`. Runtime data is in `data/results.json`. Image assets are stored in `images/`, `round-3-selected/`, and `round-4-selected/`. Treat `dist/` as generated output.

## Build, Test, and Development Commands

- `pnpm dev`: runs the Express server and Vite client together.
- `pnpm dev:server`: starts only the API server with `node server/index.js`.
- `pnpm dev:client`: starts only Vite, proxying `/api` to `http://127.0.0.1:3000`.
- `pnpm start`: starts the server.
- `pnpm build`: creates the Vite production build in `dist/`.
- `pnpm test`: runs the Vitest suite once.

Use `pnpm` consistently; the lockfile is `pnpm-lock.yaml`.

## Coding Style & Naming Conventions

The codebase uses ESM (`"type": "module"`), React JSX, and modern JavaScript. Follow the existing style: two-space indentation, semicolons, single quotes, and named exports for reusable logic. Name React components in `PascalCase`, functions and variables in `camelCase`, and test files as `*.test.js` or `*.test.jsx`.

Keep game rules and pure calculations in `src/game/engine.js`; keep React components focused on state and rendering.

## Testing Guidelines

Vitest is configured in `vite.config.js` with `jsdom`, global test APIs, and Testing Library matchers. Add or update tests next to changed code. Use React Testing Library for UI behavior and plain Vitest assertions for game/server logic. Run `pnpm test` before submitting changes; run `pnpm build` when touching bundling, assets, or production-facing client code.

## Commit & Pull Request Guidelines

Git history is not available in this checkout, so use concise, imperative commit messages, preferably conventional prefixes when helpful, such as `feat: add matchup history` or `fix: handle empty image list`.

Pull requests should include a short summary, test results, linked issues if any, and screenshots or recordings for UI changes. Call out changes to image folders, generated `dist/` files, or data files because they can be large or user-visible.

## Security & Configuration Tips

Do not commit secrets or local machine paths. Treat uploaded or generated image files as untrusted input; keep validation and filesystem access constrained to the existing server helpers.
