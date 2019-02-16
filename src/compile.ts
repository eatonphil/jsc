import * as path from 'path';
import { readFileSync } from 'fs';

import * as ts from 'typescript';

enum Type {
  V8Value,
  V8Function,
}

class Local {
  initialized?: boolean;
  name: string;
  type: Type;

  constructor(name: string, initialized?: boolean, type?: Type) {
    this.name = name;
    this.initialized = initialized;
    this.type = type || Type.V8Value;
  }
}

let uniqueCounter = 0;

class Context {
  map: { [local: string]: Local } = {};

  symbol(prefix?: string, initialized?: boolean, type?: Type) {
    let mapped;
    do {
      mapped = 'sym_' + (prefix || 'anon') + '_' + (uniqueCounter++);
    } while (this.map[mapped]);

    this.map[mapped] = new Local(mapped, initialized, type);
    return this.map[mapped];
  }

  register(local: string, initialized?: boolean, type?: Type) {
    let mapped = local;
    while (this.map[mapped]) {
      mapped = local + '_' + Object.keys(this.map);
    }
    this.map[local] = new Local(mapped, initialized, type);
    return this.map[local];
  }

  get(local: string) {
    return this.map[local];
  }

  clone() {
    const c = new Context;
    c.map = { ...this.map };
    return c;
  }
}

function emit(
  buffer: string[],
  indentation: number,
  output: string,
) {
  buffer.push(new Array(indentation + 1).join('  ') + output);
}

function emitStatement(
  buffer: string[],
  indentation: number,
  output: string,
) {
  emit(buffer, indentation, output + ';');
}

function emitAssign(buffer: string[], depth: number, destination: Local, val: string) {
  if (!destination.initialized) {
    const type = destination.type === Type.V8Value ? 'Local<Value>' : 'Local<Function>';
    emitStatement(buffer, depth, `${type} ${destination.name} = ${val}`);
    destination.initialized = true;
    return;
  }

  emitStatement(buffer, depth, `${destination.name} = ${val}`);
}

function formatV8String(raw: string) {
  return `String::NewFromUtf8(isolate, "${raw}")`;
}

function formatV8Number(raw: string) {
  return `Number::New(isolate, ${raw})`;
}

function mangle(moduleName: string, local: string) {
  return moduleName + '_' + local;
}

function identifier(id: ts.Identifier): string {
  return id.escapedText as string;
}

function compileBlock(
  buffer: string[],
  depth: number,
  tc: ts.TypeChecker,
  context: Context,
  moduleName: string,
  block: ts.Block,
) {
  block.statements.forEach(function (statement, i) {
    compileNode(buffer, depth, tc, context, moduleName, context.symbol(), statement);
  });
}

function compileFunctionDeclaration(
  buffer: string[],
  depth: number,
  tc: ts.TypeChecker,
  context: Context,
  moduleName: string,
  id?: ts.Identifier,
  body?: ts.Block,
) {
  const name = id ? identifier(id) : 'lambda';
  const mangled = name === 'main' ? 'jsc_main' : mangle(moduleName, name);

  // Anonymous function declarations don't get added to context.
  if (id) {
    context.register(name);
  }

  emit(buffer, depth - 1, `void ${mangled}(const FunctionCallbackInfo<Value>& args) {`);
  emitStatement(buffer, depth, `Isolate* isolate = args.GetIsolate()`);
  emit(buffer, depth - 1, '');

  // TODO: handle args

  const childContext = context.clone();
  if (body) {
    compileBlock(buffer, depth, tc, childContext, moduleName, body);
  }
  
  emit(buffer, depth - 1, '}\n');
}

