function a(b: string) {
  let c = 1;
  c = b;
  c = 2;
  console.log(2);
}

function main() {
  a("foo");
}
