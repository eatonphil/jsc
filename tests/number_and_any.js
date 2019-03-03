// implicit any
function c(a) {
  let d = a;
  let b = 1;
  b = a;
  b = 2;
  console.log(b);
}

function main() {
  c("fooobar");
}
