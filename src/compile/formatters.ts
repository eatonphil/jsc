import { Local } from './locals';
import { isV8Type, Type } from './type';

export function v8Function(local: Local | string) {
  if (typeof local === 'string') {
    return `Local<Function>::Cast(${local})`;
  }

  if (local.type === Type.V8Function) {
    return local.name;
  }

  if (local.type === Type.Function) {
    return `FunctionTemplate::New(isolate, ${local.name})->GetFunction()`;
  }

  return `Local<Function>::Cast(${local.name})`;
}

export function v8String(local: Local | string) {
  if (typeof local === 'string') {
    const safe = local.replace('\n', '\\\n');
    return `String::NewFromUtf8(isolate, "${safe}")`;
  }

  if (local.type === Type.V8String) {
    return local.name;
  }

  return `toString(${local.name})`;
}

export function number(local: Local) {
  if (local.type === Type.V8Number) {
    return `${local.name}->Value()`;
  }

  return `toNumber(${local.name})`;
}

export function v8Number(local: Local | string) {
  if (typeof local === 'string') {
    return `Number::New(isolate, ${local})`;
  }

  if (local.type === Type.V8Number) {
    return local.name;
  }

  return `Number::New(isolate, toNumber(${local.name}))`;
}

export function v8Boolean(local: Local | string | boolean) {
  if (typeof local === 'string') {
    return `${local} ? True(isolate) : False(isolate)`;
  }

  if (typeof local === 'boolean') {
    return local ? 'True(isolate)' : 'False(isolate)';
  }

  if (local.type === Type.V8Boolean) {
    return local.name;
  }

  return `toBoolean(${local.name}) ? True(isolate) : False(isolate)`;
}

export function boolean(local: Local) {
  if (local.type === Type.Boolean) {
    return local.name;
  }

  if (local.type === Type.V8Boolean) {
    return `${local.name}->IsTrue()`;
  }

  return `toBoolean(${local.name})`;
}

export function cast(
  targetLocal: Local,
  castingLocal: Local,
  force?: boolean,
) {
  const tlType = targetLocal.type;
  if (!targetLocal.initialized && !force) {
    targetLocal.type = castingLocal.type;
  }

  if (isV8Type(tlType) && !isV8Type(castingLocal.type)) {
    if (castingLocal.type === Type.Function) {
      return cast(
        targetLocal,
        {
          ...castingLocal,
          name: v8Function(castingLocal),
          type: Type.V8Function,
        },
        force,
      );
    }

    throw new Error(
      `Unsupported cast of non-V8 rhs (${Type[castingLocal.type]}) to V8 lhs (${Type[tlType]})`,
    );
  } else if (!isV8Type(tlType) && isV8Type(castingLocal.type)) {
    if (tlType === Type.Boolean) {
      return cast(
        targetLocal,
        {
          ...castingLocal,
          name: boolean(castingLocal),
          type: Type.Boolean,
        },
        force,
      );
    }

    throw new Error(
      `Unsupported cast of V8 rhs (${Type[castingLocal.type]}) to non-V8 lhs (${Type[tlType]})`,
    );
  } else if (isV8Type(tlType) && isV8Type(castingLocal.type)) {
    if (tlType !== castingLocal.type && (targetLocal.initialized || force)) {
      const type =
        tlType === Type.V8String
          ? 'String'
          : tlType === Type.V8Number
          ? 'Number'
          : tlType === Type.V8Boolean
          ? 'Boolean'
          : tlType === Type.V8Array
          ? 'Array'
          : tlType === Type.V8Object
          ? 'Object'
          : tlType === Type.V8Function
          ? 'Function'
          : 'Value';
      return `Local<${type}>::Cast(${castingLocal.name})`;
    }

    return castingLocal.name;
  } else {
    if (castingLocal.type === tlType) {
      return castingLocal.name;
    }
    throw new Error('Cannot cast between C++ types.');
  }
}

export function plus(l: Local, r: Local) {
  if (l.type === Type.V8String || r.type === Type.V8String) {
    // If either is a string, it must be a string.
    return `stringPlus(isolate, ${l.name}, ${r.name})`;
  } else if (l.type === Type.V8Number) {
    return `numberPlus(isolate, ${l.name}, ${r.name})`;
  }

  return `genericPlus(isolate, ${l.name}, ${r.name})`;
}
