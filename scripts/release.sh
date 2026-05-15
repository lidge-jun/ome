#!/usr/bin/env bash
# release.sh — build + version bump + npm publish + GitHub Release
# Auto-detects npm latest and bumps patch only (minor/major via explicit arg).
# Usage:
#   ./scripts/release.sh          → patch bump (0.1.0 → 0.1.1)
#   ./scripts/release.sh minor    → minor bump (0.1.0 → 0.2.0)
#   ./scripts/release.sh major    → major bump (0.1.0 → 1.0.0)
#   ./scripts/release.sh 1.2.0   → explicit version
set -e

PKG_NAME="ome"

echo "⚙️  $PKG_NAME release script"
echo "========================="

cd "$(dirname "$0")/.."

# ─── Pre-flight checks ───────────────────────────────
if ! git diff --cached --quiet; then
  echo "❌ Refusing release: staged changes exist"
  exit 1
fi
if ! git diff --quiet; then
  echo "❌ Refusing release: worktree has uncommitted changes"
  exit 1
fi

BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "main" ]; then
  echo "❌ Refusing release: must be on 'main' branch (currently on '$BRANCH')"
  exit 1
fi

# ─── Version detection ─────────────────────────────────
NPM_LATEST=$(npm view "$PKG_NAME" dist-tags.latest 2>/dev/null || echo "0.0.0")
PKG_VERSION=$(node -p "require('./package.json').version")
echo "📡 npm latest:   $NPM_LATEST"
echo "📦 package.json: $PKG_VERSION"

# Sync package.json to npm latest if behind (strip prerelease)
CLEAN_NPM=$(echo "$NPM_LATEST" | sed 's/-.*//')
CLEAN_PKG=$(echo "$PKG_VERSION" | sed 's/-.*//')
if [ "$CLEAN_PKG" != "$CLEAN_NPM" ] && [ "$CLEAN_NPM" != "0.0.0" ]; then
  echo "⚠️  package.json ($CLEAN_PKG) differs from npm ($CLEAN_NPM). Syncing..."
  npm version "$CLEAN_NPM" --no-git-tag-version --allow-same-version
fi

# ─── Release gates ────────────────────────────────────
echo ""
echo "🚧 Running release gates..."

echo "  [1/4] TypeScript type check..."
npx tsc --noEmit
echo "  ✅ tsc passed"

echo "  [2/4] Build..."
npm run build
echo "  ✅ build passed"

echo "  [3/4] Tests..."
node --test dist/tests/**/*.test.js
echo "  ✅ tests passed"

echo "  [4/4] Package validation..."
npm pack --dry-run >/dev/null
echo "  ✅ package ok"

echo ""
echo "✅ All release gates passed"

# ─── Version bump ──────────────────────────────────────
BUMP_ARG="${1:-patch}"

if [[ "$BUMP_ARG" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  npm version "$BUMP_ARG" --no-git-tag-version
else
  npm version "$BUMP_ARG" --no-git-tag-version
fi

VERSION=$(node -p "require('./package.json').version")
echo "📌 New version: $VERSION"

# ─── Collect changelog ─────────────────────────────────
PREV_TAG=$(git tag --sort=-v:refname | grep -E '^v[0-9]' | head -1)
if [ -n "$PREV_TAG" ]; then
  CHANGELOG=$(git log "$PREV_TAG"..HEAD --pretty=format:"- %s" --no-merges | head -50)
  COMMIT_COUNT=$(git rev-list "$PREV_TAG"..HEAD --count)
else
  CHANGELOG=$(git log --oneline -20 --pretty=format:"- %s" --no-merges)
  COMMIT_COUNT="?"
fi

echo ""
echo "📝 Changes since ${PREV_TAG:-'(none)'} ($COMMIT_COUNT commits):"
echo "$CHANGELOG" | head -15
echo ""

# ─── Commit + Tag + Push ──────────────────────────────
echo "🏷️  Creating git tag v$VERSION..."
git add package.json package-lock.json
git commit -m "chore: release v$VERSION" --allow-empty
git tag "v$VERSION"
git push origin main
git push origin "v$VERSION"

# ─── npm publish ───────────────────────────────────────
echo "🚀 Publishing to npm..."
npm publish --access public

# ─── GitHub Release with changelog ─────────────────────
echo "📋 Creating GitHub Release..."
RELEASE_BODY="## Release v$VERSION

**Previous**: ${PREV_TAG:-'(first release)'}
**Commits**: $COMMIT_COUNT

### Changes
$CHANGELOG"

if [ -n "$PREV_TAG" ] && command -v gh &>/dev/null; then
    gh release create "v$VERSION" \
        --title "v$VERSION" \
        --notes "$RELEASE_BODY" \
        --latest
    echo "✅ GitHub Release v$VERSION created!"
elif command -v gh &>/dev/null; then
    gh release create "v$VERSION" \
        --title "v$VERSION — Initial Release" \
        --notes "$RELEASE_BODY" \
        --latest
    echo "✅ GitHub Release v$VERSION created (first release)!"
else
    echo "⚠️  Skipped GitHub Release (gh CLI not found)"
fi

echo ""
echo "✅ $PKG_NAME@$VERSION published!"
echo "   Install: npm install -g $PKG_NAME"
echo "   Release: https://github.com/lidge-jun/ome/releases/tag/v$VERSION"
