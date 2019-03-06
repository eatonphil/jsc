import { isV8Type, Type } from './type';

function v8Function(expression: string, type: Type) {
  if (type === Type.V8Function) {
    return expression;
  }

  if (type === Type.Function) {
    return `FunctionTemplate::New(isolate, ${expression})->GetFunction()`;
  }

  return `Local<Function>::Cast(${expression})`;
}

export function v8String(expression: string, type: Type) {
  if (type === Type.String) {
    return `String::NewFromUtf8(isolate, ${expression})`;
  }

  if (type === Type.V8String) {
    return expression;
  }

  return `toString(${expression})`;
}

function number(expression: string, type: Type) {
  if (type === Type.Number) {
    return expression;
  }

  if (type === Type.V8Number) {
    return `${expression}->Value()`;
  }

  return `toNumber(${expression})`;
}

function v8Number(expression: string, type: Type) {
  if (type === Type.Number) {
    return `Number::New(isolate, ${expression})`;
  }

  if (type === Type.V8Number) {
    return expression;
  }

  return `Number::New(isolate, toNumber(${expression}))`;
}

function v8Boolean(expression: string, type: Type) {
  if (type === Type.Boolean) {
    if (expression === 'false') {
      return 'False(isolate)';
    } else if (expression === 'true') {
      return 'True(isolate)';
    }

    return `(${expression} ? True(isolate) : False(isolate))`;
  }

  if (type === Type.V8Boolean) {
    return expression;
  }

  return `(toBoolean(${expression}) ? True(isolate) : False(isolate))`;
}

function boolean(expression: string, type: Type) {
  if (type === Type.Boolean) {
    return expression;
  }

  if (type === Type.Number) {
    return `!!${expression}`;
  }

  if (type === Type.V8Boolean) {
    return `${expression}->IsTrue()`;
  }

  return `toBoolean(${expression})`;
}

function v8Value(expression: string, type: Type) {
  const converter = {
    [Type.Boolean]: v8Boolean,
    [Type.Number]: v8Number,
    [Type.Function]: v8Function,
    [Type.String]: v8String,
  }[type];
  if (converter) {
    return converter(expression, type);
  }

  return format(expression, type, Type.V8Value);
}

export function format(expression: string, type: Type, desiredType?: Type) {
  if (desiredType === undefined) {
    return expression;
  }

  if (type === desiredType) {
    return expression;
  }

  if (isV8Type(desiredType) && !isV8Type(type)) {
    if (desiredType === Type.V8Function) {
      return v8Function(expression, type);
    } else if (desiredType === Type.V8Number) {
      return v8Number(expression, type);
    } else if (desiredType === Type.V8Boolean) {
      return v8Boolean(expression, type);
    } else if (desiredType === Type.V8String) {
      return v8String(expression, type);
    } else if (desiredType === Type.V8Value) {
      return v8Value(expression, type);
    }
  } else if (!isV8Type(desiredType) && isV8Type(type)) {
    if (desiredType === Type.Boolean) {
      return boolean(expression, type);
    } else if (desiredType === Type.Number) {
      return number(expression, type);
    }
  } else if (isV8Type(type) && isV8Type(desiredType)) {
    // Functions and arrays are already objects.
    if (
      desiredType === Type.V8Object &&
      (type === Type.V8Array || type === Type.V8Function)
    ) {
      return expression;
    }

    if (desiredType === Type.V8Value) {
      return expression;
    }

    const v8Type = {
      [Type.V8String]: 'String',
      [Type.V8Number]: 'Number',
      [Type.V8Boolean]: 'Boolean',
      [Type.V8Array]: 'Array',
      [Type.V8Object]: 'Object',
      [Type.V8Function]: 'Function',
      [Type.V8Value]: 'Value',
      [Type.V8Null]: 'Value',
    }[desiredType];
    return `Local<${v8Type}>::Cast(${expression})`;
  }

  throw new Error(
    `Cannot format ${Type[type]} as ${Type[desiredType]} in ${expression}`,
  );
}
