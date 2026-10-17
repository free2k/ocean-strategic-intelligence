#!/usr/bin/env bash
set -euo pipefail
base=/opt/knowledge-base
stage=$base/multi-account-stage
mkdir -p "$stage"
for name in components composables layouts middleware pages public server types utils intelligence assets plugins shared; do
 if test -d "$base/$name"; then cp -aL "$base/$name" "$stage/"; fi
done
for name in app.vue app.config.ts nuxt.config.ts tsconfig.json package.json package-lock.json; do
 if test -f "$base/$name"; then cp -L "$base/$name" "$stage/$name"; fi
done
ln -sfn "$base/node_modules" "$stage/node_modules"
ln -sfn "$base/.env" "$stage/.env"
echo 'Fresh build workspace prepared'
