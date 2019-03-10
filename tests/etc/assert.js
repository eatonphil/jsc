export function mustequal(a, b) {
  if (a === b) {
    console.log('SUCCESS');
    return;
  }

  console.log("FAILED: Expected '" + a + "' to equal '" + b + "'");
  process.exit(1);
}
