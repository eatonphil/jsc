import { Type } from './type';
import { format } from './format';

type Code = string | number | boolean;

export class Local {
  private code: Code;
  public initialized;
  private type: Type;
  public tce?: boolean;

  public constructor(
    code: Code,
    type?: Type,
    initialized?: boolean,
    tce?: boolean,
  ) {
    this.code = code;
    this.initialized = initialized || false;
    this.type = type || Type.V8Value;
    this.tce = tce || false;
  }

  public setCode(c: Code, parenthesize?: boolean) {
    if (parenthesize) {
      c = '(' + c + ')';
    }

    this.code = c;
  }

  public getCode(desiredType?: Type) {
    return format(this.code.toString(), this.type, desiredType);
  }

  public getType() {
    return this.type;
  }

  public setType(t: Type) {
    if (!this.initialized) {
      this.type = t;
    }
  }

  public assign(l: Local) {
    this.code = l.code;
    this.initialized = l.initialized;
    this.type = l.type;
    this.tce = l.tce;
  }
}
