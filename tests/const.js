import { mustequal }  from './tests/etc/assert.js';

function main() {
  const a = 1;
  const b = "foo";
  const c = a + b;
  mustequal(c, "1foo");
}
