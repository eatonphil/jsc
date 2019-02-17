#!/usr/bin/env bash

set -e

for f in tests/*.js; do
    echo "Testing $f"
    node build/main "$f"
    node bin
done
