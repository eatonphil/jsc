extern crate easter;

use std::fs::File;
use std::io::Write;
use std::iter;

pub struct CG {
    ast: easter::prog::Script,
    output_file: File,
}

impl CG {
    fn writeln<S>(&self, depth: usize, output: S) where S: Into<String> {
        let indent = 2; // spaces
        let indents = iter::repeat(" ").take(depth * indent).collect::<String>();
        let line = format!("{}{}\n", indents, output.into());
        self.output_file.write_all(line.as_bytes()).expect("failed to write")
    }

    fn generate_function_declaration(
        &self,
        depth: usize,
        id: &easter::id::Id,
        _: &easter::fun::Params,
        body: &Vec<easter::stmt::StmtListItem>
    ) -> String {
        let name: String = if id.is_some() {
            id.name.as_ref().to_string()
        } else {
            "lambda".to_owned()
        };

        self.writeln(depth, format!("void jsc_{}(const FunctionCallbackInfo<Value>& args) {{", name));
        self.writeln(depth + 1, "Isolate* isolate = args.GetIsolate();");

        self.generate_statements(depth + 1, body);

        self.writeln(depth, "}\n");

        format!("jsc_{}", name)
    }

    fn generate_call(&self, depth: usize, expression: &easter::expr::Expr, args: &Vec<easter::expr::Expr>) -> String {
        let fn_name = self.generate_expression(depth, expression);
        self.writeln(depth, format!("Local<FunctionTemplate> tpl_{} = FunctionTemplate::New(isolate, {});", fn_name, fn_name));
        self.writeln(depth, format!("Local<Function> fn_{} = tpl_{}->GetFunction();", fn_name, fn_name));
        self.writeln(depth, format!("fn_{}->SetName(String::NewFromUtf8(isolate, \"{}\"));", fn_name, fn_name));

        let args_len = args.len();
        let mut argv_items = Vec::with_capacity(args_len);
        for (i, arg) in args.iter().enumerate() {
            let arg_holder = self.generate_expression(depth, arg);
            self.writeln(depth, format!("auto arg{} = {};", i, arg_holder));
            argv_items.push(format!("arg{}", i));
        }

        self.writeln(depth, format!("Local<Value> fn_{}_argv[] = {{ {} }};", fn_name, argv_items.join(", ")));
        self.writeln(depth, format!("fn_{}->Call(Null(isolate), {}, fn_{}_argv);", fn_name, args.len(), fn_name));

        fn_name
    }

    fn generate_expression(&self, depth: usize, expression: &easter::expr::Expr) -> String {
        match expression {
            &easter::expr::Expr::Call(_, ref name, ref args) => self.generate_call(depth, name, args),
            &easter::expr::Expr::Id(ref id) => id.name.as_ref().to_string(),
            &easter::expr::Expr::String(_, ref string) => format!("String::NewFromUtf8(isolate, \"{}\")", string.value),
            _ => panic!("found expr: {:#?}", expression),
        }
    }

    fn generate_statement(&self, depth: usize, statement: &easter::stmt::Stmt) {
        match statement {
            &easter::stmt::Stmt::Expr(_, ref e, _) => { self.generate_expression(depth, e); },
            _ => panic!("found stmt: {:#?}", statement),
        }
    }

    pub fn generate_statements(&self, depth: usize, ast: &Vec<easter::stmt::StmtListItem>) -> Vec<String> {
        let mut exports = Vec::new();
        for statement in ast.iter() {
            match statement {
                &easter::stmt::StmtListItem::Decl(easter::decl::Decl::Fun(easter::fun::Fun { ref id, ref params, ref body, .. })) =>
                    match id {
                        &Some(ref id) => {
                            let decl = self.generate_function_declaration(depth, id, params, body);
                            exports.push(decl)
                        },
                        _ => panic!("anonymous function declarations not supported"),
                    },
                &easter::stmt::StmtListItem::Stmt(ref s) =>
                    self.generate_statement(depth, s)
            }
        }

        exports
    }

    fn generate_prefix(&self) {
        self.writeln(0, "#include <iostream>\n");
        self.writeln(0, "#include <node.h>\n");

        self.writeln(1, "using v8::Exception");
        self.writeln(1, "using v8::Function");
        self.writeln(1, "using v8::FunctionTemplate");
        self.writeln(1, "using v8::FunctionCallbackInfo");
        self.writeln(1, "using v8::Isolate");
        self.writeln(1, "using v8::Local");
        self.writeln(1, "using v8::Number");
        self.writeln(1, "using v8::Object");
        self.writeln(1, "using v8::String");
        self.writeln(1, "using v8::Value");

        self.writeln(1, "void jsc_printf(const FunctionCallbackInfo<Value>& args) {");
        self.writeln(2, "String::Utf8Value s(args[0]->ToString())");
        self.writeln(2, "std::string cs = std::string(*s)");
        self.writeln(2, "std::cout << cs");
        self.writeln(1, "}");
    }

    fn generate_postfix(&self, exports: Vec<String>) {
        self.writeln(1, "void Init(Local<Object> exports) {");

        for export in exports.iter() {
            self.writeln(2, format!("NODE_SET_METHOD(exports, \"{}\", {});", export, export));
        }

        self.writeln(1, "}\n");
        self.writeln(1, "NODE_MODULE(NODE_GYP_MODULE_NAME, Init))\n");
    }

    pub fn generate(&self) {
        self.generate_prefix();
        let exports = self.generate_statements(1, &self.ast.body);
        self.generate_postfix(exports);
    }

    pub fn new<S>(ast: easter::prog::Script, output_directory: S, module_name: S) -> CG where S: Into<String> {
        let path = format!("{}/{}.cc", output_directory.into(), module_name.into());
        let error = format!("Unable to create {}", path).as_str();

        CG {
            ast,
            output_file: File::create(path).expect(error)
        }
    }
}
