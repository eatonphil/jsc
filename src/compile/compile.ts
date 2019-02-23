import { readFileSync } from 'fs';
import * as path from 'path';

import * as ts from 'typescript';

import * as emit from './emitters';
import * as format from './formatters';
import { Local, Locals } from './locals';
import { Type } from './type';

interface Context {
  buffer: string[];
  depth: number;
  emit: (s: string, d?: number) => void;
  emitAssign: (l: Local, s: string, d?: number) => void;
  emitStatement: (s: string, d?: number) => void;
  labelCounter: number;
  locals: Locals;
  moduleName: string;
  tc: ts.TypeChecker;
  tco: { [name: string]: string };
}

function mangle(moduleName: string, local: string) {
  return moduleName + '_' + local;
}

function identifier(id: ts.Identifier): string {
  return id.escapedText as string;
}

function compileArrayLiteral(
  context: Context,
  destination: Local,
  { elements }: ts.ArrayLiteralExpression,
) {
  let tmp;
  if (!destination.initialized) {
    tmp = destination;
  } else {
    tmp = context.locals.symbol();
  }

  tmp.type = Type.V8Array;
  context.emitAssign(tmp, `Local<Array>::New(isolate, ${elements.length})`);
  const init = context.locals.symbol('init');
  elements.forEach((e, i) => {
    compileNode(context, init, e);
    context.emitStatement(`${tmp}->Set(${i}, ${init.name})`);
  });

  if (tmp === destination) {
    context.emitAssign(destination, tmp.name);
  }
}

function compileBlock(
  context: Context,
  block: ts.Block,
) {
  block.statements.forEach((statement, i) => {
    compileNode({
      ...context,
      tco: i < block.statements.length - 1 ? {} : context.tco,
    }, context.locals.symbol(), statement);
  });
}

function compileParameter(
  context: Context,
  p: ts.ParameterDeclaration,
  n: number,
  last: boolean,
) {
  if (p.name.kind === ts.SyntaxKind.ObjectBindingPattern ||
      p.name.kind === ts.SyntaxKind.ArrayBindingPattern) {
    throw new Error('Parameter destructuring not supported');
  }

  const id = identifier(p.name);
  const safe = context.locals.register(mangle(context.moduleName, id));
  safe.name = `args[${n}]`;
  safe.initialized = true;
}

function compileFunctionDeclaration(
  context: Context,
  fd: ts.FunctionDeclaration,
) {
  const name = fd.name ? identifier(fd.name) : 'lambda';
  const mangled = name === 'main' ? 'jsc_main' : mangle(context.moduleName, name);

  const safe = context.locals.register(mangled);
  const tcoLabel = `tail_recurse_${context.labelCounter++}`;

  context.emit(`void ${mangled}(const FunctionCallbackInfo<Value>& _args) {`);
  context.emitStatement('Isolate* isolate = _args.GetIsolate()', context.depth + 1);
  context.emitStatement('std::vector<Local<Value>> args(_args.Length())', context.depth + 1);
  context.emitStatement('for (int i = 0; i < _args.Length(); i++) args[i] = _args[i]', context.depth + 1);
  context.emit(`${tcoLabel}:\n`, context.depth);

  const childContext = {
    ...context,
    depth: context.depth + 1,
    // Body, parameters get new context
    locals: context.locals.clone(),
    // Copying might not allow for mutually tail-recursive functions?
    tco: { ...context.tco, [safe.name]: tcoLabel },
  };

  if (fd.parameters) {
    fd.parameters.forEach((p, i) => {
      compileParameter(childContext, p, i, i === fd.parameters.length - 1);
    });
  }

  if (fd.body) {
    compileBlock(childContext, fd.body);
  }

  // Needed for labels at end of body
  context.emitStatement('return', context.depth + 1);
  context.emit('}\n');
}

