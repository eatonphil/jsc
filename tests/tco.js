import { mustequal }  from './tests/etc/assert.js';

function fib(n: number, a: number, b: number) {
  if (n === 0) {
    return a;
  }

  if (n === 1) {
    return b;
  }

  return fib(n - 1, b, a + b);
}

function main() {
  const res = fib(50, 0, 1);
  mustequal(res, 12586269025);
}
