function fib(i) {
  if (i <= 1) {
    return i;
  }

  return fib(i - 1) + fib(i - 2);
}

function main() {
  console.log(fib(20));
}
