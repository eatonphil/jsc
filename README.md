# Javascript compiler targeting C++/V8

The following:

```js
function fib(i) {
  if (i <= 1) {
    return i;
  }

  return fib(i - 1) + fib(i - 2);
}

function main() {
  jsc_printf(fib(20));
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
  Boolean_3->SetName(String::NewFromUtf8(isolate, "Boolean"));
  Local<Value> argv_4[] = { jsc_leq(isolate, i, Number::New(isolate, 1)) };
  Local<Value> result_5 = Boolean_3->Call(Null(isolate), 1, argv_4);
  if (result_5->ToBoolean()->Value()) {
    args.GetReturnValue().Set(i);
    return;
  }
  Local<Value> arg_6 = jsc_minus(isolate, i, Number::New(isolate, 1));
  Local<FunctionTemplate> ftpl_7 = FunctionTemplate::New(isolate, fib);
  Local<Function> fn_8 = ftpl_7->GetFunction();
  fn_8->SetName(String::NewFromUtf8(isolate, "fib"));
  Local<Value> argv_9[] = { arg_6 };
  Local<Value> result_10 = fn_8->Call(Null(isolate), 1, argv_9);
  Local<Value> arg_11 = jsc_minus(isolate, i, Number::New(isolate, 2));
  Local<FunctionTemplate> ftpl_12 = FunctionTemplate::New(isolate, fib);
  Local<Function> fn_13 = ftpl_12->GetFunction();
  fn_13->SetName(String::NewFromUtf8(isolate, "fib"));
  Local<Value> argv_14[] = { arg_11 };
  Local<Value> result_15 = fn_13->Call(Null(isolate), 1, argv_14);
  args.GetReturnValue().Set(jsc_plus(isolate, result_10, result_15));
}

void jsc_main(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  Local<Value> arg_16 = Number::New(isolate, 20);
  Local<FunctionTemplate> ftpl_17 = FunctionTemplate::New(isolate, fib);
  Local<Function> fn_18 = ftpl_17->GetFunction();
  fn_18->SetName(String::NewFromUtf8(isolate, "fib"));
  Local<Value> argv_19[] = { arg_16 };
  Local<Value> result_20 = fn_18->Call(Null(isolate), 1, argv_19);
  Local<Value> arg_21 = result_20;
  Local<FunctionTemplate> ftpl_22 = FunctionTemplate::New(isolate, jsc_printf);
  Local<Function> fn_23 = ftpl_22->GetFunction();
  fn_23->SetName(String::NewFromUtf8(isolate, "jsc_printf"));
  Local<Value> argv_24[] = { arg_21 };
  Local<Value> result_25 = fn_23->Call(Null(isolate), 1, argv_24);
}

void Init(Local<Object> exports) {
  NODE_SET_METHOD(exports, "jsc_main", jsc_main);
}

NODE_MODULE(NODE_GYP_MODULE_NAME, Init)

```

By running `./build.sh examples/recursion.js`.