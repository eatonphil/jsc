import { mustequal } from './etc/assert.js';

function a(b, c) {
  return b + c;
}

function main() {
  const res = a(1, 2);
  mustequal(res, 3);
}
