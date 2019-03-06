export enum Type {
  V8Value,
  V8Function,
  V8Array,
  V8Object,
  V8Boolean,
  V8Number,
  V8String,
  V8Null,
  Boolean,
  Function,
  Number,
  String,
}

export function isV8Type(t: Type) {
  switch (t) {
    case Type.V8Value:
    case Type.V8Function:
    case Type.V8Array:
    case Type.V8Object:
    case Type.V8Boolean:
    case Type.V8Number:
    case Type.V8String:
    case Type.V8Null:
      return true;
    default:
      return false;
  }
}