function compileCall(
  context: Context,
  destination: Local,
  ce: ts.CallExpression,
) {
  let tcoLabel;
  if (ce.expression.kind === ts.SyntaxKind.Identifier) {
    const id = identifier(ce.expression as ts.Identifier);
    const safe = context.locals.get(mangle(context.moduleName, id));

    if (safe) {
      tcoLabel = context.tco[safe.name];
    }
  }

  const args = ce.arguments.map((argument)=>{
    const arg = context.locals.symbol('arg');
    compileNode(context, arg, argument);
    return arg.name;
  });

  const argArray = context.locals.symbol('args');
  if (!tcoLabel && args.length) {
    context.emitStatement(`Local<Value> ${argArray.name}[] = { ${args.join(', ')} }`);
  }

  const fn = context.locals.symbol('fn', false, Type.V8Function);
  let literal = false;
  if (ce.expression.kind === ts.SyntaxKind.Identifier) {
    const id = identifier(ce.expression as ts.Identifier);
    const mangled = mangle(context.moduleName, id);
    const safe = context.locals.get(mangled);

    if (safe) {
      if (tcoLabel) {
  args.forEach((arg, i) =>{
    context.emitStatement(`args[${i}] = ${arg}`);
  });

  context.emitStatement(`goto ${tcoLabel}`);
  context.emit('', 0);
  return;
      }

      literal = true;
      context.emitAssign(fn, `FunctionTemplate::New(isolate, ${safe.name})->GetFunction()`);
      context.emitStatement(`${fn.name}->SetName(${format.v8String(mangled)})`);
    }
  }

  if (!literal) {
    const tmp = context.locals.symbol();
    compileNode(context, tmp, ce.expression);
    context.emitAssign(fn, `Local<Function>::Cast(${tmp.name})`);
  }

  const argArrayName = args.length ? argArray.name : 0;
  const call = `${fn.name}->Call(${fn.name}, ${args.length}, ${argArrayName})`;
  context.emitAssign(destination, call);
  context.emit('', 0);
}

function compilePropertyAccess(
  context: Context,
  destination: Local,
  pae: ts.PropertyAccessExpression,
) {
  const exp = context.locals.symbol('parent');
  compileNode(context, exp, pae.expression);
  const id = identifier(pae.name);
  context.emitAssign(destination, `${exp.name}.As<Object>()->Get(${format.v8String(id)})`);
}

function compileElementAccess(
  context: Context,
  destination: Local,
  eae: ts.ElementAccessExpression,
) {
  const exp = context.locals.symbol('parent');
  compileNode(context, exp, eae.expression);

  const arg = context.locals.symbol('arg');
  compileNode(context, arg, eae.argumentExpression);

  context.emitAssign(destination, `${exp.name}.As<Object>()->Get(${arg.name})`);
}

function compileIdentifier(
  context: Context,
  destination: Local,
  id: ts.Identifier,
) {
  const global = 'isolate->GetCurrentContext()->Global()';

  let val = identifier(id);
  const mangled = mangle(context.moduleName, val);
  const local = context.locals.get(mangled);
  if (local) {
    if (!local.initialized) {
      destination.name = mangled;
    } else {
      destination.name = local.name;
      destination.type = local.type;
    }

    destination.initialized = true;
    return;
  } else if (val === 'global') {
    val = global;
  } else {
    val = `${global}->Get(${format.v8String(val)})`;
  }

  context.emitAssign(destination, val);
}

function compileReturn(
  context: Context,
  exp: ts.Expression,
) {
  const tmp = context.locals.symbol();
  compileNode(context, tmp, exp);

  // Should only be uninitialized if this was tail-call optimized
  if (tmp.initialized) {
    context.emitStatement(`_args.GetReturnValue().Set(${tmp.name})`);
    context.emitStatement('return');
  }
}

function compileIf(
  context: Context,
  exp: ts.Expression,
  thenStmt: ts.Statement,
  elseStmt?: ts.Statement,
) {
  context.emit('', 0);

  const test = context.locals.symbol();
  compileNode(context, test, exp);

  context.emit(`if (${format.boolean(test)}) {`);
  const c = { ...context, depth: context.depth + 1 };
  compileNode(c, context.locals.symbol(), thenStmt);

  if (elseStmt) {
    context.emit('} else {');
    compileNode(c, context.locals.symbol(), elseStmt);
  }

  context.emit('}\n');
}

function compilePostfixUnaryExpression(
  context: Context,
  destination: Local,
  pue: ts.PostfixUnaryExpression,
) {
  const lhs = context.locals.symbol('lhs');
  lhs.type = Type.V8Number;
  compileNode(context, lhs, pue.operand);

  // f++ previous value of f is returned
  destination.type = Type.V8Number;
  context.emitAssign(destination, lhs.name);

  switch (pue.operator) {
    case ts.SyntaxKind.PlusPlusToken:
      context.emitAssign(lhs, format.v8Number(`${format.number(lhs)} + 1`));
      break;
    case ts.SyntaxKind.MinusMinusToken:
      context.emitAssign(lhs, format.v8Number(`${format.number(lhs)} - 1`));
      break;
    default:
      throw new Error('Unsupported operator: ' + ts.SyntaxKind[pue.operator]);
      break;
  }
}