function compileCall(
  buffer: string[],
  depth: number,
  tc: ts.TypeChecker,
  context: Context,
  moduleName: string,
  destination: Local,
  ce: ts.CallExpression,
) {
  const args = ce.arguments.map(function (argument) {
    const arg = context.symbol('arg');
    compileNode(buffer, depth, tc, context, moduleName, arg, argument);
    return arg.name;
  });

  const argArray = context.symbol('args');
  if (args.length) {
    emitStatement(buffer, depth, `Local<Value> ${argArray.name}[] = { ${args.join(', ')} }`);
  }

  const fn = context.symbol('fn', false, Type.V8Function);
  let literal = false;
  if (ce.expression.kind === ts.SyntaxKind.Identifier) {
    const id = identifier(ce.expression as ts.Identifier);
    if (context.get(id)) {
      literal = true;
      const mangled = mangle(moduleName, id);
      emitAssign(buffer, depth, fn, `FunctionTemplate::New(isolate, ${mangled})->GetFunction()`);
      emitStatement(buffer, depth, `${fn.name}->SetName(${formatV8String(mangled)})`);
    }
  }

  if (!literal) {
    const tmp = context.symbol();
    compileNode(buffer, depth, tc, context, moduleName, tmp, ce.expression);
    emitAssign(buffer, depth, fn, `Local<Function>::Cast(${tmp.name})`);
  }

  const argArrayName = args.length ? argArray.name : 0;
  const call = `${fn.name}->Call(${fn.name}, ${args.length}, ${argArrayName})`;
  emitAssign(buffer, depth, destination, call);
  emit(buffer, depth - 1, '');
}

function compilePropertyAccess(
  buffer: string[],
  depth: number,
  tc: ts.TypeChecker,
  context: Context,
  moduleName: string,
  destination: Local,
  pae: ts.PropertyAccessExpression,
) {
  const exp = context.symbol('parent');
  compileNode(buffer, depth, tc, context, moduleName, exp, pae.expression);
  const id = identifier(pae.name);
  emitAssign(buffer, depth, destination, `${exp.name}.As<Object>()->Get(${formatV8String(id)})`);
}

function compileIdentifier(
  buffer: string[],
  depth: number,
  tc: ts.TypeChecker,
  context: Context,
  moduleName: string,
  destination: Local,
  id: ts.Identifier,
) {
  let val = identifier(id);
  if (context.get(val)) {
    val = mangle(moduleName, val);
  } else if (val === 'global') {
    val = 'isolate->GetCurrentContext()->Global()';
  } else {
    val = `isolate->GetCurrentContext()->Global()->Get(${formatV8String(val)})`;
  }

  emitAssign(buffer, depth, destination, val);
}

function compileReturn(
  buffer: string[],
  depth: number,
  tc: ts.TypeChecker,
  context: Context,
  moduleName: string,
  exp: ts.Expression,
) {
  const tmp = context.symbol();
  compileNode(buffer, depth, tc, context, moduleName, tmp, exp);
  emitStatement(buffer, depth, `args.GetReturnValue().Set(${tmp.name})`);
  emitStatement(buffer, depth, 'return');
}

function compileIf(
  buffer: string[],
  depth: number,
  tc: ts.TypeChecker,
  context: Context,
  moduleName: string,
  exp: ts.Expression,
  thenStmt: ts.Statement,
  elseStmt: ts.Statement,
) {
  const tmp = context.symbol();
  compileNode(buffer, depth, tc, context, moduleName, tmp, exp);

  const args = context.symbol();
  emitStatement(buffer, depth, `Local<Value> ${args.name}[] = { ${tmp.name} }`);
  emitAssign(buffer, depth, tmp, `Local<Function>::Cast(isolate->GetCurrentContext()\
  ->Global()->Get(${formatV8String('Boolean')}))->Call(Null(isolate), 1, ${args.name})`);

  emit(buffer, depth, `if (Local<Boolean>::Cast(${tmp.name})->Value()) {`);
  compileNode(buffer, depth + 1, tc, context, moduleName, tmp, thenStmt);
  emit(buffer, depth, '} else {');
  compileNode(buffer, depth + 1, tc, context, moduleName, tmp, elseStmt);
  emit(buffer, depth, '}');
}

