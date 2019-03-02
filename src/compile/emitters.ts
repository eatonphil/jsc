import { Local } from './locals';
import { Type } from './type';

export function emit(
  buffer: string[],
  indentation: number,
  output: string,
) {
  buffer.push(new Array(indentation + 1).join('  ') + output);
}

export function statement(
  buffer: string[],
  indentation: number,
  output: string,
) {
  emit(buffer, indentation, output + ';');
}

export function assign(buffer: string[], depth: number, destination: Local, val: string) {
  if (!destination.initialized) {
    const type = destination.type === Type.V8Function ? 'Local<Function>' :
     destination.type === Type.V8Array ? 'Local<Array>' :
     destination.type === Type.V8Object ? 'Local<Object>' :
     destination.type === Type.V8String ? 'Local<String>' :
     destination.type === Type.V8Number ? 'Local<Number>' :
     destination.type === Type.V8Boolean ? 'Local<Boolean>' :
     'Local<Value>';
    statement(buffer, depth, `${type} ${destination.name} = ${val}`);
    destination.initialized = true;
    return;
  }

  statement(buffer, depth, `${destination.name} = ${val}`);
}

export function assignLiteral(buffer: string[], depth: number, destination: Local, val: string) {
  if (!destination.initialized) {
    destination.name = val;
    destination.initialized = true;
    return;
  }

  assign(buffer, depth, destination, val);
}