function compileBinaryExpression(
  context: Context,
  destination: Local,
  be: ts.BinaryExpression,
) {
  const lhs = context.locals.symbol('lhs');
  compileNode(context, lhs, be.left);

  const rhs = context.locals.symbol('rhs');
  compileNode(context, rhs, be.right);

  let bool;
  let value;

  switch (be.operatorToken.kind) {
    case ts.SyntaxKind.EqualsToken:
      context.emitAssign(lhs, format.cast(lhs, rhs, true));
      context.emitAssign(destination, format.cast(destination, lhs, true));
      return;
    case ts.SyntaxKind.LessThanToken:
      bool = `${format.number(lhs)} < ${format.number(rhs)}`;
      break;
    case ts.SyntaxKind.GreaterThanToken:
      bool = `${format.number(lhs)} > ${format.number(rhs)}`;
      break;
    case ts.SyntaxKind.LessThanEqualsToken:
      bool = `${format.number(lhs)} <= ${format.number(rhs)}`;
      break;
    case ts.SyntaxKind.GreaterThanEqualsToken:
      bool = `${format.number(lhs)} >= ${format.number(rhs)}`;
      break;
    case ts.SyntaxKind.ExclamationEqualsToken:
      bool = `!${lhs.name}->Equals(${rhs.name})`;
      break;
    case ts.SyntaxKind.EqualsEqualsToken:
      bool = `${lhs.name}->Equals(${rhs.name})`;
      break;
    case ts.SyntaxKind.ExclamationEqualsEqualsToken:
      bool = `!${lhs.name}->StrictEquals(${rhs.name})`;
      break;
    case ts.SyntaxKind.EqualsEqualsEqualsToken:
      bool = `${lhs.name}->StrictEquals(${rhs.name})`;
      break;
    case ts.SyntaxKind.AmpersandAmpersandToken:
      bool = `${format.boolean(lhs)} ? (${format.boolean(rhs)} ? ${rhs.name} : ${lhs.name}) : ${lhs.name}`;
      break;
    case ts.SyntaxKind.PlusToken:
      value = format.plus(lhs, rhs);
      break;
    case ts.SyntaxKind.MinusToken:
      lhs.type = Type.V8Number;
      rhs.type = Type.V8Number;
      value = `genericMinus(isolate, ${lhs.name}, ${rhs.name})`;
      break;
    default:
      throw new Error('Unsupported operator: ' + ts.SyntaxKind[be.operatorToken.kind]);
      break;
  }

  if (bool) {
    destination.type = Type.V8Boolean;
    context.emitAssign(destination, format.v8Boolean(bool));
  } else if (value) {
    if (lhs.type === Type.V8String || rhs.type === Type.V8String) {
      destination.type = Type.V8String;
    } else if (lhs.type === Type.V8Number && rhs.type === Type.V8Number) {
      destination.type = Type.V8Number;
    }

    context.emitAssign(destination, value);
  }
}

function compileVariable(
  context: Context,
  destination: Local,
  vd: ts.VariableDeclaration,
) {
  if (vd.name.kind === ts.SyntaxKind.ObjectBindingPattern ||
      vd.name.kind === ts.SyntaxKind.ArrayBindingPattern) {
    throw new Error('Variable destructuring not supported');
  }

  const id = identifier(vd.name);
  const safe = context.locals.register(mangle(context.moduleName, id));

  if (vd.initializer) {
    compileNode(context, safe, vd.initializer);
  }
}

function compileDo(
  context: Context,
  {
    statement: body,
    expression: test,
  }: ts.DoStatement,
) {
  context.emit('do {');

  const bodyContext = { ...context, depth: context.depth + 1 };
  compileNode(bodyContext, context.locals.symbol(), body);

  const tmp = context.locals.symbol('test');
  compileNode(bodyContext, tmp, test);

  context.emitStatement(`} while (${tmp.name})`);
}

function compileWhile(
  context: Context,
  {
    statement: body,
    expression: exp,
  }: ts.WhileStatement,
) {
  const test = context.locals.symbol();
  compileNode(context, test, exp);

  context.emit(`while (${format.boolean(test)}) {`);

  const bodyContext = { ...context, depth: context.depth + 1 };
  compileNode(bodyContext, context.locals.symbol(), body);

  compileNode(bodyContext, test, exp);

  context.emit('}');
}

