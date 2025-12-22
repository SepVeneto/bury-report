#!/bin/bash

set -e

npm i -g pnpm@9

pnpm i --frozen-lockfile

cd packages/core

pnpm build

npm publish --no-git-checks --access public

echo "✅ Publish completed"