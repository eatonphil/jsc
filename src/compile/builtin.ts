import { Context } from './Context';
import { Local } from './Local';
import { Type, isV8Type } from './type';

export function assign(
  context: Context,
  destination: Local,
  value: Local | string,
  allowSkip?: boolean,
) {
  let val: Local;
  if (typeof value === 'string') {
    const tmp = context.locals.symbol('assign_tmp');
    tmp.setCode(value);
    val = tmp;
  } else {
    val = value;
  }

  if (destination.initialized || !allowSkip) {
    context.emitAssign(destination, val);
  } else {
    destination.assign(val);
  }
}

export function plus(
  context: Context,
  destination: Local,
  l: Local | number,
  r: Local | number,
) {
  const tmp = context.locals.symbol('plus_tmp');

  if (typeof l === 'number' && typeof r === 'number') {
    // This would allow constant folding once, since we name it Type.Number
    // and give no notice it is still a constant.
    tmp.setType(Type.Number);
    tmp.setCode(l + r);
  } else if (typeof l === 'number' || typeof r === 'number') {
    const ltmp = context.locals.symbol('plus_ltmp', Type.Number);
    if (typeof l === 'number') {
      ltmp.setCode(l);
      plus(context, destination, ltmp, r);
    } else if (typeof r === 'number') {
      ltmp.setCode(r);
      plus(context, destination, l, ltmp);
    }

    return;
  } else if (l.getType() === Type.Number && r.getType() === Type.Number) {
    tmp.setType(Type.Number);
    tmp.setCode(`${l.getCode()} + ${r.getCode()}`, true);
  } else if (l.getType() === Type.V8String || r.getType() === Type.V8String) {
    // If either is a string, it must be a string.
    tmp.setType(Type.V8String);
    tmp.setCode(
      `stringPlus(isolate, ${l.getCode(Type.V8Value)}, ${r.getCode(
        Type.V8Value,
      )})`,
    );
  } else if (l.getType() === Type.V8Number && r.getType() === Type.V8Number) {
    tmp.setType(Type.Number);
    tmp.setCode(`${l.getCode(Type.Number)} + ${r.getCode(Type.Number)}`, true);
  } else {
    tmp.setType(Type.V8Value);
    tmp.setCode(
      `genericPlus(isolate, ${l.getCode(Type.V8Value)}, ${r.getCode(
        Type.V8Value,
      )})`,
    );
  }

  assign(context, destination, tmp, true);
}

export function times(
  context: Context,
  destination: Local,
  l: Local,
  r: Local,
) {
  const tmp = context.locals.symbol('times_tmp', Type.Number);

  if (l.getType() === Type.Number && r.getType() === Type.Number) {
    tmp.setCode(`${l.getCode()} * ${r.getCode()}`, true);
  } else if (l.getType() === Type.V8Number && r.getType() === Type.V8Number) {
    tmp.setCode(`${l.getCode(Type.Number)} * ${r.getCode(Type.Number)}`, true);
  } else {
    tmp.setType(Type.V8Number);
    tmp.setCode(
      `genericTimes(isolate, ${l.getCode(Type.V8Value)}, ${r.getCode(
        Type.V8Value,
      )})`,
    );
  }

  assign(context, destination, tmp, true);
}

export function minus(
  context: Context,
  destination: Local,
  l: Local | number,
  r: Local | number,
) {
  const tmp = context.locals.symbol('minus_tmp', Type.Number);

  if (typeof l === 'number' && typeof r === 'number') {
    // This would allow constant folding once, since we name it Type.Number
    // and give no notice it is still a constant.
    tmp.setType(Type.Number);
    tmp.setCode(l - r);
  } else if (typeof l === 'number' || typeof r === 'number') {
    const ltmp = context.locals.symbol('minus_ltmp', Type.Number);
    if (typeof l === 'number') {
      ltmp.setCode(l);
      minus(context, destination, ltmp, r);
    } else if (typeof r === 'number') {
      ltmp.setCode(r);
      minus(context, destination, l, ltmp);
    }

    return;
  } else if (l.getType() === Type.Number && r.getType() === Type.Number) {
    tmp.setType(Type.Number);
    tmp.setCode(`${l.getCode()} - ${r.getCode()}`, true);
  } else if (l.getType() === Type.V8Number && r.getType() === Type.V8Number) {
    tmp.setType(Type.Number);
    tmp.setCode(`${l.getCode(Type.Number)} - ${r.getCode(Type.Number)}`, true);
  } else {
    tmp.setType(Type.V8Value);
    tmp.setCode(
      `genericMinus(isolate, ${l.getCode(Type.V8Value)}, ${r.getCode(
        Type.V8Value,
      )})`,
    );
  }

  assign(context, destination, tmp, true);
}

