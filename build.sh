#!/usr/bin/env bash

set -e

cargo build
RUST_BACKTRACE=1 ./target/debug/jsc $1 tout
cd tout
node-gyp configure
node-gyp build
node *.js
