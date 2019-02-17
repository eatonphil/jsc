#include <iostream>
#include <string>

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
using v8::Maybe;

inline double toNumber(Local<Value> n) {
  if (n->IsNumber()) {
    return Local<Number>::Cast(n)->Value();
  } else if (n->IsBoolean()) {
    return Local<Boolean>::Cast(n)->IsTrue() ? 1 : 0;
  }

  return 0;
}

inline Local<String> toString(Isolate* isolate, Local<Value> s) {
  std::string cpps = "";

  if (s->IsNumber()) {
    cpps = std::to_string(Local<Number>::Cast(s)->Value());
  } else if (s->IsBoolean()) {
    cpps = Local<Boolean>::Cast(s)->IsTrue() ? "true" : "false";
  } else if (s->IsString()) {
    return Local<String>::Cast(s);
  }

  return String::NewFromUtf8(isolate, cpps.c_str());
}

inline Local<Value> genericPlus(Isolate* isolate, Local<Value> l, Local<Value> r) {
  if (l->IsString() || r->IsString()) {
    return String::Concat(toString(isolate, l), toString(isolate, r));
  } else {
    return Number::New(isolate, toNumber(l) + toNumber(r));
  }
}

inline Local<Value> genericMinus(Isolate* isolate, Local<Value> l, Local<Value> r) {
  return Number::New(isolate, toNumber(l) - toNumber(r));
}
