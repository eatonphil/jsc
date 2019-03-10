import { mustequal } from './etc/assert.js';

function main() {
  mustequal(1 === 2, false);
  mustequal(1 !== 2, true);
  mustequal(1 !== '1', true);
  mustequal(1 != '1', false);
  mustequal(1 != 2, true);
  mustequal(1 != 1, false);
  mustequal(1 == '1', true);
  mustequal(1 === '1', false);
}
