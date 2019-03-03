function fib(i) {
  if (i <= 1) {
    return i;
  }

  let n = i;
  let previous_first = 0;
  let previous_second = 1;
  let next = 1;

  while (n >= 2) {
    next = previous_first + previous_second;
    previous_first = previous_second;
    previous_second = next;
    n = n - 1;
  }

  return next;
}

function main() {
  console.log(fib(50));
}
