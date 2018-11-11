# Javascript compiler targeting C++/V8

### Building

Requires Rust, node-gyp, and Node.

```bash
$ cargo build
```

### Example

```bash
$ cargo build
$ ./target/debug/jsc example/hello_world.js
$ node build/hello_world.js
hey there

```

### Features

* Functions and function calls
  * Tail-call optimization
* Let, const, var	
* Primitive numeric operations
* Arrays
* Numbers
* Strings
* Boolean
* Null

#### Not (yet) supported

* Prototype functions
* Nested functions
* Closures
* And/or operators

### Todo

* [ ] Add native target (no Node)

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
#include <string>
#include <iostream>

#include <node.h>

using v8::Array;
using v8::Boolean;
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
using v8::False;
using v8::True;
using v8::Value;

void fib_0(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  Local<Value> n_1 = args[0];
  Local<Value> a_2 = args[1];
  Local<Value> b_3 = args[2];
tail_recurse_4:
  Local<Context> ctx_5 = isolate->GetCurrentContext();
  Local<Object> global_6 = ctx_5->Global();
  Local<Function> Boolean_7 = Local<Function>::Cast(global_6->Get(String::NewFromUtf8(isolate, "Boolean")));
  String::Utf8Value utf8value_tmp_8(n_1);
  std::string string_tmp_9(*utf8value_tmp_8);
  String::Utf8Value utf8value_tmp_10(Number::New(isolate, 0));
  std::string string_tmp_11(*utf8value_tmp_10);
  Local<Value> argv_12[] = { (n_1->IsBoolean() || Number::New(isolate, 0)->IsBoolean()) ? Boolean::New(isolate, n_1->ToBoolean(isolate)->Value() == Number::New(isolate, 0)->ToBoolean(isolate)->Value()) : ((n_1->IsNumber() || Number::New(isolate, 0)->IsNumber()) ? Boolean::New(isolate, n_1->ToNumber(isolate)->Value() == Number::New(isolate, 0)->ToNumber(isolate)->Value()) : ((n_1->IsString() || Number::New(isolate, 0)->IsString()) ? Boolean::New(isolate, string_tmp_9 == string_tmp_11) : (False(isolate)))) };
  Local<Value> result_13 = Boolean_7->Call(Null(isolate), 1, argv_12);
  if (result_13->ToBoolean()->Value()) {
    args.GetReturnValue().Set(a_2);
    return;
    return;
  }
  Local<Context> ctx_14 = isolate->GetCurrentContext();
  Local<Object> global_15 = ctx_14->Global();
  Local<Function> Boolean_16 = Local<Function>::Cast(global_15->Get(String::NewFromUtf8(isolate, "Boolean")));
  String::Utf8Value utf8value_tmp_17(n_1);
  std::string string_tmp_18(*utf8value_tmp_17);
  String::Utf8Value utf8value_tmp_19(Number::New(isolate, 1));
  std::string string_tmp_20(*utf8value_tmp_19);
  Local<Value> argv_21[] = { (n_1->IsBoolean() || Number::New(isolate, 1)->IsBoolean()) ? Boolean::New(isolate, n_1->ToBoolean(isolate)->Value() == Number::New(isolate, 1)->ToBoolean(isolate)->Value()) : ((n_1->IsNumber() || Number::New(isolate, 1)->IsNumber()) ? Boolean::New(isolate, n_1->ToNumber(isolate)->Value() == Number::New(isolate, 1)->ToNumber(isolate)->Value()) : ((n_1->IsString() || Number::New(isolate, 1)->IsString()) ? Boolean::New(isolate, string_tmp_18 == string_tmp_20) : (False(isolate)))) };
  Local<Value> result_22 = Boolean_16->Call(Null(isolate), 1, argv_21);
  if (result_22->ToBoolean()->Value()) {
    args.GetReturnValue().Set(b_3);
    return;
    return;
  }
  Local<Value> arg_23 = (n_1->IsNumber() || Number::New(isolate, 1)->IsNumber()) ? (Number::New(isolate, n_1->ToNumber(isolate)->Value() - Number::New(isolate, 1)->ToNumber(isolate)->Value())) : Local<Number>::Cast(Null(isolate));
  Local<Value> arg_24 = b_3;
  Local<Value> arg_25 = (a_2->IsString() || b_3->IsString()) ? Local<Value>::Cast(String::Concat(a_2->ToString(), b_3->ToString())) : Local<Value>::Cast((a_2->IsNumber() || b_3->IsNumber()) ? (Number::New(isolate, a_2->ToNumber(isolate)->Value() + b_3->ToNumber(isolate)->Value())) : Local<Number>::Cast(Null(isolate)));
  Local<FunctionTemplate> ftpl_27 = FunctionTemplate::New(isolate, fib_0);
  Local<Function> fn_26 = ftpl_27->GetFunction();
  fn_26->SetName(String::NewFromUtf8(isolate, "fib_0"));
  n_1 = arg_23;
  a_2 = arg_24;
  b_3 = arg_25;
  goto tail_recurse_4;
}

void jsc_main(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
tail_recurse_28:
  Local<Value> dot_parent_30 = isolate->GetCurrentContext()->Global()->Get(String::NewFromUtf8(isolate, "console"));
  Local<String> property_31 = String::NewFromUtf8(isolate, "log");
  while (dot_parent_30->IsObject() && !dot_parent_30.As<Object>()->HasOwnProperty(isolate->GetCurrentContext(), property_31).ToChecked()) {
    dot_parent_30 = dot_parent_30.As<Object>()->GetPrototype();
  }
  Local<Value> dot_result_29 = dot_parent_30.As<Object>()->Get(isolate->GetCurrentContext(), property_31).ToLocalChecked();
  Local<Value> arg_32 = Number::New(isolate, 50);
  Local<Value> arg_33 = Number::New(isolate, 0);
  Local<Value> arg_34 = Number::New(isolate, 1);
  Local<FunctionTemplate> ftpl_36 = FunctionTemplate::New(isolate, fib_0);
  Local<Function> fn_35 = ftpl_36->GetFunction();
  fn_35->SetName(String::NewFromUtf8(isolate, "fib_0"));
  Local<Value> argv_37[] = { arg_32, arg_33, arg_34 };
  Local<Value> result_38 = fn_35->Call(Null(isolate), 3, argv_37);
  Local<Value> arg_39 = result_38;
  Local<Function> fn_40 = Local<Function>::Cast(dot_result_29);
  Local<Value> argv_41[] = { arg_39 };
  Local<Value> result_42 = fn_40->Call(dot_parent_30, 1, argv_41);
  result_42;
}

void Init(Local<Object> exports) {
  NODE_SET_METHOD(exports, "jsc_main", jsc_main);
}

NODE_MODULE(NODE_GYP_MODULE_NAME, Init)
```

By running `./build.sh examples/recursion.js`.
