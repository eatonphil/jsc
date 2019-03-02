import { Type } from './type';

export class Local {
  public initialized?: boolean;
  public name: string;
  public type: Type;
  public tce?: boolean;

  constructor(name: string, initialized?: boolean, type?: Type, tce?: boolean) {
    this.name = name;
    this.initialized = initialized;
    this.type = type || Type.V8Value;
    this.tce = tce || false
  }
}

let uniqueCounter = 0;

// tslint:disable-next-line
export class Locals {
  public map: { [local: string]: Local } = {};

  public symbol(prefix?: string, initialized?: boolean, type?: Type) {
    let mapped;
    do {
      mapped = 'sym_' + (prefix || 'anon') + '_' + (uniqueCounter++);
    } while (this.map[mapped]);

    this.map[mapped] = new Local(mapped, initialized, type);
    return this.map[mapped];
  }

  public register(local: string, initialized?: boolean, type?: Type) {
    let mapped = local;
    while (this.map[mapped]) {
      mapped = local + '_' + Object.keys(this.map).length;
    }
    this.map[local] = new Local(mapped, initialized, type);
    return this.map[local];
  }

  public get(local: string) {
    return this.map[local];
  }

  public clone() {
    const c = new Locals;
    c.map = { ...this.map };
    return c;
  }
}
