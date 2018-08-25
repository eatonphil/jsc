# Javascript compiler targeting C++/V8

The following:

```
function main() {
  jsc_printf("hey there");
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
void jsc_printf(const FunctionCallbackInfo<Value>& args) {
  String::Utf8Value s(args[0]->ToString());
  std::string cs = std::string(*s);
  std::cout << cs;
}
void jsc_main(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  Local<FunctionTemplate> tpl_jsc_printf = FunctionTemplate::New(isolate, jsc_printf);
  Local<Function> fn_jsc_printf = tpl_jsc_printf->GetFunction();
  fn_jsc_printf->SetName(String::NewFromUtf8(isolate, "jsc_printf"));
  auto arg0 = String::NewFromUtf8(isolate, "hey there");
  Local<Value> fn_jsc_printf_argv[] = { arg0 };
  fn_jsc_printf->Call(Null(isolate), 1, fn_jsc_printf_argv);
}
void Init(Local<Object> exports) {
  NODE_SET_METHOD(exports, "jsc_main", jsc_main);
}
NODE_MODULE(NODE_GYP_MODULE_NAME, Init)
```

By running `./build.sh examples/hello_world.js`.