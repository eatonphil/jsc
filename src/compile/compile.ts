import * as path from 'path';

import * as ts from 'typescript';

import * as builtin from './builtin';
import { Context } from './Context';
import * as emit from './emit';
import * as format from './format';
import * as literal from './literal';
import { Local } from './Local';
import { Locals } from './Locals';
import { Type } from './type';
import { parse } from '../parse';

let labelCounter = 0;

function mangle(moduleName: string, local: string) {
  return moduleName + '_' + local;
}

function identifier(id: ts.Identifier): string {
  return id.escapedText as string;
}

function getType(context: Context, node: ts.Node) {
  const flags = context.tc.getTypeAtLocation(node).getFlags();
  const primitives = {
    [ts.TypeFlags.String]: Type.V8String,
    [ts.TypeFlags.Number]: Type.Number,
    [ts.TypeFlags.Boolean]: Type.Boolean,
  };

  return primitives[flags] || Type.V8Value;
}

function setType(context: Context, node: ts.Node, local: Local) {
  local.setType(getType(context, node));
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
    tmp = context.locals.symbol('arr_lit');
  }

  tmp.setType(Type.V8Array);
  tmp.setCode(`Array::New(isolate, ${elements.length})`);
  const init = context.locals.symbol('init');
  elements.forEach((e, i) => {
    compileNode(context, init, e);
    context.emitStatement(`${tmp}->Set(${i}, ${init.getCode()})`);
  });

  if (tmp !== destination) {
    destination.setType(Type.V8Array);
    builtin.assign(context, destination, tmp);
  }
}

function compileBlock(context: Context, block: ts.Block) {
  block.statements.forEach((statement, i) => {
    compileNode(
      {
        ...context,
        tco: i < block.statements.length - 1 ? {} : context.tco,
      },
      context.locals.symbol('block'),
      statement,
    );
  });
}

function compileParameter(
  context: Context,
  p: ts.ParameterDeclaration,
  n: number,
  last: boolean,
  tailCallArgument?: Local,
) {
  if (
    p.name.kind === ts.SyntaxKind.ObjectBindingPattern ||
    p.name.kind === ts.SyntaxKind.ArrayBindingPattern
  ) {
    throw new Error('Parameter destructuring not supported');
  }

  const id = identifier(p.name);
  const mangled = mangle(context.moduleName, id);
  if (!tailCallArgument) {
    const safe = context.locals.register(mangled);
    setType(context, p.name, safe);
    const argn = context.locals.symbol('arg');
    argn.setCode(`args[${n}]`);
    builtin.assign(context, safe, argn);
  } else {
    const safe = context.locals.get(mangled);
    setType(context, p.name, safe);
    builtin.assign(context, safe, tailCallArgument);
  }
}

function compileFunctionDeclaration(
  context: Context,
  fd: ts.FunctionDeclaration,
) {
  const name = fd.name ? identifier(fd.name) : 'lambda';
  const mangled =
    name === 'main' ? 'jsc_main' : mangle(context.moduleName, name);

  const safe = context.locals.register(mangled, Type.Function);
  const safeName = safe.getCode();
  safe.initialized = true;
  const tcoLabel = `tail_recurse_${labelCounter++}`;

  context.emit(`void ${mangled}(const FunctionCallbackInfo<Value>& args) {`);
  context.emitStatement(
    'Isolate* isolate = args.GetIsolate()',
    context.depth + 1,
  );

  const childContext = {
    ...context,
    depth: context.depth + 1,
    // Body, parameters get new context
    locals: context.locals.clone(),
    // Copying might not allow for mutually tail-recursive functions?
    tco: {
      ...context.tco,
      [safeName]: { label: tcoLabel, parameters: fd.parameters },
    },
  };

  if (fd.parameters) {
    fd.parameters.forEach((p, i) => {
      compileParameter(childContext, p, i, i === fd.parameters.length - 1);
    });
  }

  context.emitLabel(tcoLabel);

  if (fd.body) {
    compileBlock(childContext, fd.body);
  }

  context.emit('}\n');
}

