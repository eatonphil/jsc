import { mustequal } from './etc/assert.js';

function main() {
  const a = Array(1, 11);
  mustequal(a[1], 11);
}
