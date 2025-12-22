#!/bin/bash

set -e

pnpm i --frozen-lockfile

cd packages/core

pnpm build

npm publish --no-git-checks --access public

echo "✅ Publish completed"