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
  console.log(fib(50, 0, 1));
}
