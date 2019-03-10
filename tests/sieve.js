function sieve(n) {
  const primes = [];

  for (let i = 2; i < n; i++) {
    primes[i] = true;
  }

  const limit = Math.sqrt(n);
  for (let i = 2; i < limit; i++) {
    if (primes[i] === true) {
      for (let j = i * i; j < n; j += i) {
        primes[j] = false;
      }
    }
  }

  for (let i = 2; i < n; i++) {
    if (primes[i] === true) {
      console.log(i);
    }
  }
}

function main() {
  const n = 1000;
  console.time('sieve');
  sieve(n);
  console.timeEnd('sieve');
}
