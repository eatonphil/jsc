import * as path from 'path';
import { readFileSync } from 'fs';

import * as ts from 'typescript';

import * as emit from './emitters';
import * as format from './formatters';
import { Local, Locals } from './locals';
import { Type } from './type';

interface Context {
  buffer: string[];
  depth: number;
  tc: ts.TypeChecker,
  locals: Locals;
  moduleName: string;
  emit: (s: string, d?: number) => void;
  emitStatement: (s: string, d?: number) => void;
  emitAssign: (l: Local, s: string, d?: number) => void;
}

function mangle(moduleName: string, local: string) {
  return moduleName + '_' + local;
}

function identifier(id: ts.Identifier): string {
  return id.escapedText as string;
}

function compileBlock(
  context: Context,
  block: ts.Block,
) {
  block.statements.forEach(function (statement, i) {
    compileNode(context, context.locals.symbol(), statement);
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
  context.emitAssign(safe, `args[${n}]`);
}

function compileFunctionDeclaration(
  context: Context,
  fd: ts.FunctionDeclaration,
) {
  const name = fd.name ? identifier(fd.name) : 'lambda';
  const mangled = name === 'main' ? 'jsc_main' : mangle(context.moduleName, name);

  // Anonymous function declarations don't get added to locals.
  if (fd.name) {
    context.locals.register(name);
  }

  context.emit(`void ${mangled}(const FunctionCallbackInfo<Value>& args) {`);
  context.emitStatement(`Isolate* isolate = args.GetIsolate()`, context.depth + 1);

  const c = {
    ...context,
    depth: context.depth + 1,
  };

  if (fd.parameters) {
    fd.parameters.forEach(function (p, i) {
      compileParameter(c, p, i, i === fd.parameters.length - 1);
    });
  }

  context.emit('', 0);

  c.locals = c.locals.clone();
  if (fd.body) {
    compileBlock(c, fd.body);
  }

  context.emit('}\n', 0);
}

function compileCall(
  context: Context,
  destination: Local,
  ce: ts.CallExpression,
) {
  const args = ce.arguments.map(function (argument) {
    const arg = context.locals.symbol('arg');
    compileNode(context, arg, argument);
    return arg.name;
  });

  const argArray = context.locals.symbol('args');
  if (args.length) {
    context.emitStatement(`Local<Value> ${argArray.name}[] = { ${args.join(', ')} }`);
  }

  const fn = context.locals.symbol('fn', false, Type.V8Function);
  let literal = false;
  if (ce.expression.kind === ts.SyntaxKind.Identifier) {
    const id = identifier(ce.expression as ts.Identifier);
    if (context.locals.get(id)) {
      literal = true;
      const mangled = mangle(context.moduleName, id);
      context.emitAssign(fn, `FunctionTemplate::New(isolate, ${mangled})->GetFunction()`);
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

function compileIdentifier(
  context: Context,
  destination: Local,
  id: ts.Identifier,
) {
  const global = 'isolate->GetCurrentContext()->Global()';

  let val = identifier(id);
  const mangled = mangle(context.moduleName, val);
  if (context.locals.get(mangled)) {
    destination.name = mangled;
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
  context.emitStatement(`args.GetReturnValue().Set(${tmp.name})`);
  context.emitStatement('return');
}

function compileIf(
  context: Context,
  exp: ts.Expression,
  thenStmt: ts.Statement,
  elseStmt: ts.Statement,
) {
  const tmp = context.locals.symbol();
  compileNode(context, tmp, exp);

  const args = context.locals.symbol();
  context.emitStatement(`Local<Value> ${args.name}[] = { ${tmp.name} }`);
  context.emitAssign(tmp, `Local<Function>::Cast(isolate->GetCurrentLocals()\
  ->Global()->Get(${format.v8String('Boolean')}))->Call(Null(isolate), 1, ${args.name})`);

  context.emit(`if (Local<Boolean>::Cast(${tmp.name})->IsTrue()) {`);
  const c = { ...context, depth: context.depth + 1 };
  compileNode(c, tmp, thenStmt);
  context.emit('} else {');
  compileNode(c, tmp, elseStmt);
  context.emit('}');
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
    case ts.SyntaxKind.PlusToken:
      value = `genericPlus(isolate, ${lhs.name}, ${rhs.name})`;
      break;
    default:
      throw new Error('Unsupported expression: ' + ts.SyntaxKind[be.operatorToken.kind]);
      break;
  }

  if (bool) {
    context.emitAssign(destination, `${bool} ? True(isolate) : False(isolate)`);
  } else if (value) {
    context.emitAssign(destination, value);
  }
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
    case ts.SyntaxKind.Identifier: {
      const id = node as ts.Identifier;
      compileIdentifier(context, destination, id);
      break;
    }
    case ts.SyntaxKind.StringLiteral: {
      const sl = node as ts.StringLiteral;
      context.emitAssign(destination, format.v8String(sl.text));
      break;
    }
    case ts.SyntaxKind.FirstLiteralToken:
    case ts.SyntaxKind.NumericLiteral: {
      const nl = node as ts.NumericLiteral;
      context.emitAssign(destination, format.v8Number(nl.text));
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
    case ts.SyntaxKind.BinaryExpression: {
      const be = node as ts.BinaryExpression;
      compileBinaryExpression(context, destination, be);
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
  ts.forEachChild(ast, function(node) {
    compileNode(context, locals.symbol(), node);
  });
}

function emitPrefix(buffer: string[]) {
  emit.emit(buffer, 0, readFileSync(path.join(__dirname, 'lib.cc')).toString());
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
  program.getSourceFiles().forEach(function (source) {
    if (source.fileName.endsWith('.d.ts')) {
      return;
    }

    const context = {
      buffer,
      depth: 0,
      tc,
      locals: new Locals,
      moduleName: '',
      emit(s: string, d?: number) {
	emit.emit(this.buffer, d === undefined ? this.depth : d, s);
      },
      emitStatement(s: string, d?:number) {
	emit.statement(this.buffer, d === undefined ? this.depth : d, s);
      },
      emitAssign(l: Local, s: string, d?:number) {
	emit.assign(this.buffer, d === undefined ? this.depth : d, l, s);
      },
    };
    compileSource(context, source);
  });

  emitPostfix(buffer);
  return buffer.join('\n').replace('\n\n}', '\n}');
}
