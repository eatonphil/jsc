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
    const type = destination.type === Type.V8Value ? 'Local<Value>' : 'Local<Function>';
    statement(buffer, depth, `${type} ${destination.name} = ${val}`);
    destination.initialized = true;
    return;
  }

  statement(buffer, depth, `${destination.name} = ${val}`);
}
