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

void tco_fib(const FunctionCallbackInfo<Value>& _args) {
  Isolate* isolate = _args.GetIsolate();
  std::vector<Local<Value>> args(_args.Length());;
  for (int i = 0; i < _args.Length(); i++) args[i] = _args[i];
tail_recurse_0:

  Local<Number> sym_rhs_4 = Number::New(isolate, 0);
  Local<Boolean> sym_anon_2 = args[0]->StrictEquals(sym_rhs_4) ? True(isolate) : False(isolate);
  if (sym_anon_2->IsTrue()) {
    _args.GetReturnValue().Set(args[1]);
    return;
  }

  Local<Number> sym_rhs_11 = Number::New(isolate, 1);
  Local<Boolean> sym_anon_9 = args[0]->StrictEquals(sym_rhs_11) ? True(isolate) : False(isolate);
  if (sym_anon_9->IsTrue()) {
    _args.GetReturnValue().Set(args[2]);
    return;
  }

  Local<Number> sym_rhs_19 = Number::New(isolate, 1);
  Local<Value> sym_arg_17 = genericMinus(isolate, args[0], sym_rhs_19);
  Local<Value> sym_arg_21 = genericPlus(isolate, args[1], args[2]);
  args[0] = sym_arg_17;
  args[1] = args[2];
  args[2] = sym_arg_21;
  goto tail_recurse_0;

  return;
}

void jsc_main(const FunctionCallbackInfo<Value>& _args) {
  Isolate* isolate = _args.GetIsolate();
  std::vector<Local<Value>> args(_args.Length());;
  for (int i = 0; i < _args.Length(); i++) args[i] = _args[i];
tail_recurse_1:

  Local<Number> sym_arg_29 = Number::New(isolate, 100);
  Local<Number> sym_arg_30 = Number::New(isolate, 0);
  Local<Number> sym_arg_31 = Number::New(isolate, 1);
  Local<Value> sym_args_32[] = { sym_arg_29, sym_arg_30, sym_arg_31 };
  Local<Function> sym_fn_33 = FunctionTemplate::New(isolate, tco_fib)->GetFunction();
  sym_fn_33->SetName(String::NewFromUtf8(isolate, "tco_fib"));
  Local<Value> sym_arg_28 = sym_fn_33->Call(sym_fn_33, 3, sym_args_32);

  Local<Value> sym_args_34[] = { sym_arg_28 };
  Local<Value> sym_parent_37 = isolate->GetCurrentContext()->Global()->Get(String::NewFromUtf8(isolate, "console"));
  Local<Value> sym_anon_36 = sym_parent_37.As<Object>()->Get(String::NewFromUtf8(isolate, "log"));
  Local<Function> sym_fn_35 = Local<Function>::Cast(sym_anon_36);
  Local<Value> sym_anon_27 = sym_fn_35->Call(sym_fn_35, 1, sym_args_34);

  return;
}

void Init(Local<Object> exports) {
  NODE_SET_METHOD(exports, "jsc_main", jsc_main);
}

NODE_MODULE(NODE_GYP_MODULE_NAME, Init)
```

By running `./build.sh examples/recursion.js`.
