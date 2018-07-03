use std::fs::File;
use std::io::Read;

extern crate esprit;
extern crate easter;

fn generate_function_declaration(id: &easter::id::Id, params: &easter::fun::Params, body: &Vec<easter::stmt::StmtListItem>) {
    println!("void {}(const FunctionCallbackInfo<Value>& args) {
      Isolate* isolate = args.GetIsolate();");

    println!("}");
}

fn generate_statement(statement: &easter::stmt::Stmt) {
    println!("found stmt: {:#?}", statement);
}

fn generate_prefix() {
    println!("#include <node.h>

namespace demo {

using v8::Exception;
using v8::FunctionCallbackInfo;
using v8::Isolate;
using v8::Local;
using v8::Number;
using v8::Object;
using v8::String;
using v8::Value;");
}

fn generate_code(ast: Vec<easter::stmt::StmtListItem>) {
    generate_prefix();

    for statement in ast.iter() {
        match statement {
            &easter::stmt::StmtListItem::Decl(easter::decl::Decl::Fun(easter::fun::Fun { ref id, ref params, ref body, .. })) =>
                match id {
                    &Some(ref id) => generate_function_declaration(id, params, body),
                    _ => panic!("anonymous function declarations not supported"),
                },
            &easter::stmt::StmtListItem::Stmt(ref s) =>
                generate_statement(s),
        }
    }
}

fn main() {
    let mut f = File::open("example/test.js").expect("test.js not found");
    let mut contents = String::new();
    f.read_to_string(&mut contents).expect("error reading the file");

    let easter::prog::Script { body: ast, .. } = esprit::script(contents.as_str()).expect("parsing error");

    generate_code(ast);
}
