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
* [ ] Track/map locals in a scope dictionary
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

  var n = i;
  var previous_first = 0;
  var previous_second = 1;
  var next = 1;

  while (n >= 2) {
    next = previous_first + previous_second;
    previous_first = previous_second;
    previous_second = next;
    n = n - 1;
  }

  return next;
}

function main() {
  console.log(fib(50));
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
  Local<Value> i = args[0];
  Local<Context> ctx_1 = isolate->GetCurrentContext();
  Local<Object> global_2 = ctx_1->Global();
  Local<Function> Boolean_3 = Local<Function>::Cast(global_2->Get(String::NewFromUtf8(isolate, "Boolean")));
  Local<Value> argv_4[] = { (i->IsNumber() || Number::New(isolate, 1)->IsNumber()) ? (Number::New(isolate, i->ToNumber(isolate)->Value() <= Number::New(isolate, 1)->ToNumber(isolate)->Value())) : Local<Number>::Cast(Null(isolate)) };
  Local<Value> result_5 = Boolean_3->Call(Null(isolate), 1, argv_4);
  if (result_5->ToBoolean()->Value()) {
    args.GetReturnValue().Set(i);
    return;
  }
  Local<Value> n = i;
  Local<Value> previous_first = Number::New(isolate, 0);
  Local<Value> previous_second = Number::New(isolate, 1);
  Local<Value> next = Number::New(isolate, 1);
  Local<Context> ctx_6 = isolate->GetCurrentContext();
  Local<Object> global_7 = ctx_6->Global();
  Local<Function> Boolean_8 = Local<Function>::Cast(global_7->Get(String::NewFromUtf8(isolate, "Boolean")));
  Local<Value> argv_9[] = { (n->IsNumber() || Number::New(isolate, 2)->IsNumber()) ? (Number::New(isolate, n->ToNumber(isolate)->Value() >= Number::New(isolate, 2)->ToNumber(isolate)->Value())) : Local<Number>::Cast(Null(isolate)) };
  Local<Value> result_10 = Boolean_8->Call(Null(isolate), 1, argv_9);
  while (result_10->ToBoolean()->Value()) {
    next = (previous_first->IsString() || previous_second->IsString()) ? Local<Value>::Cast(String::Concat(previous_first->ToString(), previous_second->ToString())) : Local<Value>::Cast((previous_first->IsNumber() || previous_second->IsNumber()) ? (Number::New(isolate, previous_first->ToNumber(isolate)->Value() + previous_second->ToNumber(isolate)->Value())) : Local<Number>::Cast(Null(isolate)));
    previous_first = previous_second;
    previous_second = next;
    n = (n->IsNumber() || Number::New(isolate, 1)->IsNumber()) ? (Number::New(isolate, n->ToNumber(isolate)->Value() - Number::New(isolate, 1)->ToNumber(isolate)->Value())) : Local<Number>::Cast(Null(isolate));
    Local<Context> ctx_11 = isolate->GetCurrentContext();
    Local<Object> global_12 = ctx_11->Global();
    Local<Function> Boolean_13 = Local<Function>::Cast(global_12->Get(String::NewFromUtf8(isolate, "Boolean")));
    Local<Value> argv_14[] = { (n->IsNumber() || Number::New(isolate, 2)->IsNumber()) ? (Number::New(isolate, n->ToNumber(isolate)->Value() >= Number::New(isolate, 2)->ToNumber(isolate)->Value())) : Local<Number>::Cast(Null(isolate)) };
    Local<Value> result_15 = Boolean_13->Call(Null(isolate), 1, argv_14);
    result_10 = result_15;
  }
  args.GetReturnValue().Set(next);
}

void jsc_main(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  Local<Value> arg_16 = Number::New(isolate, 50);
  Local<FunctionTemplate> ftpl_18 = FunctionTemplate::New(isolate, fib);
  Local<Function> fn_17 = ftpl_18->GetFunction();
  fn_17->SetName(String::NewFromUtf8(isolate, "fib"));
  Local<Value> argv_19[] = { arg_16 };
  Local<Value> result_20 = fn_17->Call(Null(isolate), 1, argv_19);
  Local<Value> arg_21 = result_20;
  Local<Function> fn_22 = Local<Function>::Cast(Local<Object>::Cast(isolate->GetCurrentContext()->Global()->Get(String::NewFromUtf8(isolate, "console")))->Get(String::NewFromUtf8(isolate, "log")));
  Local<Value> argv_23[] = { arg_21 };
  Local<Value> result_24 = fn_22->Call(Null(isolate), 1, argv_23);
  result_24;
}

void Init(Local<Object> exports) {
  NODE_SET_METHOD(exports, "jsc_main", jsc_main);
}

NODE_MODULE(NODE_GYP_MODULE_NAME, Init)
```

By running `./build.sh examples/recursion.js`.