function compileCall(
  context: Context,
  destination: Local,
  ce: ts.CallExpression,
) {
  let tcoLabel;
  let tcoParameters;
  if (ce.expression.kind === ts.SyntaxKind.Identifier) {
    const id = identifier(ce.expression as ts.Identifier);
    const safe = context.locals.get(mangle(context.moduleName, id));

    if (safe && context.tco[safe.getCode()]) {
      const safeName = safe.getCode();
      tcoLabel = context.tco[safeName].label;
      tcoParameters = context.tco[safeName].parameters;
    }
  }

  const args = ce.arguments.map((argument) => {
    const arg = context.locals.symbol('arg');
    const argName = arg.getCode();
    compileNode(context, arg, argument);
    // Force initialization before TCE
    if (tcoLabel && !arg.initialized) {
      const initializer = arg.getCode();
      arg.setCode(argName);
      context.emitAssign(arg, initializer);
    }

    return arg;
  });

  // Handle tail call elimination
  if (ce.expression.kind === ts.SyntaxKind.Identifier) {
    const id = identifier(ce.expression as ts.Identifier);
    const mangled = mangle(context.moduleName, id);
    const safe = context.locals.get(mangled);

    if (safe) {
      if (tcoLabel) {
        args.forEach((arg, i) => {
          compileParameter(
            context,
            tcoParameters[i],
            i,
            i === args.length - 1,
            arg,
          );
        });

        context.emitStatement(`goto ${tcoLabel}`);
        context.emit('', 0);
        destination.tce = true;
        return;
      }
    }
  }

  const argArray = context.locals.symbol('args');
  if (!tcoLabel && args.length) {
    context.emitStatement(
      `Local<Value> ${argArray.getCode()}[] = { ${args
        .map((a) => a.getCode(Type.V8Value))
        .join(', ')} }`,
    );
  }

  const fn = context.locals.symbol('fn');
  compileNode(context, fn, ce.expression);

  const argArrayName = args.length ? argArray.getCode() : 0;
  const v8f = fn.getCode(Type.V8Function);
  const call = `${v8f}->Call(${v8f}, ${args.length}, ${argArrayName})`;
  builtin.assign(context, destination, call);
  context.emit('', 0);
}

// TODO: prototype lookup
function compilePropertyAccess(
  context: Context,
  destination: Local,
  pae: ts.PropertyAccessExpression,
) {
  const exp = context.locals.symbol('parent');
  compileNode(context, exp, pae.expression);
  const id = identifier(pae.name);
  const tmp = context.locals.symbol('prop_access');
  tmp.setCode(
    `${exp.getCode(Type.V8Object)}->Get(${format.v8String(
      literal.string(id),
      Type.String,
    )})`,
  );
  builtin.assign(context, destination, tmp);
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

  const tmp = context.locals.symbol('elem_access');
  tmp.setCode(`${exp.getCode(Type.V8Object)}->Get(${arg.getCode()})`);
  builtin.assign(context, destination, tmp);
}

function compileIdentifier(
  context: Context,
  destination: Local,
  id: ts.Identifier,
) {
  const global = 'isolate->GetCurrentContext()->Global()';
  const tmp = context.locals.symbol('ident');

  let name = identifier(id);
  const mangled = mangle(context.moduleName, name);
  const local = context.locals.get(mangled);

  if (local) {
    builtin.assign(context, destination, local, true);
    return;
  } else if (name === 'global') {
    tmp.setCode(global);
  } else {
    tmp.setCode(
      `${global}->Get(${format.v8String(literal.string(name), Type.String)})`,
    );
  }

  builtin.assign(context, destination, tmp);
}