function compileFor(
  context: Context,
  {
    initializer,
    condition,
    incrementor,
    statement: body,
  }: ts.ForStatement,
) {
  const init = context.locals.symbol('init');
  if (initializer) {
    compileNode(context, init, initializer);
  }

  const cond = context.locals.symbol('cond');
  if (condition) {
    compileNode(context, cond, condition);
  }

  const label = `done_while_${context.labelCounter++}`;
  context.emit(`while (true) {`);

  const childContext = { ...context, depth: context.depth + 1 };
  const tmp = context.locals.symbol('body');
  compileNode(childContext, tmp, body);

  if (incrementor) {
    compileNode(childContext, context.locals.symbol('inc'), incrementor);
  }

  if (condition) {
    compileNode(childContext, cond, condition);
    childContext.emit('', 0);
    childContext.emitStatement(`if (!${format.boolean(cond)}) goto ${label}`);
  }

  context.emit('}');

  if (condition) {
    context.emit(`${label}:`, 0);
  }
}

function compileImport(
  context: Context,
  id: ts.ImportDeclaration,
) {
  // TODO: validate import was exported

  const t = id.importClause &&
      id.importClause.namedBindings &&
      id.importClause.namedBindings.kind === ts.SyntaxKind.NamedImports ?
      id.importClause.namedBindings :
      { elements: undefined };
  if (t.elements) {
    // Only root-relative import paths for now
    const { text } = id.moduleSpecifier as ts.StringLiteral;
    const fileName = path.resolve(text);

    const source = ts.createSourceFile(
      fileName,
      readFileSync(fileName).toString(),
      ts.ScriptTarget.ES2015,
    );

    const moduleContext = {
      ...context,
      depth: 0,
      locals: new Locals,
      moduleName: '',
      tco: {},
    };
    compileSource(moduleContext, source);

    t.elements.forEach((exportObject) =>{
      if (exportObject.propertyName) {
	throw new Error('Unsupported import style: import { <> as <> } from \'<>\';');
      }

      const exportName = identifier(exportObject.name);
      // Put the name the module will reference into context
      const local = context.locals.register(
  mangle(context.moduleName, exportName));
      // Grab the location it will have been registered in the other module
      const real = moduleContext.locals.get(
  mangle(moduleContext.moduleName, exportName));
      // Set the local lookup value to the real lookup value
      local.name = real.name;
      local.initialized = true;
    });

    return;
  }

  throw new Error('Unsupported import style');
}

