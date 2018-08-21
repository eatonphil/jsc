#!/usr/bin/env bash

cargo build
./target/debug/jsc > cout/test.cc
cd cout
node-gyp configure
node-gyp build
node entry.js
