#include <cmath>
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

inline bool toBoolean(Local<Value> n) {
  if (n->IsNumber()) {
    return Local<Number>::Cast(n)->Value() != 0;
  } else if (n->IsBoolean()) {
    return Local<Boolean>::Cast(n)->IsTrue();
  } else if (n->IsString()) {
    return Local<String>::Cast(n)->Length() != 0;
  }

  return true;
}

inline Local<String> toString(Isolate* isolate, Local<Value> s) {
  std::string cpps = "";
  double d;

  if (s->IsNumber()) {
    d = Local<Number>::Cast(s)->Value();
    if (d == trunc(d)) {
      // TODO: deal with double vs long long
      cpps = std::to_string((long long)(d));
    } else {
      cpps = std::to_string(d);
    }
  } else if (s->IsBoolean()) {
    cpps = Local<Boolean>::Cast(s)->IsTrue() ? "true" : "false";
  } else if (s->IsString()) {
    return Local<String>::Cast(s);
  }

  return String::NewFromUtf8(isolate, cpps.c_str());
}

inline Local<Value> genericPlus(Isolate* isolate, Local<Value> l, Local<Value> r) {
  if (l->IsString() || r->IsString()) {
    return String::Concat(isolate, toString(isolate, l), toString(isolate, r));
  }

  return Number::New(isolate, toNumber(l) + toNumber(r));
}

inline Local<Number> genericMinus(Isolate* isolate, Local<Value> l, Local<Value> r) {
  return Number::New(isolate, toNumber(l) - toNumber(r));
}

inline Local<String> stringPlus(Isolate* isolate, Local<String> l, Local<String> r) {
  return String::Concat(isolate, toString(isolate, l), toString(isolate, r));
}

inline Local<Value> genericTimes(Isolate* isolate, Local<Value> l, Local<Value> r) {
  return Number::New(isolate, toNumber(l) * toNumber(r));
}
