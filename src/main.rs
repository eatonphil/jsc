use std::fs::File;
use std::io::Read;
use std::string::String;

extern crate esprit;
extern crate easter;

fn generate_function_declaration(id: &easter::id::Id, _: &easter::fun::Params, body: &Vec<easter::stmt::StmtListItem>) -> String {
    let name: String = if id.is_some() {
      id.name.as_ref().to_string()
    } else {
      "lambda".to_owned()
    };
    println!("  void jsc_{}(const FunctionCallbackInfo<Value>& args) {{
    Isolate* isolate = args.GetIsolate();", name);

    generate(body);

    println!("  }}\n");

    format!("jsc_{}", name)
}

fn generate_call(expression: &easter::expr::Expr, args: &Vec<easter::expr::Expr>) -> String {
    let fn_name = generate_expression(expression);
    println!("    Local<FunctionTemplate> tpl_{} = FunctionTemplate::New(isolate, {});", fn_name, fn_name);
    println!("    Local<Function> fn_{} = tpl_{}->GetFunction();", fn_name, fn_name);
    println!("    fn_{}->SetName(String::NewFromUtf8(isolate, \"{}\"));", fn_name, fn_name);

    let args_len = args.len();
    let mut argv_items = Vec::with_capacity(args_len);
    for (i, arg) in args.iter().enumerate() {
      let arg_holder = generate_expression(arg);
      println!("    auto arg{} = {};", i, arg_holder);
      argv_items.push(format!("arg{}", i));
    }

    println!("    Local<Value> fn_{}_argv[] = {{ {} }};", fn_name, argv_items.join(", "));
    println!("    fn_{}->Call(Null(isolate), {}, fn_{}_argv);", fn_name, args.len(), fn_name);

    fn_name
}

fn generate_expression(expression: &easter::expr::Expr) -> String {
    match expression {
      &easter::expr::Expr::Call(_, ref name, ref args) => generate_call(name, args),
      &easter::expr::Expr::Id(ref id) => id.name.as_ref().to_string(),
      &easter::expr::Expr::String(_, ref string) => format!("String::NewFromUtf8(isolate, \"{}\")", string.value),
      _ => panic!("found expr: {:#?}", expression),
    }
}

fn generate_statement(statement: &easter::stmt::Stmt) {
    match statement {
      &easter::stmt::Stmt::Expr(_, ref e, _) => { generate_expression(e); },
      _ => panic!("found stmt: {:#?}", statement),
    }
}

fn generate(ast: &Vec<easter::stmt::StmtListItem>) -> Vec<String> {
    let mut exports = Vec::new();
    for statement in ast.iter() {
      match statement {
        &easter::stmt::StmtListItem::Decl(easter::decl::Decl::Fun(easter::fun::Fun { ref id, ref params, ref body, .. })) =>
            match id {
              &Some(ref id) => {
                let decl = generate_function_declaration(id, params, body);
                exports.push(decl)
              },
              _ => panic!("anonymous function declarations not supported"),
            },
        &easter::stmt::StmtListItem::Stmt(ref s) =>
            generate_statement(s)
      }
    }

    exports
}

fn generate_prefix() {
    println!("#include <iostream>

#include <node.h>

namespace demo {{
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

  void jsc_printf(const FunctionCallbackInfo<Value>& args) {{
    String::Utf8Value s(args[0]->ToString());
    std::string cs = std::string(*s);
    std::cout << cs;
  }}
");
}

fn generate_postfix(exports: Vec<String>) {
    println!("  void Init(Local<Object> exports) {{");

    for export in exports.iter() {
      println!("    NODE_SET_METHOD(exports, \"{}\", {});", export, export);
    }

    println!("  }}

  NODE_MODULE(NODE_GYP_MODULE_NAME, Init)
}}");
}

fn main() {
    let mut f = File::open("example/test.js").expect("test.js not found");
    let mut contents = String::new();
    f.read_to_string(&mut contents).expect("error reading the file");

    let easter::prog::Script { body: ast, .. } = esprit::script(contents.as_str()).expect("parsing error");

    generate_prefix();
    let exports = generate(&ast);
    generate_postfix(exports);
}
