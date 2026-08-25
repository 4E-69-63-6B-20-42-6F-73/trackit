#!/bin/sh
set -eu

# Keep content-addressed assets from the previous release so browsers with an
# older index can finish lazy imports while the new release becomes active.
find /app/dist/assets -type f -mtime +30 -delete 2>/dev/null || true
cp -R /app/dist-seed/. /app/dist/
exec node build/server/index.js
