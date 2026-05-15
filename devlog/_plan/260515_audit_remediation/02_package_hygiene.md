# Phase 02 — Package Hygiene

## Problems

### 2a. Missing LICENSE file
- `package.json` declares `"license": "MIT"` and includes `"LICENSE"` in `files`
- No `LICENSE` file exists at repo root
- npm tarball ships without license text

### 2b. package-lock.json bin path drift
- `package.json`: `"ome": "dist/src/cli/index.js"`
- `package-lock.json`: `"ome": "dist/cli/index.js"`
- Global install may point to wrong file

### 2c. Missing `./web` export
- CLI-JAW integration docs reference `import { createServer } from 'ome/web'`
- `exports` map only has `"."` and `"./observe"`
- Import fails with package exports enabled

## Plan

### NEW `LICENSE`
- Standard MIT license text with copyright holder

### MODIFY `package.json`
- Add `"./web"` to exports:
  ```json
  "./web": {
    "import": "./dist/src/web/index.js",
    "types": "./dist/src/web/index.d.ts"
  }
  ```

### REGENERATE `package-lock.json`
- `rm package-lock.json && npm install`
- Verify bin path matches package.json

## Verification
- `npm pack --dry-run` includes LICENSE
- `node -e "import('ome/web')"` resolves (after build)
- `package-lock.json` bin matches `package.json` bin
