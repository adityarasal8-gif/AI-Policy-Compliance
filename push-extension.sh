#!/bin/zsh
# ComplyLens — commit & push extension files
# Run this once from Terminal to push the extension to GitHub

set -e
cd "$(dirname "$0")"

echo "📦 Staging extension files..."
git add apps/extension/src/analysisService.ts \
        apps/extension/src/background.ts \
        apps/extension/src/settings.ts \
        apps/extension/src/types.ts \
        apps/extension/src/content.ts \
        apps/extension/public/manifest.json \
        apps/extension/test/gmail-simulator.html \
        handoff.md \
        push-extension.sh

echo "💬 Committing..."
git commit -m "Add local mock Gmail compliance extension — send interception, inline highlights, mock analysis engine, test simulator"

echo "🚀 Pushing to origin/main..."
git push origin main

echo "✅ Done! GitHub is up to date."
git log --oneline -3
