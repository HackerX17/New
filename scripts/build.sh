#!/usr/bin/env sh
# Wraps savepoint/app.html (the page body, as published to claude.ai) into a
# standalone savepoint/index.html you can open locally or host on any static site.
set -e
cd "$(dirname "$0")/.."
{
  printf '%s\n' '<!doctype html>' '<html lang="en">' '<head>' '<meta charset="utf-8">' \
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' '</head>' '<body>'
  cat savepoint/app.html
  printf '%s\n' '</body>' '</html>'
} > savepoint/index.html
echo "Built savepoint/index.html"