function compileNode(
  buffer: string[],
  depth: number,
  tc: ts.TypeChecker,
  context: Context,
  moduleName: string,
  destination: Local,
  node: ts.Node,
) {
  switch (node.kind) {
    case ts.SyntaxKind.FunctionDeclaration: {
      const fd = node as ts.FunctionDeclaration;
      compileFunctionDeclaration(buffer, depth, tc, context, moduleName, fd.name, fd.body);
      break;
    }
    case ts.SyntaxKind.ExpressionStatement: {
      const es = node as ts.ExpressionStatement;
      compileNode(buffer, depth, tc, context, moduleName, destination, es.expression);
      break;
    }
    case ts.SyntaxKind.CallExpression: {
      const ce = node as ts.CallExpression;
      compileCall(buffer, depth, tc, context, moduleName, destination, ce);
      break;
    }
    case ts.SyntaxKind.PropertyAccessExpression: {
      const pae = node as ts.PropertyAccessExpression;
      compilePropertyAccess(buffer, depth, tc, context, moduleName, destination, pae);
      break;
    }
    case ts.SyntaxKind.Identifier: {
      const id = node as ts.Identifier;
      compileIdentifier(buffer, depth, tc, context, moduleName, destination, id);
      break;
    }
    case ts.SyntaxKind.StringLiteral: {
      const sl = node as ts.StringLiteral;
      emitAssign(buffer, depth, destination, formatV8String(sl.text));
      break;
    }
    case ts.SyntaxKind.FirstLiteralToken:
    case ts.SyntaxKind.NumericLiteral: {
      const nl = node as ts.NumericLiteral;
      emitAssign(buffer, depth, destination, formatV8Number(nl.text));
      break;
    }
    case ts.SyntaxKind.ReturnStatement: {
      const rs = node as ts.ReturnStatement;
      compileReturn(buffer, depth, tc, context, moduleName, rs.expression);
      break;
    }
    case ts.SyntaxKind.IfStatement: {
      const is = node as ts.IfStatement;
      compileIf(buffer, depth, tc, context, moduleName,
		is.expression, is.thenStatement, is.elseStatement);
      break;
    }
    case ts.SyntaxKind.Block: {
      const b = node as ts.Block;
      compileBlock(buffer, depth, tc, context, moduleName, b);
      break;
    }
    case ts.SyntaxKind.EndOfFileToken:
      break;
    default:
      console.log('Unsupported syntax element: ', ts.SyntaxKind[node.kind]);
  }
}

export function compileSource(
  buffer: string[],
  depth: number,
  tc: ts.TypeChecker,
  ast: ts.SourceFile,
) {
  const context = new Context;
  // TODO: mangle module name appropriately (e.g. replace('.', '_'), etc.)
  const moduleName = path.basename(ast.fileName, path.extname(ast.fileName));
  ts.forEachChild(ast, function(node) {
    compileNode(buffer, depth, tc, context, moduleName, context.symbol(), node);
  });
}

function emitPrefix(buffer: string[]) {
  emit(buffer, 0, `#include <string>
#include <iostream>

#include <node.h>

using v8::Array;
using v8::Boolean;
using v8::Context;
using v8::Exception;
using v8::Function;
using v8::FunctionTemplate;
using v8::FunctionCallbackInfo;
using v8::Isolate;
using v8::Local;
using v8::Null;
using v8::Number;
using v8::Object;
using v8::String;
using v8::False;
using v8::True;
using v8::Value;\n`);
}

function emitPostfix(buffer: string[]) {
    emit(buffer, 0, `void Init(Local<Object> exports) {
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

    compileSource(buffer, 1, tc, source);
  });

  emitPostfix(buffer);
  return buffer.join('\n').replace('\n\n}', '\n}');
}
