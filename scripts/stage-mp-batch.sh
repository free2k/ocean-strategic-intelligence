#!/usr/bin/env bash
set -euo pipefail
cd /opt/knowledge-base
mkdir -p subscription-batch-stage
for f in app.vue nuxt.config.ts tsconfig.json package.json components composables pages layouts middleware server assets public plugins utils types filter intelligence; do
 if test -e "$f"; then cp -a "$f" subscription-batch-stage/; fi
done
ln -s /opt/knowledge-base/node_modules subscription-batch-stage/node_modules