function compileNode(
  context: Context,
  destination: Local,
  node: ts.Node,
) {
  switch (node.kind) {
    case ts.SyntaxKind.FunctionDeclaration: {
      const fd = node as ts.FunctionDeclaration;
      compileFunctionDeclaration(context, fd);
      break;
    }
    case ts.SyntaxKind.ExpressionStatement: {
      const es = node as ts.ExpressionStatement;
      compileNode(context, destination, es.expression);
      break;
    }
    case ts.SyntaxKind.VariableStatement: {
      const vs = node as ts.VariableStatement;
      compileNode(context, destination, vs.declarationList);
      break;
    }
    case ts.SyntaxKind.VariableDeclarationList: {
      const dl = node as ts.VariableDeclarationList;
      dl.declarations.forEach((d)=>{
  compileVariable(context, context.locals.symbol(), d);
      });
      break;
    }
    case ts.SyntaxKind.BinaryExpression: {
      const be = node as ts.BinaryExpression;
      compileBinaryExpression(context, destination, be);
      break;
    }
    case ts.SyntaxKind.PostfixUnaryExpression: {
      const pue = node as ts.PostfixUnaryExpression;
      compilePostfixUnaryExpression(context, destination, pue);
      break;
    }
    case ts.SyntaxKind.CallExpression: {
      const ce = node as ts.CallExpression;
      compileCall(context, destination, ce);
      break;
    }
    case ts.SyntaxKind.PropertyAccessExpression: {
      const pae = node as ts.PropertyAccessExpression;
      compilePropertyAccess(context, destination, pae);
      break;
    }
    case ts.SyntaxKind.ElementAccessExpression: {
      const eae = node as ts.ElementAccessExpression;
      compileElementAccess(context, destination, eae);
      break;
    }
    case ts.SyntaxKind.Identifier: {
      const id = node as ts.Identifier;
      compileIdentifier(context, destination, id);
      break;
    }

    case ts.SyntaxKind.StringLiteral: {
      const sl = node as ts.StringLiteral;
      destination.type = Type.V8String;
      context.emitAssign(destination, format.v8String(sl.text));
      break;
    }
    case ts.SyntaxKind.NullKeyword:
      context.emitAssign(destination, 'Null(isolate)');
      break;
    case ts.SyntaxKind.TrueKeyword:
      destination.type = Type.V8Boolean;
      context.emitAssign(destination, format.v8Boolean(true));
      break;
    case ts.SyntaxKind.FalseKeyword:
      destination.type = Type.V8Boolean;
      context.emitAssign(destination, format.v8Boolean(false));
      break;

    case ts.SyntaxKind.ArrayLiteralExpression: {
      const ale = node as ts.ArrayLiteralExpression;
      compileArrayLiteral(context, destination, ale);
      break;
    }

    case ts.SyntaxKind.FirstLiteralToken:
    case ts.SyntaxKind.NumericLiteral: {
      const nl = node as ts.NumericLiteral;
      destination.type = Type.V8Number;
      context.emitAssign(destination, format.v8Number(nl.text));
      break;
    }

    case ts.SyntaxKind.DoStatement: {
      const ds = node as ts.DoStatement;
      compileDo(context, ds);
      break;
    }
    case ts.SyntaxKind.WhileStatement: {
      const ws = node as ts.WhileStatement;
      compileWhile(context, ws);
      break;
    }
    case ts.SyntaxKind.ForStatement: {
      const fs = node as ts.ForStatement;
      compileFor(context, fs);
      break;
    }

    case ts.SyntaxKind.ReturnStatement: {
      const rs = node as ts.ReturnStatement;
      compileReturn(context, rs.expression);
      break;
    }
    case ts.SyntaxKind.IfStatement: {
      const is = node as ts.IfStatement;
      compileIf(context, is.expression, is.thenStatement, is.elseStatement);
      break;
    }
    case ts.SyntaxKind.Block: {
      const b = node as ts.Block;
      compileBlock(context, b);
      break;
    }
    case ts.SyntaxKind.ImportDeclaration: {
      const id = node as ts.ImportDeclaration;
      compileImport(context, id);
      break;
    }
    case ts.SyntaxKind.ExportDeclaration: {
      // TODO: add export to exports list;
      break;
    }
    case ts.SyntaxKind.EndOfFileToken:
      break;
    default:
      throw new Error('Unsupported syntax element: ' + ts.SyntaxKind[node.kind]);
  }
}

export function compileSource(
  context: Context,
  ast: ts.SourceFile,
) {
  const locals = new Locals;
  // TODO: mangle module name appropriately (e.g. replace('.', '_'), etc.)
  const moduleName = path.basename(ast.fileName, path.extname(ast.fileName));
  context.moduleName = moduleName;
  ts.forEachChild(ast, (node)=>{
    compileNode(context, locals.symbol(), node);
  });
}

function emitPrefix(buffer: string[]) {
  emit.emit(buffer, 0, `#include "lib.cc"\n`);
}

function emitPostfix(buffer: string[]) {
  emit.emit(buffer, 0, `void Init(Local<Object> exports) {
  NODE_SET_METHOD(exports, "jsc_main", jsc_main);
}

NODE_MODULE(NODE_GYP_MODULE_NAME, Init)\n`);
}

export function compile(program: ts.Program) {
  const buffer = [];
  emitPrefix(buffer);

  const tc = program.getTypeChecker();
  program.getSourceFiles().forEach((source) =>{
    if (source.fileName.endsWith('.d.ts')) {
      return;
    }

    const context = {
      buffer,
      depth: 0,
      emit(s: string, d?: number) {
  emit.emit(this.buffer, d === undefined ? this.depth : d, s);
      },
      emitAssign(l: Local, s: string, d?: number) {
  emit.assign(this.buffer, d === undefined ? this.depth : d, l, s);
      },
      emitStatement(s: string, d?: number) {
  emit.statement(this.buffer, d === undefined ? this.depth : d, s);
      },
      labelCounter: 0,
      locals: new Locals,
      moduleName: '',
      tc,
      tco: {},
    };
    compileSource(context, source);
  });

  emitPostfix(buffer);
  return buffer.join('\n');
}
