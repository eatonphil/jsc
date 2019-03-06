import * as ts from 'typescript';

import { Local } from './Local';
import { Locals } from './Locals';

export interface Context {
  buffer: string[];
  depth: number;
  emit: (s: string, d?: number) => void;
  emitAssign: (l: Local, s: Local | string | null, d?: number) => void;
  emitStatement: (s: string, d?: number) => void;
  emitLabel: (s: string, d?: number) => void;
  locals: Locals;
  moduleName: string;
  tc: ts.TypeChecker;
  tco: {
    [name: string]: {
      label: string;
      parameters: ts.NodeArray<ts.ParameterDeclaration>;
    };
  };
}
