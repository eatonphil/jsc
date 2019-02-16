import * as path from 'path';
import { readFileSync } from 'fs';

import * as ts from 'typescript';

class Local {
  initialized?: boolean;
  name: string;
  type?: string;

  constructor(name: string, initialized?: boolean, type?: string) {
    this.name = name;
    this.initialized = initialized;
    this.type = type;
  }
}

let uniqueCounter = 0;

class Context {
  map: { [local: string]: Local } = {};

  symbol(prefix?: string, initialized?: boolean, type?: string) {
    let mapped;
    do {
      mapped = 'sym_' + (prefix || 'anon') + '_' + (uniqueCounter++);
    } while (this.map[mapped]);

    this.map[mapped] = new Local(mapped, initialized, type);
    return this.map[mapped];
  }

  register(local: string, initialized?: boolean, type?: string) {
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

function emitAssign(buffer: string[], depth: number, destination: Local, val: string) {
  if (!destination.initialized) {
    // TODO: initialize using type info
    emit(buffer, depth, `Local<Value> ${destination.name} = ${val};`);
    destination.initialized = true;
    return;
  }

  emit(buffer, depth, `${destination.name} = ${val}`);
}

function mangle(moduleName: string, local: string) {
  return moduleName + '_' + local;
}

function compileBlock(
  buffer: string[],
  context: Context,
  moduleName: string,
  block: ts.Block,
) {
  block.statements.forEach(function (statement, i) {
    compileNode(buffer, context, moduleName, context.symbol(), statement);
  });
}

function identifier(id: ts.Identifier): string {
  return id.escapedText as string;
}

function compileFunctionDeclaration(
  buffer: string[],
  context: Context,
  moduleName: string,
  id?: ts.Identifier,
  body?: ts.Block,
) {
  const name = id ? identifier(id) : 'lambda';
  const mangled = name === 'main' ? 'jsc_main' : mangle(moduleName, name);

  // Anonymous function declarations don't get added to context.
  if (id) {
    context.register(mangled);
  }

  emit(buffer, 0, `void ${mangled}(const FunctionCallbackInfo<Value>& args) {`);
  emit(buffer, 1, `Isolate* isolate = args.GetIsolate();`);

  // TODO: handle args

  const childContext = context.clone();
  if (body) {
    compileBlock(buffer, childContext, moduleName, body);
  }
  
  emit(buffer, 0, '}');
}

function compileCall(
  buffer: string[],
  context: Context,
  moduleName: string,
  destination: Local,
  ce: ts.CallExpression,
) {
  const fn = context.symbol('fn');
  compileNode(buffer, context, moduleName, fn, ce.expression);

  const args = ce.arguments.map(function (argument) {
    const arg = context.symbol('arg');
    compileNode(buffer, context, moduleName, arg, argument);
    return arg.name;
  });

  const argArray = context.symbol('args');
  emit(buffer, 1, `Local<Value> ${argArray.name}[] = { ${args.join(', ')} };`);

  emitAssign(buffer, 1, destination, `Local<Function>::Cast(${fn.name})->Call(
    ${fn.name},
    ${args.length},
    ${argArray.name})`);
}

function compilePropertyAccess(
  buffer: string[],
  context: Context,
  moduleName: string,
  destination: Local,
  pae: ts.PropertyAccessExpression,
) {
  const exp = context.symbol('parent');
  compileNode(buffer, context, moduleName, exp, pae.expression);
  const id = identifier(pae.name);
  emitAssign(buffer, 1, destination, `${exp.name}.As<Object>()->Get(String::NewFromUtf8(isolate, "${id}");`);
}

function compileIdentifier(
  buffer: string[],
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
    val = 'isolate->GetCurrentContext()->Global()->Get(String::NewFromUtf8(isolate, "${val}"))';
  }

  emitAssign(buffer, 1, destination, val);
}

function compileNode(
  buffer: string[],
  context: Context,
  moduleName: string,
  destination: Local,
  node: ts.Node,
) {
  switch (node.kind) {
    case ts.SyntaxKind.FunctionDeclaration:
      const fd = node as ts.FunctionDeclaration;
      compileFunctionDeclaration(buffer, context, moduleName, fd.name, fd.body);
      break;
    case ts.SyntaxKind.ExpressionStatement:
      const es = node as ts.ExpressionStatement;
      compileNode(buffer, context, moduleName, destination, es.expression);
      break;
    case ts.SyntaxKind.CallExpression:
      const ce = node as ts.CallExpression;
      compileCall(buffer, context, moduleName, destination, ce);
      break;
    case ts.SyntaxKind.PropertyAccessExpression:
      const pae = node as ts.PropertyAccessExpression;
      compilePropertyAccess(buffer, context, moduleName, destination, pae);
      break;
    case ts.SyntaxKind.Identifier:
      const id = node as ts.Identifier;
      compileIdentifier(buffer, context, moduleName, destination, id);
      break;
    case ts.SyntaxKind.StringLiteral:
      const sl = node as ts.StringLiteral;
      emitAssign(buffer, 1, destination, `String::NewFromUtf8(isolate, "${sl.text}")`);
      break;
    case ts.SyntaxKind.EndOfFileToken:
      break;
    default:
      console.log('Unsupported syntax element: ', ts.SyntaxKind[node.kind]);
  }
}

export function compileSource(
  buffer: string[],
  ast: ts.SourceFile,
) {
  const context = new Context;
  // TODO: mangle module name appropriately (e.g. replace('.', '_'), etc.)
  const moduleName = path.basename(ast.fileName, path.extname(ast.fileName));
  ts.forEachChild(ast, function(node) {
    compileNode(buffer, context, moduleName, context.symbol(), node);
  });
}

function emitPrefix(buffer: string[]) {
  emit(buffer, 0, `
#include <string>
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
    emit(buffer, 0, `
void Init(Local<Object> exports) {
  NODE_SET_METHOD(exports, "jsc_main", jsc_main);
}

NODE_MODULE(NODE_GYP_MODULE_NAME, Init)`);
}

export function compile(ast: ts.SourceFile) {
  const buffer = [];
  emitPrefix(buffer);
  compileSource(buffer, ast);
  emitPostfix(buffer);
  return buffer.join('\n');
}