export function and(context: Context, destination: Local, l: Local, r: Local) {
  const tmp = context.locals.symbol('and_tmp', Type.Number);

  if (l.getType() === Type.Number && r.getType() === Type.Number) {
    tmp.setType(Type.Number);
    tmp.setCode(`${l.getCode()} ? ${r.getCode()} : ${l.getCode()}`, true);
  } else if (l.getType() === Type.Boolean && r.getType() === Type.Boolean) {
    tmp.setType(Type.Boolean);
    tmp.setCode(`${l.getCode()} ? ${r.getCode()} : ${l.getCode()}`, true);
  } else if (l.getType() === Type.V8Boolean && r.getType() === Type.V8Boolean) {
    tmp.setType(Type.V8Boolean);
    tmp.setCode(
      `${l.getCode(Type.Boolean)} ? (${r.getCode(
        Type.Boolean,
      )} ? ${r.getCode()} : ${l.getCode()}) : ${l.getCode()}`,
      true,
    );
  } else {
    tmp.setCode(
      `${l.getCode(Type.Boolean)} ? (${r.getCode(
        Type.Boolean,
      )} ? ${r.getCode()} : ${l.getCode()}) : ${l.getCode()}`,
      true,
    );
  }

  assign(context, destination, tmp, true);
}

export function strictEquals(
  context: Context,
  destination: Local,
  l: Local,
  r: Local,
) {
  const tmp = context.locals.symbol('seq_tmp', Type.Boolean);

  if (
    !isV8Type(l.getType()) &&
    !isV8Type(r.getType()) &&
    l.getType() !== r.getType()
  ) {
    tmp.setCode(false);
  } else if (l.getType() === Type.Number && r.getType() === Type.Number) {
    tmp.setCode(`${l.getCode()} == ${r.getCode()}`, true);
  } else if (l.getType() === Type.Boolean && r.getType() === Type.Boolean) {
    tmp.setCode(`${l.getCode()} == ${r.getCode()}`, true);
  } else if (l.getType() === Type.V8Number && r.getType() === Type.V8Number) {
    tmp.setCode(`${l.getCode(Type.Number)} == ${r.getCode(Type.Number)}`, true);
  } else {
    tmp.setCode(
      `${l.getCode(Type.V8Value)}->StrictEquals(${r.getCode(Type.V8Value)})`,
    );
  }

  assign(context, destination, tmp, true);
}

export function strictNotEquals(
  context: Context,
  destination: Local,
  l: Local,
  r: Local,
) {
  const tmp = context.locals.symbol('sneq_tmp', Type.Boolean);

  if (
    !isV8Type(l.getType()) &&
    !isV8Type(r.getType()) &&
    l.getType() !== r.getType()
  ) {
    tmp.setCode(true);
  } else if (l.getType() === Type.Number && r.getType() === Type.Number) {
    tmp.setCode(`${l.getCode()} != ${r.getCode()}`, true);
  } else if (l.getType() === Type.Boolean && r.getType() === Type.Boolean) {
    tmp.setCode(`${l.getCode()} != ${r.getCode()}`, true);
  } else if (l.getType() === Type.V8Number && r.getType() === Type.V8Number) {
    tmp.setCode(`${l.getCode(Type.Number)} != ${r.getCode(Type.Number)}`, true);
  } else {
    tmp.setCode(
      `!${l.getCode(Type.V8Value)}->StrictEquals(${r.getCode(Type.V8Value)})`,
    );
  }

  assign(context, destination, tmp, true);
}

