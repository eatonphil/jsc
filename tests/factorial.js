function facHelper(x, acc) {
  if (x <= 1) {
    return acc;
  } else {
    return facHelper(x-1, x*acc);
  }
}

function factorial(x) {
  return facHelper(x, 1);
}

function main() {
  console.log(factorial(5));
}
