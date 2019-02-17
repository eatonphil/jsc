import { Type } from './type';

export class Local {
  initialized?: boolean;
  name: string;
  type: Type;

  constructor(name: string, initialized?: boolean, type?: Type) {
    this.name = name;
    this.initialized = initialized;
    this.type = type || Type.V8Value;
  }
}

let uniqueCounter = 0;

export class Locals {
  map: { [local: string]: Local } = {};

  symbol(prefix?: string, initialized?: boolean, type?: Type) {
    let mapped;
    do {
      mapped = 'sym_' + (prefix || 'anon') + '_' + (uniqueCounter++);
    } while (this.map[mapped]);

    this.map[mapped] = new Local(mapped, initialized, type);
    return this.map[mapped];
  }

  register(local: string, initialized?: boolean, type?: Type) {
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
    const c = new Locals;
    c.map = { ...this.map };
    return c;
  }
}
