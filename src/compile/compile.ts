import * as path from 'path';
import { readFileSync } from 'fs';

import * as ts from 'typescript';

import * as emit from './emitters';
import * as format from './formatters';
import { Local, Locals } from './locals';
import { Type } from './type';

let tailRecurseCounter = 0;

interface Context {
  buffer: string[];
  depth: number;
  emit: (s: string, d?: number) => void;
  emitAssign: (l: Local, s: string, d?: number) => void;
  emitStatement: (s: string, d?: number) => void;
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

function compileBlock(
  context: Context,
  block: ts.Block,
) {
  block.statements.forEach(function (statement, i) {
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

  const safe = context.locals.register(name);
  const tcoLabel = `tail_recurse_${tailRecurseCounter++}`;

  context.emit(`void ${mangled}(const FunctionCallbackInfo<Value>& _args) {`);
  context.emitStatement('Isolate* isolate = _args.GetIsolate()', context.depth + 1);
  context.emitStatement('std::vector<Local<Value>> args(_args.Length());', context.depth + 1);
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
    fd.parameters.forEach(function (p, i) {
      compileParameter(childContext, p, i, i === fd.parameters.length - 1);
    });
  }

  if (fd.body) {
    compileBlock(childContext, fd.body);
  }

  context.emit('}\n', 0);
}

function compileCall(
  context: Context,
  destination: Local,
  ce: ts.CallExpression,
) {
  let tcoLabel;
  if (ce.expression.kind === ts.SyntaxKind.Identifier) {
    const id = identifier(ce.expression as ts.Identifier);
    const safe = context.locals.get(id);

    if (safe) {
      tcoLabel = context.tco[safe.name];
    }
  }

  const args = ce.arguments.map(function (argument) {
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
    const safe = context.locals.get(id);

    if (safe) {
      if (tcoLabel) {
	args.forEach(function (arg, i) {
	  context.emitStatement(`args[${i}] = ${arg}`);
	});

	context.emitStatement(`goto ${tcoLabel}`);
	context.emit('', 0);
	return;
      }

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
  const local = context.locals.get(mangled);
  if (local) {
    if (!local.initialized) {
      destination.name = mangled;
    } else {
      destination.name = local.name;
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

  const tmp = context.locals.symbol();
  compileNode(context, tmp, exp);

  const args = context.locals.symbol();
  context.emitStatement(`Local<Value> ${args.name}[] = { ${tmp.name} }`);

  // TODO: Can skip the ->BooleanValue() call if we see tmp is a Boolean type.
  const tmp2 = context.locals.symbol();
  context.emitStatement(`Maybe<bool> ${tmp2.name} = ${tmp.name}->BooleanValue(isolate->GetCurrentContext())`);

  context.emit(`if (${tmp2.name}.IsJust() && ${tmp2.name}.FromJust()) {`);
  const c = { ...context, depth: context.depth + 1 };
  compileNode(c, context.locals.symbol(), thenStmt);

  if (elseStmt) {
    context.emit('} else {');
    compileNode(c, context.locals.symbol(), elseStmt);
  }

  context.emit('}\n');
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
    case ts.SyntaxKind.MinusToken:
      value = `genericMinus(isolate, ${lhs.name}, ${rhs.name})`;
      break;
    default:
      throw new Error('Unsupported expression: ' + ts.SyntaxKind[be.operatorToken.kind]);
      break;
  }

  // TODO: add support for more operators

  if (bool) {
    context.emitAssign(destination, `${bool} ? True(isolate) : False(isolate)`);
  } else if (value) {
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
      vs.declarationList.declarations.forEach(function (d) {
	compileVariable(context, context.locals.symbol(), d);
      });
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
    case ts.SyntaxKind.NullKeyword:
      context.emitAssign(destination, "Null(isolate)");
      break;
    case ts.SyntaxKind.TrueKeyword:
      context.emitAssign(destination, "True(isolate)");
      break;
    case ts.SyntaxKind.FalseKeyword:
      context.emitAssign(destination, "False(isolate)");
      break;

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
      emit(s: string, d?: number) {
	emit.emit(this.buffer, d === undefined ? this.depth : d, s);
      },
      emitAssign(l: Local, s: string, d?:number) {
	emit.assign(this.buffer, d === undefined ? this.depth : d, l, s);
      },
      emitStatement(s: string, d?:number) {
	emit.statement(this.buffer, d === undefined ? this.depth : d, s);
      },
      locals: new Locals,
      moduleName: '',
      tc,
      tco: {},
    };
    compileSource(context, source);
  });

  emitPostfix(buffer);
  return buffer.join('\n') // Format nicely
	       .replace(/\n\n+/g, '\n\n') // No more than two consecutive newlines
	       .replace(/\n\n+}/g, '\n}'); // Now more than one newline before an ending brace
}
