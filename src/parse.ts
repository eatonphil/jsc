import { readFileSync } from 'fs';
import * as path from 'path';

import * as ts from 'typescript';

export function parse(fileName: string): ts.Program {
  return ts.createProgram([fileName], {
    allowNonTsExtensions: true,
  });
}