export function equals(
  context: Context,
  destination: Local,
  l: Local,
  r: Local,
) {
  const tmp = context.locals.symbol('eq_tmp', Type.Boolean);

  if (l.getType() === Type.Number && r.getType() === Type.Number) {
    tmp.setCode(`${l.getCode()} == ${r.getCode()}`, true);
  } else if (l.getType() === Type.Boolean && r.getType() === Type.Boolean) {
    tmp.setCode(`${l.getCode()} == ${r.getCode()}`, true);
  } else if (l.getType() === Type.V8Number && r.getType() === Type.V8Number) {
    tmp.setCode(`${l.getCode(Type.Number)} == ${r.getCode(Type.Number)}`, true);
  } else {
    tmp.setCode(
      `${l.getCode(Type.V8Value)}->Equals(${r.getCode(Type.V8Value)})`,
    );
  }

  assign(context, destination, tmp, true);
}

export function notEquals(
  context: Context,
  destination: Local,
  l: Local,
  r: Local,
) {
  const tmp = context.locals.symbol('neq_tmp', Type.Boolean);

  if (l.getType() === Type.Number && r.getType() === Type.Number) {
    tmp.setCode(`${l.getCode()} != ${r.getCode()}`, true);
  } else if (l.getType() === Type.Boolean && r.getType() === Type.Boolean) {
    tmp.setCode(`${l.getCode()} != ${r.getCode()}`, true);
  } else if (l.getType() === Type.V8Number && r.getType() === Type.V8Number) {
    tmp.setCode(`${l.getCode(Type.Number)} != ${r.getCode(Type.Number)}`, true);
  } else {
    tmp.setCode(
      `!${l.getCode(Type.V8Value)}->Equals(${r.getCode(Type.V8Value)})`,
    );
  }

  assign(context, destination, tmp, true);
}

export function greaterThan(
  context: Context,
  destination: Local,
  l: Local,
  r: Local,
) {
  const tmp = context.locals.symbol('gt_tmp', Type.Boolean);

  if (l.getType() === Type.Number && r.getType() === Type.Number) {
    tmp.setCode(`${l.getCode()} > ${r.getCode()}`, true);
  } else {
    tmp.setCode(`${l.getCode(Type.Number)} > ${r.getCode(Type.Number)}`, true);
  }

  assign(context, destination, tmp, true);
}

export function greaterThanEquals(
  context: Context,
  destination: Local,
  l: Local,
  r: Local,
) {
  const tmp = context.locals.symbol('gte_tmp', Type.Boolean);

  if (l.getType() === Type.Number && r.getType() === Type.Number) {
    tmp.setCode(`${l.getCode()} >= ${r.getCode()}`, true);
  } else {
    tmp.setCode(`${l.getCode(Type.Number)} >= ${r.getCode(Type.Number)}`, true);
  }

  assign(context, destination, tmp);
}

export function lessThan(
  context: Context,
  destination: Local,
  l: Local,
  r: Local,
) {
  const tmp = context.locals.symbol('lt_tmp', Type.Boolean);

  if (l.getType() === Type.Number && r.getType() === Type.Number) {
    tmp.setCode(`${l.getCode()} < ${r.getCode()}`, true);
  } else {
    tmp.setCode(`${l.getCode(Type.Number)} < ${r.getCode(Type.Number)}`, true);
  }

  assign(context, destination, tmp);
}

export function lessThanEquals(
  context: Context,
  destination: Local,
  l: Local,
  r: Local,
) {
  const tmp = context.locals.symbol('lte_tmp', Type.Boolean);

  if (l.getType() === Type.Number && r.getType() === Type.Number) {
    tmp.setCode(`${l.getCode()} <= ${r.getCode()}`, true);
  } else {
    tmp.setCode(`${l.getCode(Type.Number)} <= ${r.getCode(Type.Number)}`, true);
  }

  assign(context, destination, tmp);
}
