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

#### Not (yet) supported

* Prototype functions
* Nested functions
* Closures
* And much, much more!

### Code produced

The following:

```js
function fib(n, a, b) {
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
  Local<Value> tco_n = args[0];
  Local<Value> tco_a = args[1];
  Local<Value> tco_b = args[2];
tail_recurse_0:

  if (tco_n->StrictEquals(Number::New(isolate, 0))) {
    args.GetReturnValue().Set(tco_a);
    return;
  }

  if (tco_n->StrictEquals(Number::New(isolate, 1))) {
    args.GetReturnValue().Set(tco_b);
    return;
  }

  Local<Number> sym_arg_17 =
      genericMinus(isolate, tco_n, Number::New(isolate, 1));
  Local<Value> sym_arg_20 = tco_b;
  Local<Value> sym_arg_21 = genericPlus(isolate, tco_a, tco_b);
  tco_n = sym_arg_17;
  tco_a = sym_arg_20;
  tco_b = sym_arg_21;
  goto tail_recurse_0;

  return;
}

void jsc_main(const FunctionCallbackInfo<Value> &args) {
  Isolate *isolate = args.GetIsolate();
tail_recurse_1:

  Local<Value> sym_args_32[] = {Number::New(isolate, 50),
                                Number::New(isolate, 0),
                                Number::New(isolate, 1)};
  Local<Function> sym_fn_33 =
      FunctionTemplate::New(isolate, tco_fib)->GetFunction();
  sym_fn_33->SetName(String::NewFromUtf8(isolate, "tco_fib"));
  Local<Value> sym_arg_28 = sym_fn_33->Call(sym_fn_33, 3, sym_args_32);

  Local<Value> sym_args_34[] = {sym_arg_28};
  Local<Value> sym_parent_37 = isolate->GetCurrentContext()->Global()->Get(
      String::NewFromUtf8(isolate, "console"));
  Local<Value> sym_cast_36 =
      sym_parent_37.As<Object>()->Get(String::NewFromUtf8(isolate, "log"));
  Local<Function> sym_fn_35 = Local<Function>::Cast(sym_cast_36);
  Local<Value> sym_block_27 = sym_fn_35->Call(sym_fn_35, 1, sym_args_34);

  return;
}

void Init(Local<Object> exports) {
  NODE_SET_METHOD(exports, "jsc_main", jsc_main);
}

NODE_MODULE(NODE_GYP_MODULE_NAME, Init)
```