function compileReturn(context: Context, exp?: ts.Expression) {
  if (!exp) {
    context.emitStatement('return');
    return;
  }

  const tmp = context.locals.symbol('ret');
  compileNode(context, tmp, exp);

  if (!tmp.tce) {
    context.emitStatement(
      `args.GetReturnValue().Set(${tmp.getCode(Type.V8Value)})`,
    );
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

  const test = context.locals.symbol('if_test', Type.Boolean);
  compileNode(context, test, exp);

  context.emit(`if (${test.getCode(Type.Boolean)}) {`);
  const c = { ...context, depth: context.depth + 1 };
  compileNode(c, context.locals.symbol('then'), thenStmt);

  if (elseStmt) {
    context.emit('} else {');
    compileNode(c, context.locals.symbol('else'), elseStmt);
  }

  context.emit('}\n');
}

function compilePostfixUnaryExpression(
  context: Context,
  destination: Local,
  pue: ts.PostfixUnaryExpression,
) {
  const lhs = context.locals.symbol('pue');
  compileNode(context, lhs, pue.operand);
  // In `f++`, previous value of f is returned
  builtin.assign(context, destination, lhs);

  const tmp = context.locals.symbol('pue_tmp');

  switch (pue.operator) {
    case ts.SyntaxKind.PlusPlusToken:
      builtin.plus(context, tmp, lhs, 1);
      break;
    case ts.SyntaxKind.MinusMinusToken:
      builtin.plus(context, tmp, lhs, -1);
      break;
    default:
      throw new Error('Unsupported operator: ' + ts.SyntaxKind[pue.operator]);
      break;
  }

  compileAssign(context, destination, pue.operand, tmp);
}

function compileAssign(
  context: Context,
  destination: Local,
  left: ts.Node,
  rhs: Local,
) {
  let tmp;

  if (left.kind === ts.SyntaxKind.Identifier) {
    const id = identifier(left as ts.Identifier);
    const mangled = mangle(context.moduleName, id);
    tmp = context.locals.get(mangled);
    if (tmp) {
      builtin.assign(context, tmp, rhs);
      builtin.assign(context, destination, tmp);
      return;
    } else {
      // This is an easy case, but punting for now.
      throw new Error('Unsupported global assignment');
    }
  } else if (left.kind === ts.SyntaxKind.ElementAccessExpression) {
    const eae = left as ts.ElementAccessExpression;

    const exp = context.locals.symbol('parent');
    compileNode(context, exp, eae.expression);

    const arg = context.locals.symbol('arg');
    compileNode(context, arg, eae.argumentExpression);

    context.emitStatement(
      `${exp.getCode(Type.V8Object)}->Set(${arg.getCode()}, ${rhs.getCode(
        Type.V8Value,
      )})`,
    );

    return;
  } else if (left.kind === ts.SyntaxKind.PropertyAccessExpression) {
    const pae = left as ts.PropertyAccessExpression;

    const exp = context.locals.symbol('parent');
    compileNode(context, exp, pae.expression);

    const id = identifier(pae.name);

    context.emitStatement(
      `${exp.getCode(Type.V8Object)}->Set(${format.v8String(
        literal.string(id),
        Type.String,
      )}, ${rhs.getCode(Type.V8Value)})`,
    );

    return;
  }

  throw new Error(
    'Unsupported lhs assignment node: ' + ts.SyntaxKind[left.kind],
  );
}

function compileBinaryExpression(
  context: Context,
  destination: Local,
  be: ts.BinaryExpression,
) {
  // Assignment is a special case.
  if (be.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    const rhs = context.locals.symbol('rhs');
    compileNode(context, rhs, be.right);

    compileAssign(context, destination, be.left, rhs);
    return;
  } else if (be.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken) {
    const rhs = context.locals.symbol('rhs');
    compileNode(context, rhs, be.right);

    const lhs = context.locals.symbol('lhs');
    compileNode(context, lhs, be.left);

    const tmp = context.locals.symbol('plus_eq');
    builtin.plus(context, tmp, lhs, rhs);

    compileAssign(context, destination, be.left, tmp);
    return;
  }

  const lhs = context.locals.symbol('lhs');
  compileNode(context, lhs, be.left);

  const rhs = context.locals.symbol('rhs');
  compileNode(context, rhs, be.right);

  const tmp = context.locals.symbol('bin_exp');

  switch (be.operatorToken.kind) {
    case ts.SyntaxKind.LessThanToken:
      builtin.lessThan(context, tmp, lhs, rhs);
      break;
    case ts.SyntaxKind.GreaterThanToken:
      builtin.greaterThan(context, tmp, lhs, rhs);
      break;
    case ts.SyntaxKind.LessThanEqualsToken:
      builtin.lessThanEquals(context, tmp, lhs, rhs);
      break;
    case ts.SyntaxKind.GreaterThanEqualsToken:
      builtin.greaterThanEquals(context, tmp, lhs, rhs);
      break;
    case ts.SyntaxKind.ExclamationEqualsToken:
      builtin.notEquals(context, tmp, lhs, rhs);
      break;
    case ts.SyntaxKind.EqualsEqualsToken:
      builtin.equals(context, tmp, lhs, rhs);
      break;
    case ts.SyntaxKind.ExclamationEqualsEqualsToken:
      builtin.strictNotEquals(context, tmp, lhs, rhs);
      break;
    case ts.SyntaxKind.EqualsEqualsEqualsToken:
      builtin.strictEquals(context, tmp, lhs, rhs);
      break;
    case ts.SyntaxKind.AmpersandAmpersandToken:
      builtin.and(context, tmp, lhs, rhs);
      break;
    case ts.SyntaxKind.PlusToken:
      builtin.plus(context, tmp, lhs, rhs);
      break;
    case ts.SyntaxKind.AsteriskToken:
      builtin.times(context, tmp, lhs, rhs);
      break;
    case ts.SyntaxKind.MinusToken:
      builtin.minus(context, tmp, lhs, rhs);
      break;
    default:
      throw new Error(
        'Unsupported binary operator: ' + ts.SyntaxKind[be.operatorToken.kind],
      );
      break;
  }

  builtin.assign(context, destination, tmp);
}

function compileVariable(
  context: Context,
  destination: Local,
  vd: ts.VariableDeclaration,
  flags: ts.NodeFlags,
) {
  if (
    vd.name.kind === ts.SyntaxKind.ObjectBindingPattern ||
    vd.name.kind === ts.SyntaxKind.ArrayBindingPattern
  ) {
    throw new Error('Variable destructuring not supported');
  }

  const id = identifier(vd.name);
  const safe = context.locals.register(mangle(context.moduleName, id));
  destination = safe;
  const initializer = context.locals.symbol('var_init');

  if (vd.initializer) {
    compileNode(context, initializer, vd.initializer);

    const isConst = (flags & ts.NodeFlags.Const) === ts.NodeFlags.Const;
    const isExplicit = vd.type;
    // Cannot infer on types at declaration without a separate pass.
    if (isConst || isExplicit) {
      //setType(context, vd.type || vd.name, destination);
      destination.setType(initializer.getType());
    }

    builtin.assign(context, destination, initializer);
  }
}

function compileDo(
  context: Context,
  { statement: body, expression: test }: ts.DoStatement,
) {
  context.emit('do {');

  const bodyContext = { ...context, depth: context.depth + 1 };
  compileNode(bodyContext, context.locals.symbol('do'), body);

  const tmp = context.locals.symbol('test', Type.Boolean);
  compileNode(bodyContext, tmp, test);

  context.emitStatement(`} while (${tmp.getCode()})`);
}

function compileWhile(
  context: Context,
  { statement: body, expression: exp }: ts.WhileStatement,
) {
  const test = context.locals.symbol('while_test', Type.Boolean);
  compileNode(context, test, exp);

  context.emit(`while (${test.getCode(Type.Boolean)}) {`);

  const bodyContext = { ...context, depth: context.depth + 1 };
  compileNode(bodyContext, context.locals.symbol('while'), body);

  compileNode(bodyContext, test, exp);

  context.emit('}');
}

function compileFor(
  context: Context,
  { initializer, condition, incrementor, statement: body }: ts.ForStatement,
) {
  const init = context.locals.symbol('init');
  if (initializer) {
    compileNode(context, init, initializer);
  }

  const cond = context.locals.symbol('cond');
  if (condition) {
    compileNode(context, cond, condition);
  }

  const start = `start_for_${labelCounter++}`;
  const end = `end_for_${labelCounter++}`;
  context.emitLabel(start);

  const childContext = { ...context, depth: context.depth + 1 };
  const tmp = context.locals.symbol('body');
  compileNode(childContext, tmp, body);

  if (incrementor) {
    compileNode(childContext, context.locals.symbol('inc'), incrementor);
  }

  if (condition) {
    compileNode(childContext, cond, condition);
    childContext.emit('', 0);
    childContext.emitStatement(
      `if (!${cond.getCode(Type.Boolean)}) goto ${end}`,
    );
  }

  context.emitStatement(`goto ${start}`);

  if (condition) {
    context.emitLabel(end);
  }
}

function compileImport(context: Context, id: ts.ImportDeclaration) {
  // TODO: validate import was exported

  const t =
    id.importClause &&
    id.importClause.namedBindings &&
    id.importClause.namedBindings.kind === ts.SyntaxKind.NamedImports
      ? id.importClause.namedBindings
      : { elements: undefined };
  if (t.elements) {
    const { text } = id.moduleSpecifier as ts.StringLiteral;
    const fileName = path.resolve(context.directory, text);

    const program = parse(fileName);
    const moduleContext = {
      ...context,
      depth: 0,
      locals: new Locals(),
      moduleName: '',
      tco: {},
    };

    compile(program, moduleContext);

    t.elements.forEach((exportObject) => {
      if (exportObject.propertyName) {
        throw new Error(
          "Unsupported import style: import { <> as <> } from '<>';",
        );
      }

      const exportName = identifier(exportObject.name);
      // Put the name the module will reference into context
      const local = context.locals.register(
        mangle(context.moduleName, exportName),
      );
      // Grab the location it will have been registered in the other module
      const real = moduleContext.locals.get(
        mangle(moduleContext.moduleName, exportName),
      );
      // Set the local lookup type & value to the real lookup value & type
      local.setCode(real.getCode());
      local.setType(real.getType());
      local.initialized = true;
    });

    return;
  }

  throw new Error('Unsupported import style');
}

function compileNode(context: Context, destination: Local, node: ts.Node) {
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
      compileNode(
        {
          ...context,
          tco: {},
        },
        destination,
        vs.declarationList,
      );
      break;
    }
    case ts.SyntaxKind.VariableDeclarationList: {
      const dl = node as ts.VariableDeclarationList;
      dl.declarations.forEach((d) => {
        compileVariable(
          {
            ...context,
            tco: {},
          },
          context.locals.symbol('var'),
          d,
          dl.flags,
        );
      });
      break;
    }
    case ts.SyntaxKind.BinaryExpression: {
      const be = node as ts.BinaryExpression;
      compileBinaryExpression(
        {
          ...context,
          tco: {},
        },
        destination,
        be,
      );
      break;
    }
    case ts.SyntaxKind.PostfixUnaryExpression: {
      const pue = node as ts.PostfixUnaryExpression;
      compilePostfixUnaryExpression(
        {
          ...context,
          tco: {},
        },
        destination,
        pue,
      );
      break;
    }
    case ts.SyntaxKind.CallExpression: {
      const ce = node as ts.CallExpression;
      compileCall(context, destination, ce);
      break;
    }
    case ts.SyntaxKind.PropertyAccessExpression: {
      const pae = node as ts.PropertyAccessExpression;
      compilePropertyAccess(
        {
          ...context,
          tco: {},
        },
        destination,
        pae,
      );
      break;
    }
    case ts.SyntaxKind.ElementAccessExpression: {
      const eae = node as ts.ElementAccessExpression;
      compileElementAccess(
        {
          ...context,
          tco: {},
        },
        destination,
        eae,
      );
      break;
    }
    case ts.SyntaxKind.Identifier: {
      const id = node as ts.Identifier;
      compileIdentifier(
        {
          ...context,
          tco: {},
        },
        destination,
        id,
      );
      break;
    }

    case ts.SyntaxKind.StringLiteral: {
      const sl = node as ts.StringLiteral;
      const local = context.locals.symbol('string', Type.String);
      local.setCode(literal.string(sl.text));
      builtin.assign(context, destination, local, true);
      break;
    }
    case ts.SyntaxKind.NullKeyword: {
      const local = context.locals.symbol('null', Type.V8Null);
      local.setCode('Null(isolate)');
      builtin.assign(context, destination, local, true);
      break;
    }
    case ts.SyntaxKind.TrueKeyword: {
      const local = context.locals.symbol('boolean', Type.Boolean);
      local.setCode(true);
      builtin.assign(context, destination, local, true);
      break;
    }
    case ts.SyntaxKind.FalseKeyword: {
      const local = context.locals.symbol('boolean', Type.Boolean);
      local.setCode(false);
      builtin.assign(context, destination, local, true);
      break;
    }
    case ts.SyntaxKind.ArrayLiteralExpression: {
      const ale = node as ts.ArrayLiteralExpression;
      compileArrayLiteral(
        {
          ...context,
          tco: {},
        },
        destination,
        ale,
      );
      break;
    }

    case ts.SyntaxKind.FirstLiteralToken:
    case ts.SyntaxKind.NumericLiteral: {
      const nl = node as ts.NumericLiteral;
      const local = context.locals.symbol('num', Type.Number);
      local.setCode(+nl.text);
      builtin.assign(context, destination, local, true);
      break;
    }

    case ts.SyntaxKind.DoStatement: {
      const ds = node as ts.DoStatement;
      compileDo(
        {
          ...context,
          tco: {},
        },
        ds,
      );
      break;
    }
    case ts.SyntaxKind.WhileStatement: {
      const ws = node as ts.WhileStatement;
      compileWhile(
        {
          ...context,
          tco: {},
        },
        ws,
      );
      break;
    }
    case ts.SyntaxKind.ForStatement: {
      const fs = node as ts.ForStatement;
      compileFor(
        {
          ...context,
          tco: {},
        },
        fs,
      );
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
      compileImport(
        {
          ...context,
          tco: {},
        },
        id,
      );
      break;
    }
    case ts.SyntaxKind.ExportDeclaration: {
      // TODO: add export to exports list;
      break;
    }
    case ts.SyntaxKind.EndOfFileToken:
      break;
    default:
      throw new Error(
        'Unsupported syntax element: ' + ts.SyntaxKind[node.kind],
      );
  }
}

