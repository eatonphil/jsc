import { Local } from './Local';
import { Type } from './type';

export function emit(buffer: string[], indentation: number, output: string) {
  buffer.push(new Array(indentation + 1).join('  ') + output);
}

export function label(buffer: string[], depth: number, label: string) {
  emit(buffer, depth, `\n${label}:\n\n  ;`);
}

export function statement(buffer: string[], depth: number, output: string) {
  emit(buffer, depth, output + ';');
}

export function assign(
  buffer: string[],
  depth: number,
  destination: Local,
  val: Local | string | null,
) {
  if (!destination.initialized) {
    const type = {
      [Type.V8Function]: 'Local<Function>',
      [Type.V8Array]: 'Local<Array>',
      [Type.V8Object]: 'Local<Object>',
      [Type.V8String]: 'Local<String>',
      [Type.V8Number]: 'Local<Number>',
      [Type.V8Boolean]: 'Local<Boolean>',
      [Type.V8Value]: 'Local<Value>',
      [Type.V8Null]: 'Local<Value>',
      [Type.Boolean]: 'bool',
      [Type.Number]: 'double',
      [Type.String]: (n: string) => `char ${n}[]`,
      [Type.Function]: (n: string) =>
        `void (*${n})(const FunctionCallbackInfo<Value> &args)`,
    }[destination.getType()];

    if (!type) {
      throw new Error(
        'Unsupported assign type: ' + Type[destination.getType()],
      );
    }

    const prefix =
      typeof type === 'string'
        ? `${type} ${destination.getCode()}`
        : type(destination.getCode());
    let suffix = val;
    if (typeof val === 'string') {
      suffix = ' = ' + val;
    } else {
      suffix = ' = ' + val.getCode(destination.getType());
    }

    statement(buffer, depth, `${prefix}${suffix}`);
    destination.initialized = true;

    return;
  }

  let suffix;
  if (val === null) {
    throw new Error('Cannot assign null literal.');
  } else if (typeof val === 'string') {
    suffix = val;
  } else {
    suffix = val.getCode(destination.getType());
  }

  statement(buffer, depth, `${destination.getCode()} = ${suffix}`);
}
