# Javascript compiler targeting C++/V8

The following:

```
function main() {
  var a = "hello ";
  var b = "world!\n";
  var c = a + b;
  jsc_printf(c);
}
```

Gets compiled to:

```
#include <iostream>

#include <node.h>

using v8::Exception;
using v8::Function;
using v8::FunctionTemplate;
using v8::FunctionCallbackInfo;
using v8::Isolate;
using v8::Local;
using v8::Number;
using v8::Object;
using v8::String;
using v8::Value;


Local<Value> jsc_plus(Isolate* isolate, Local<Value> a, Local<Value> b) {
  Local<Value> result;

  if (a->IsString() || b->IsString()) {
    result = String::Concat(a->ToString(), b->ToString());
  } else if (a->IsNumber() || b->IsNumber()) {
    double aNumber = a->ToNumber(isolate)->Value();
    double bNumber = b->ToNumber(isolate)->Value();
    result = Number::New(isolate, aNumber + bNumber);
  }

  return result;
}

void jsc_printf(const FunctionCallbackInfo<Value>& args) {
  String::Utf8Value s(args[0]->ToString());
  std::string cs = std::string(*s);
  std::cout << cs;
}

void jsc_main(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  Local<Value> a = String::NewFromUtf8(isolate, "hello ");
  Local<Value> b = String::NewFromUtf8(isolate, "world!\n");
  Local<Value> c = jsc_plus(isolate, a, b);
  Local<FunctionTemplate> ftpl_1 = FunctionTemplate::New(isolate, jsc_printf);
  Local<Function> fn_2 = ftpl_1->GetFunction();
  fn_2->SetName(String::NewFromUtf8(isolate, "jsc_printf"));
  auto arg_3 = c;
  Local<Value> argv_4[] = { arg_3 };
  fn_2->Call(Null(isolate), 1, argv_4);
}

void Init(Local<Object> exports) {
  NODE_SET_METHOD(exports, "jsc_main", jsc_main);
}

NODE_MODULE(NODE_GYP_MODULE_NAME, Init)
```

By running `./build.sh examples/local_strings.js`.