import { readFileSync } from 'fs';
import * as ts from 'typescript';

export function parse(fileName: string): ts.SourceFile {
  return ts.createSourceFile(
    fileName,
    readFileSync(fileName).toString(),
    ts.ScriptTarget.ES2015,
  );
}
