# Javascript compiler targeting C++/V8

### Building

Requires Rust, node-gyp, and Node.

```bash
$ cargo build
```

### Example

```bash
$ cargo build
$ ./target/debug/jsc --entry example/hello_world.js --out_dir build --target node-program
$ node build/hello_world.js
hey there%
```

### Todo

* [ ] Replace Node entry with C++/V8 entry
* [ ] Replace jsc_printf with console.log
* [ ] Track/map locals in a scope dictionary
* [ ] Replace binop calls with in-line code
* [ ] Add support for all binops
* [ ] Add support for let/const
* [ ] Add support for first-class functions
* [ ] Add support for nested functions

### Code produced

The following:

```js
function fib(i) {
  if (i <= 1) {
    return i;
  }

  return fib(i - 1) + fib(i - 2);
}

function main() {
  console.log(fib(20));
}
```

Gets compiled to:

```cpp
#include <iostream>

#include <node.h>

using v8::Context;
using v8::Exception;
using v8::Function;
using v8::FunctionTemplate;
using v8::FunctionCallbackInfo;
using v8::Isolate;
using v8::Local;
using v8::Null;
using v8::Number;
using v8::Object;
using v8::String;
using v8::Value;

...

void fib(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  Local<Value> i = args[0];
  Local<Context> ctx_1 = isolate->GetCurrentContext();
  Local<Object> global_2 = ctx_1->Global();
  Local<Function> Boolean_3 = Local<Function>::Cast(global_2->Get(String::NewFromUtf8(isolate, "Boolean")));
  Local<Value> argv_4[] = { jsc_leq(isolate, i, Number::New(isolate, 1)) };
  Local<Value> result_5 = Boolean_3->Call(Null(isolate), 1, argv_4);
  if (result_5->ToBoolean()->Value()) {
    args.GetReturnValue().Set(i);
    return;
  }
  Local<Value> arg_6 = jsc_minus(isolate, i, Number::New(isolate, 1));
  Local<FunctionTemplate> ftpl_8 = FunctionTemplate::New(isolate, fib);
  Local<Function> fn_7 = ftpl_8->GetFunction();
  fn_7->SetName(String::NewFromUtf8(isolate, "fib"));
  Local<Value> argv_9[] = { arg_6 };
  Local<Value> result_10 = fn_7->Call(Null(isolate), 1, argv_9);
  Local<Value> arg_11 = jsc_minus(isolate, i, Number::New(isolate, 2));
  Local<FunctionTemplate> ftpl_13 = FunctionTemplate::New(isolate, fib);
  Local<Function> fn_12 = ftpl_13->GetFunction();
  fn_12->SetName(String::NewFromUtf8(isolate, "fib"));
  Local<Value> argv_14[] = { arg_11 };
  Local<Value> result_15 = fn_12->Call(Null(isolate), 1, argv_14);
  args.GetReturnValue().Set(jsc_plus(isolate, result_10, result_15));
}

void jsc_main(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  Local<Value> arg_16 = Number::New(isolate, 20);
  Local<FunctionTemplate> ftpl_18 = FunctionTemplate::New(isolate, fib);
  Local<Function> fn_17 = ftpl_18->GetFunction();
  fn_17->SetName(String::NewFromUtf8(isolate, "fib"));
  Local<Value> argv_19[] = { arg_16 };
  Local<Value> result_20 = fn_17->Call(Null(isolate), 1, argv_19);
  Local<Value> arg_21 = result_20;
  Local<Function> fn_22 = Local<Function>::Cast(Local<Object>::Cast(isolate->GetCurrentContext()->Global()->Get(String::NewFromUtf8(isolate, "console")))->Get(String::NewFromUtf8(isolate, "log")));
  Local<Value> argv_23[] = { arg_21 };
  Local<Value> result_24 = fn_22->Call(Null(isolate), 1, argv_23);
}

void Init(Local<Object> exports) {
  NODE_SET_METHOD(exports, "jsc_main", jsc_main);
}

NODE_MODULE(NODE_GYP_MODULE_NAME, Init)
```

By running `./build.sh examples/recursion.js`.