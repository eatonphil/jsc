# Javascript compiler targeting C++/V8

### Features

* Tail-call optimization

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
* [ ] Track/map locals in a scope dictionary
* [ ] Add support for all binops
* [ ] Add support for let/const
* [ ] Add support for first-class functions
* [ ] Add support for nested functions

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

void fib(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  Local<Value> n = args[0];
  Local<Value> a = args[1];
  Local<Value> b = args[2];
tail_recurse_1:
  Local<Context> ctx_2 = isolate->GetCurrentContext();
  Local<Object> global_3 = ctx_2->Global();
  Local<Function> Boolean_4 = Local<Function>::Cast(global_3->Get(String::NewFromUtf8(isolate, "Boolean")));
  Local<Value> argv_5[] = { (n->IsNumber() || Number::New(isolate, 0)->IsNumber()) ? (Number::New(isolate, n->ToNumber(isolate)->Value() == Number::New(isolate, 0)->ToNumber(isolate)->Value())) : Local<Number>::Cast(Null(isolate)) };
  Local<Value> result_6 = Boolean_4->Call(Null(isolate), 1, argv_5);
  if (result_6->ToBoolean()->Value()) {
    args.GetReturnValue().Set(a);
    return;
    return;
  }
  Local<Context> ctx_7 = isolate->GetCurrentContext();
  Local<Object> global_8 = ctx_7->Global();
  Local<Function> Boolean_9 = Local<Function>::Cast(global_8->Get(String::NewFromUtf8(isolate, "Boolean")));
  Local<Value> argv_10[] = { (n->IsNumber() || Number::New(isolate, 1)->IsNumber()) ? (Number::New(isolate, n->ToNumber(isolate)->Value() == Number::New(isolate, 1)->ToNumber(isolate)->Value())) : Local<Number>::Cast(Null(isolate)) };
  Local<Value> result_11 = Boolean_9->Call(Null(isolate), 1, argv_10);
  if (result_11->ToBoolean()->Value()) {
    args.GetReturnValue().Set(b);
    return;
    return;
  }
  Local<Value> arg_12 = (n->IsNumber() || Number::New(isolate, 1)->IsNumber()) ? (Number::New(isolate, n->ToNumber(isolate)->Value() - Number::New(isolate, 1)->ToNumber(isolate)->Value())) : Local<Number>::Cast(Null(isolate));
  Local<Value> arg_13 = b;
  Local<Value> arg_14 = (a->IsString() || b->IsString()) ? Local<Value>::Cast(String::Concat(a->ToString(), b->ToString())) : Local<Value>::Cast((a->IsNumber() || b->IsNumber()) ? (Number::New(isolate, a->ToNumber(isolate)->Value() + b->ToNumber(isolate)->Value())) : Local<Number>::Cast(Null(isolate)));
  Local<FunctionTemplate> ftpl_16 = FunctionTemplate::New(isolate, fib);
  Local<Function> fn_15 = ftpl_16->GetFunction();
  fn_15->SetName(String::NewFromUtf8(isolate, "fib"));
  n = arg_12;
  a = arg_13;
  b = arg_14;
  goto tail_recurse_1;
}

void jsc_main(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
tail_recurse_17:
  Local<Value> arg_18 = Number::New(isolate, 50);
  Local<Value> arg_19 = Number::New(isolate, 0);
  Local<Value> arg_20 = Number::New(isolate, 1);
  Local<FunctionTemplate> ftpl_22 = FunctionTemplate::New(isolate, fib);
  Local<Function> fn_21 = ftpl_22->GetFunction();
  fn_21->SetName(String::NewFromUtf8(isolate, "fib"));
  Local<Value> argv_23[] = { arg_18, arg_19, arg_20 };
  Local<Value> result_24 = fn_21->Call(Null(isolate), 3, argv_23);
  Local<Value> arg_25 = result_24;
  Local<Function> fn_26 = Local<Function>::Cast(Local<Object>::Cast(isolate->GetCurrentContext()->Global()->Get(String::NewFromUtf8(isolate, "console")))->Get(String::NewFromUtf8(isolate, "log")));
  Local<Value> argv_27[] = { arg_25 };
  Local<Value> result_28 = fn_26->Call(Null(isolate), 1, argv_27);
  result_28;
}

void Init(Local<Object> exports) {
  NODE_SET_METHOD(exports, "jsc_main", jsc_main);
}

NODE_MODULE(NODE_GYP_MODULE_NAME, Init)
```

By running `./build.sh examples/recursion.js`.