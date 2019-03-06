export function string(lit: string) {
  return '"' + lit.replace('\n', '\\\n') + '"';
}
