import { Local } from './Local';
import { Type } from './type';

let uniqueCounter = 0;

// tslint:disable-next-line
export class Locals {
  public map: { [local: string]: Local } = {};

  public symbol(prefix?: string, type?: Type) {
    let mapped;
    do {
      mapped = 'sym_' + (prefix || 'anon') + '_' + uniqueCounter++;
    } while (this.map[mapped]);

    this.map[mapped] = new Local(mapped, type);
    return this.map[mapped];
  }

  public register(local: string, type?: Type) {
    let mapped = local;
    while (this.map[mapped]) {
      mapped = local + '_' + Object.keys(this.map).length;
    }
    this.map[local] = new Local(mapped, type);
    return this.map[local];
  }

  public get(local: string) {
    return this.map[local];
  }

  public clone() {
    const c = new Locals();
    c.map = { ...this.map };
    return c;
  }
}
