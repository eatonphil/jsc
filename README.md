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
hey there%
```

### Features

* Function calls
  * Tail-call optimization
* Primitive numeric operations

#### Not (yet) supported

* Objects
* Arrays
* Nested functions
* First-class functions
* Closures
* Implicit global object context
* And/or operators

### Todo

* [ ] Track/map locals in a scope dictionary
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


#include <node.h>

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

void fib(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  Local<Value> n = args[0];
  Local<Value> a = args[1];
  Local<Value> b = args[2];
tail_recurse_1:
  Local<Context> ctx_2 = isolate->GetCurrentContext();
  Local<Object> global_3 = ctx_2->Global();
  Local<Function> Boolean_4 = Local<Function>::Cast(global_3->Get(String::NewFromUtf8(isolate, "Boolean")));
  String::Utf8Value utf8value_tmp_5(n);
  std::string string_tmp_6(*utf8value_tmp_5);
  String::Utf8Value utf8value_tmp_7(Number::New(isolate, 0));
  std::string string_tmp_8(*utf8value_tmp_7);
  Local<Value> argv_9[] = { (n->IsBoolean() || Number::New(isolate, 0)->IsBoolean()) ? Boolean::New(isolate, n->ToBoolean(isolate)->Value() == Number::New(isolate, 0)->ToBoolean(isolate)->Value()) : ((n->IsNumber() || Number::New(isolate, 0)->IsNumber()) ? Boolean::New(isolate, n->ToNumber(isolate)->Value() == Number::New(isolate, 0)->ToNumber(isolate)->Value()) : ((n->IsString() || Number::New(isolate, 0)->IsString()) ? Boolean::New(isolate, string_tmp_6 == string_tmp_8) : (False(isolate)))) };
  Local<Value> result_10 = Boolean_4->Call(Null(isolate), 1, argv_9);
  if (result_10->ToBoolean()->Value()) {
    args.GetReturnValue().Set(a);
    return;
    return;
  }
  Local<Context> ctx_11 = isolate->GetCurrentContext();
  Local<Object> global_12 = ctx_11->Global();
  Local<Function> Boolean_13 = Local<Function>::Cast(global_12->Get(String::NewFromUtf8(isolate, "Boolean")));
  String::Utf8Value utf8value_tmp_14(n);
  std::string string_tmp_15(*utf8value_tmp_14);
  String::Utf8Value utf8value_tmp_16(Number::New(isolate, 1));
  std::string string_tmp_17(*utf8value_tmp_16);
  Local<Value> argv_18[] = { (n->IsBoolean() || Number::New(isolate, 1)->IsBoolean()) ? Boolean::New(isolate, n->ToBoolean(isolate)->Value() == Number::New(isolate, 1)->ToBoolean(isolate)->Value()) : ((n->IsNumber() || Number::New(isolate, 1)->IsNumber()) ? Boolean::New(isolate, n->ToNumber(isolate)->Value() == Number::New(isolate, 1)->ToNumber(isolate)->Value()) : ((n->IsString() || Number::New(isolate, 1)->IsString()) ? Boolean::New(isolate, string_tmp_15 == string_tmp_17) : (False(isolate)))) };
  Local<Value> result_19 = Boolean_13->Call(Null(isolate), 1, argv_18);
  if (result_19->ToBoolean()->Value()) {
    args.GetReturnValue().Set(b);
    return;
    return;
  }
  Local<Value> arg_20 = (n->IsNumber() || Number::New(isolate, 1)->IsNumber()) ? (Number::New(isolate, n->ToNumber(isolate)->Value() - Number::New(isolate, 1)->ToNumber(isolate)->Value())) : Local<Number>::Cast(Null(isolate));
  Local<Value> arg_21 = b;
  Local<Value> arg_22 = (a->IsString() || b->IsString()) ? Local<Value>::Cast(String::Concat(a->ToString(), b->ToString())) : Local<Value>::Cast((a->IsNumber() || b->IsNumber()) ? (Number::New(isolate, a->ToNumber(isolate)->Value() + b->ToNumber(isolate)->Value())) : Local<Number>::Cast(Null(isolate)));
  Local<FunctionTemplate> ftpl_24 = FunctionTemplate::New(isolate, fib);
  Local<Function> fn_23 = ftpl_24->GetFunction();
  fn_23->SetName(String::NewFromUtf8(isolate, "fib"));
  n = arg_20;
  a = arg_21;
  b = arg_22;
  goto tail_recurse_1;
}

void jsc_main(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
tail_recurse_25:
  Local<Value> arg_26 = Number::New(isolate, 50);
  Local<Value> arg_27 = Number::New(isolate, 0);
  Local<Value> arg_28 = Number::New(isolate, 1);
  Local<FunctionTemplate> ftpl_30 = FunctionTemplate::New(isolate, fib);
  Local<Function> fn_29 = ftpl_30->GetFunction();
  fn_29->SetName(String::NewFromUtf8(isolate, "fib"));
  Local<Value> argv_31[] = { arg_26, arg_27, arg_28 };
  Local<Value> result_32 = fn_29->Call(Null(isolate), 3, argv_31);
  Local<Value> arg_33 = result_32;
  Local<Function> fn_34 = Local<Function>::Cast(Local<Object>::Cast(isolate->GetCurrentContext()->Global()->Get(String::NewFromUtf8(isolate, "console")))->Get(String::NewFromUtf8(isolate, "log")));
  Local<Value> argv_35[] = { arg_33 };
  Local<Value> result_36 = fn_34->Call(Null(isolate), 1, argv_35);
  result_36;
}

void Init(Local<Object> exports) {
  NODE_SET_METHOD(exports, "jsc_main", jsc_main);
}

NODE_MODULE(NODE_GYP_MODULE_NAME, Init)
```

By running `./build.sh examples/recursion.js`.