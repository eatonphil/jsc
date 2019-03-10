# Javascript compiler targeting C++/V8

### Building

Requires Node.

```bash
$ yarn
```

### Example

```bash
$ yarn tsc
$ node build/jsc.js tests/tco.js
$ node bin/index.js
12586269025

```

### Features

* Functions and function calls
  * Basic tail-call optimization
* Var, const, let declarations
* For, do, while statements
* Basic primitive operations
* Basic import support
* Number, string, boolean and null literals
* Basic value unboxing

#### Not (yet) supported

* Prototype functions
* Nested functions
* Closures
* And much, much more!

### Code produced

The following:

```js
function fib(n: number, a: number, b: number) {
    if (n == 0) {
        return a;
    }

    if (n == 1) {
        return b;
    }

    return fib(n - 1, b, a + b);
}
```

Gets compiled to:

```cpp
void tco_fib(const FunctionCallbackInfo<Value> &args) {
  Isolate *isolate = args.GetIsolate();
  double tco_n = toNumber(args[0]);
  double tco_a = toNumber(args[1]);
  double tco_b = toNumber(args[2]);

tail_recurse_1:

    ;

  Local<Value> sym_bin_exp_63 = ((tco_n == 0) ? True(isolate) : False(isolate));
  bool sym_if_test_58 = toBoolean(sym_bin_exp_63);
  if (sym_if_test_58) {
    args.GetReturnValue().Set(Number::New(isolate, tco_a));
    return;
  }

  Local<Value> sym_bin_exp_75 = ((tco_n == 1) ? True(isolate) : False(isolate));
  bool sym_if_test_70 = toBoolean(sym_bin_exp_75);
  if (sym_if_test_70) {
    args.GetReturnValue().Set(Number::New(isolate, tco_b));
    return;
  }

  Local<Value> sym_bin_exp_88 = Number::New(isolate, (tco_n - 1));
  Local<Value> sym_arg_83 = sym_bin_exp_88;
  Local<Value> sym_bin_exp_97 = Number::New(isolate, (tco_a + tco_b));
  Local<Value> sym_arg_92 = sym_bin_exp_97;
  tco_n = toNumber(sym_arg_83);
  tco_a = tco_b;
  tco_b = toNumber(sym_arg_92);
  goto tail_recurse_1;
}
```
