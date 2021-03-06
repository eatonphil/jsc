import { build } from './build';
import { compile } from './compile';
import { parse } from './parse';

function main(entrypoint: string) {
  const ast = parse(entrypoint);
  const output = compile(ast);
  build('bin', output);
}

main(process.argv[2]);
