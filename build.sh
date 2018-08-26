#!/usr/bin/env bash

set -e

readonly out_dir=build

cargo build
RUST_BACKTRACE=1 ./target/debug/jsc --entry $1 --out_dir $out_dir
cd $out_dir
node-gyp configure
node-gyp build
node *.js
