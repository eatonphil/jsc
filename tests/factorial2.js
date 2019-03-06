function factorial(x, acc) {
  if (x <= 1) {
    return acc;
  } else {
    return factorial(x-1, x*acc);
  }
}

function main() {
  console.log(factorial(5, 1));
}
