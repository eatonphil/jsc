import { mustequal } from './etc/assert.js';

function main() {
  const a = Object();
  a.b = 1;
  mustequal(a.b, 1);
}
