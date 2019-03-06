function fib(n, a, b) {
  if (n === 0) {
    return a;
  }

  if (n === 1) {
    return b;
  }

  return fib(n - 1, b, a + b);
}

function main() {
  console.time('fib');
  console.log(fib(100, 0, 1));
  console.timeEnd('fib');
}

main();
