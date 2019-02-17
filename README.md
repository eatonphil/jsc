# Javascript compiler targeting C++/V8

### Building

Requires Node.

```bash
$ yarn
```

### Example

```bash
$ yarn ts-node src/main.ts examples/tco.js
$ node bin/tco.js
354224848179262000000

```

### Features

* Functions and function calls
  * Basic tail-call optimization
* Var declarations
* Few primitive operations
* Number, string, boolean and null literals

#### Not (yet) supported

* Prototype functions
* Nested functions
* Closures

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
// prefix omitted

void tco_fib(const FunctionCallbackInfo<Value>& _args) {
  Isolate* isolate = _args.GetIsolate();
  std::vector<Local<Value>> args(_args.Length());;
  for (int i = 0; i < _args.Length(); i++) args[i] = _args[i];
tail_recurse_0:

  Local<Value> sym_rhs_4 = Number::New(isolate, 0);
  Local<Value> sym_anon_2 = args[0]->StrictEquals(sym_rhs_4) ? True(isolate) : False(isolate);
  Local<Value> sym_anon_5[] = { sym_anon_2 };
  Maybe<bool> sym_anon_6 = sym_anon_2->BooleanValue(isolate->GetCurrentContext());
  if (sym_anon_6.IsJust() && sym_anon_6.FromJust()) {
    _args.GetReturnValue().Set(args[1]);
    return;
  }

  Local<Value> sym_rhs_13 = Number::New(isolate, 1);
  Local<Value> sym_anon_11 = args[0]->StrictEquals(sym_rhs_13) ? True(isolate) : False(isolate);
  Local<Value> sym_anon_14[] = { sym_anon_11 };
  Maybe<bool> sym_anon_15 = sym_anon_11->BooleanValue(isolate->GetCurrentContext());
  if (sym_anon_15.IsJust() && sym_anon_15.FromJust()) {
    _args.GetReturnValue().Set(args[2]);
    return;
  }

  Local<Value> sym_rhs_23 = Number::New(isolate, 1);
  Local<Value> sym_arg_21 = genericMinus(isolate, args[0], sym_rhs_23);
  Local<Value> sym_arg_25 = genericPlus(isolate, args[1], args[2]);
  args[0] = sym_arg_21;
  args[1] = args[2];
  args[2] = sym_arg_25;
  goto tail_recurse_0;
}

void jsc_main(const FunctionCallbackInfo<Value>& _args) {
  Isolate* isolate = _args.GetIsolate();
  std::vector<Local<Value>> args(_args.Length());;
  for (int i = 0; i < _args.Length(); i++) args[i] = _args[i];
tail_recurse_1:

  Local<Value> sym_arg_33 = Number::New(isolate, 100);
  Local<Value> sym_arg_34 = Number::New(isolate, 0);
  Local<Value> sym_arg_35 = Number::New(isolate, 1);
  Local<Value> sym_args_36[] = { sym_arg_33, sym_arg_34, sym_arg_35 };
  Local<Function> sym_fn_37 = FunctionTemplate::New(isolate, tco_fib)->GetFunction();
  sym_fn_37->SetName(String::NewFromUtf8(isolate, "tco_fib"));
  Local<Value> sym_arg_32 = sym_fn_37->Call(sym_fn_37, 3, sym_args_36);

  Local<Value> sym_args_38[] = { sym_arg_32 };
  Local<Value> sym_parent_41 = isolate->GetCurrentContext()->Global()->Get(String::NewFromUtf8(isolate, "console"));
  Local<Value> sym_anon_40 = sym_parent_41.As<Object>()->Get(String::NewFromUtf8(isolate, "log"));
  Local<Function> sym_fn_39 = Local<Function>::Cast(sym_anon_40);
  Local<Value> sym_anon_31 = sym_fn_39->Call(sym_fn_39, 1, sym_args_38);
}

// postfix omitted
```

By running `./build.sh examples/recursion.js`.