export function compileSource(context: Context, ast: ts.SourceFile) {
  const locals = new Locals();
  ts.forEachChild(ast, (node) => {
    compileNode(context, locals.symbol('source'), node);
  });
}

function emitPrefix(buffer: string[]) {
  emit.emit(buffer, 0, `#include "lib.cc"\n`);
}

function emitPostfix(buffer: string[]) {
  emit.emit(
    buffer,
    0,
    `void Init(Local<Object> exports) {
  NODE_SET_METHOD(exports, "jsc_main", jsc_main);
}

NODE_MODULE(NODE_GYP_MODULE_NAME, Init)\n`,
  );
}

export function compile(program: ts.Program, context?: Context) {
  const isDependency = !!context;
  const buffer = context ? context.buffer : [];
  if (!isDependency) {
    emitPrefix(buffer);
  }

  const tc = program.getTypeChecker();
  program.getSourceFiles().forEach((source) => {
    const { fileName } = source;
    if (fileName.endsWith('.d.ts')) {
      return;
    }

    const directory = path.dirname(fileName);
    // TODO: mangle module name appropriately (e.g. replace('.', '_'), etc.)
    const moduleName = path.basename(fileName, path.extname(fileName));

    // May be wrong to recreate this on every source file? But for now
    // getSourceFile only returns the entrypoint, not imports...
    if (!context) {
      context = {
        buffer,
        depth: 0,
        directory,
        emit(s: string, d?: number) {
          emit.emit(this.buffer, d === undefined ? this.depth : d, s);
        },
        emitAssign(l: Local, s: string | null, d?: number) {
          emit.assign(this.buffer, d === undefined ? this.depth : d, l, s);
        },
        emitStatement(s: string, d?: number) {
          emit.statement(this.buffer, d === undefined ? this.depth : d, s);
        },
        emitLabel(s: string, d?: number) {
          emit.label(this.buffer, d === undefined ? this.depth : d, s);
        },
        locals: new Locals(),
        moduleName,
        tc,
        tco: {},
      };
    }
    compileSource(context, source);
  });

  if (!isDependency) {
    emitPostfix(buffer);
  }

  return buffer.join('\n');
}
