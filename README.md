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
* Basic unboxing

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

function main() {
  console.log(fib(50, 0, 1));
}
```

Gets compiled to:

```cpp
#include "lib.cc"

void tco_fib(const FunctionCallbackInfo<Value> &args) {
  Isolate *isolate = args.GetIsolate();
  double tco_n = toNumber(args[0]);
  double tco_a = toNumber(args[1]);
  double tco_b = toNumber(args[2]);
tail_recurse_0:

  if (tco_n == 0) {
    args.GetReturnValue().Set(tco_a);
    return;
  }

  if (tco_n == 1) {
    args.GetReturnValue().Set(tco_b);
    return;
  }

  double sym_arg_30 = tco_n - 1;
  double sym_arg_39 = tco_a + tco_b;
  tco_n = sym_arg_30;
  tco_a = tco_b;
  tco_b = sym_arg_39;
  goto tail_recurse_0;

  return;
}

void jsc_main(const FunctionCallbackInfo<Value> &args) {
  Isolate *isolate = args.GetIsolate();
tail_recurse_1:

  Local<Value> sym_args_55[] = {Number::New(isolate, 100),
                                Number::New(isolate, 0),
                                Number::New(isolate, 1)};
  Local<Value> sym_arg_48 =
      FunctionTemplate::New(isolate, tco_fib)
          ->GetFunction()
          ->Call(FunctionTemplate::New(isolate, tco_fib)->GetFunction(), 3,
                 sym_args_55);

  Local<Value> sym_args_59[] = {sym_arg_48};
  Local<Value> sym_parent_61 = isolate->GetCurrentContext()->Global()->Get(
      String::NewFromUtf8(isolate, "console"));
  Local<Value> sym_fn_60 = Local<Object>::Cast(sym_parent_61)
                               ->Get(String::NewFromUtf8(isolate, "log"));
  Local<Value> sym_block_47 = Local<Function>::Cast(sym_fn_60)->Call(
      Local<Function>::Cast(sym_fn_60), 1, sym_args_59);

  return;
}

void Init(Local<Object> exports) {
  NODE_SET_METHOD(exports, "jsc_main", jsc_main);
}

NODE_MODULE(NODE_GYP_MODULE_NAME, Init)
```
