use std::fs::File;
use std::io::Write;
use std::iter;

extern crate easter;

pub struct CG {
    ast: easter::prog::Script,
    output_file: File,
    tmp_count: u64,
    tmps: Vec<String>,
}

impl CG {
    fn writeln<S>(&mut self, depth: usize, output: S) where S: Into<String> {
        let indent = 2; // spaces
        let indents = iter::repeat(" ").take(depth * indent).collect::<String>();
        let line = format!("{}{}\n", indents, output.into());
        self.output_file.write_all(line.as_bytes()).expect("failed to write")
    }

    fn generate_tmp<S>(&mut self, prefix_s: S) -> String where S: Into<String> {
        let prefix = prefix_s.into();
        self.tmp_count = self.tmp_count + 1;
        let tmp = format!("{}_{}", prefix, self.tmp_count);
        if self.tmps.contains(&tmp) {
            self.generate_tmp(prefix)
        } else {
            tmp
        }
    }

    fn register_tmp<S>(&mut self, tmp: S) where S: Into<String> {
        self.tmps.push(tmp.into());
    }

    fn generate_function_declaration(
        &mut self,
        depth: usize,
        id: &easter::id::Id,
        _: &easter::fun::Params,
        body: &Vec<easter::stmt::StmtListItem>
    ) {
        let name = if id.is_some() {
            let id = id.name.as_ref();
            if id == "main" {
                "jsc_main"
            } else {
                id
            }
        } else {
            "lambda"
        };

        self.writeln(depth, format!("void {}(const FunctionCallbackInfo<Value>& args) {{", name));
        self.writeln(depth + 1, "Isolate* isolate = args.GetIsolate();");

        self.generate_statements(depth + 1, body);

        self.writeln(depth, "}\n");
    }

    fn generate_call_internal(
        &mut self,
        depth: usize,
        fn_tmp: String,
        id: String,
        args: Vec<String>
    ) -> String {
        self.writeln(depth, format!("{}->SetName(String::NewFromUtf8(isolate, \"{}\"));", fn_tmp, id));

        let argv_tmp = self.generate_tmp("argv");
        self.writeln(depth, format!("Local<Value> {}[] = {{ {} }};", argv_tmp, args.join(", ")));

        let result_tmp = self.generate_tmp("result");
        self.writeln(depth, format!("Local<Value> {} = {}->Call(Null(isolate), {}, {});",
                                    result_tmp,
                                    fn_tmp,
                                    args.len(),
                                    argv_tmp));

        result_tmp        
    }

    fn generate_call(
        &mut self,
        depth: usize,
        expression: &easter::expr::Expr,
        args: &Vec<easter<>::expr::Expr>
    ) -> String {
        let fn_name = self.generate_expression(depth, expression);

        let args_len = args.len();
        let mut argv_items = Vec::with_capacity(args_len);
        for arg in args.iter() {
            let arg_holder = self.generate_expression(depth, arg);
            let tmp = self.generate_tmp("arg");
            self.writeln(depth, format!("Local<Value> {} = {};", tmp, arg_holder));
            argv_items.push(tmp);
        }

        let ftpl_tmp = self.generate_tmp("ftpl");
        let fn_tmp = self.generate_tmp("fn");
        self.writeln(depth, format!("Local<FunctionTemplate> {} = FunctionTemplate::New(isolate, {});",
                                    ftpl_tmp,
                                    fn_name));
        self.writeln(depth, format!("Local<Function> {} = {}->GetFunction();", fn_tmp, ftpl_tmp));

        self.generate_call_internal(depth, fn_tmp, fn_name, argv_items)
    }

    fn generate_binop(
        &mut self,
        depth: usize,
        binop: &easter::punc::Binop,
        exp1: &Box<easter::expr::Expr>,
        exp2: &Box<easter::expr::Expr>
    ) -> String {
        let left = self.generate_expression(depth, &exp1);
        let right = self.generate_expression(depth, &exp2);
        let op = match binop.tag {
            easter::punc::BinopTag::Eq => "jsc_eq",
            easter::punc::BinopTag::NEq => "jsc_neq",
            easter::punc::BinopTag::StrictEq => "jsc_strict_eq",
            easter::punc::BinopTag::StrictNEq => "jsc_strict_neq",
            easter::punc::BinopTag::Lt => "jsc_lt",
            easter::punc::BinopTag::LEq => "jsc_leq",
            easter::punc::BinopTag::Gt => "jsc_gt",
            easter::punc::BinopTag::GEq => "jsc_geq",
            easter::punc::BinopTag::LShift => "jsc_lshift",
            easter::punc::BinopTag::RShift => "jsc_shift",
            easter::punc::BinopTag::URShift => "jsc_urshift",
            easter::punc::BinopTag::Plus => "jsc_plus",
            easter::punc::BinopTag::Minus => "jsc_minus",
            easter::punc::BinopTag::Times => "jsc_times",
            easter::punc::BinopTag::Div => "jsc_div",
            easter::punc::BinopTag::Mod => "jsc_mod",
            easter::punc::BinopTag::BitOr => "jsc_bit_or",
            easter::punc::BinopTag::BitXor => "jsc_bit_xor",
            easter::punc::BinopTag::BitAnd => "jsc_bit_and",
            easter::punc::BinopTag::In => "in",
            easter::punc::BinopTag::Instanceof => "instanceof",
        };

        format!("{}(isolate, {}, {})", op, left, right)
    }

    fn generate_expression(&mut self, depth: usize, expression: &easter::expr::Expr) -> String {
        match expression {
            &easter::expr::Expr::Call(_, ref name, ref args) =>
                self.generate_call(depth, name, args),
            &easter::expr::Expr::Id(ref id) =>
                id.name.as_ref().to_string(),
            &easter::expr::Expr::String(_, ref string) =>
                format!("String::NewFromUtf8(isolate, \"{}\")",
                        string.value
                        .replace("\n", "\\n")
                        .replace("\t", "\\t")
                        .replace("\r", "\\r")),
            &easter::expr::Expr::Number(_, ref number) =>
                format!("Number::New(isolate, {})", number.value),
            &easter::expr::Expr::Binop(_, ref op, ref exp1, ref exp2) =>
                self.generate_binop(depth, op, exp1, exp2),
            _ =>
                panic!("Got expression: {:#?}", expression),
        }
    }

    fn generate_declaration(
        &mut self,
        depth: usize,
        id: &easter::id::Id,
        expression: &Option<easter::expr::Expr>
    ) {
        let suffix = match expression {
            &Some (ref exp) => {
                let generated = self.generate_expression(depth, &exp);
                format!(" = {}", generated)
            },
            _ => "".to_string(),
        };
        let tmp = id.name.as_ref();
        self.register_tmp(tmp);
        self.writeln(depth, format!("Local<Value> {}{};", tmp, suffix));
    }

    fn generate_destructor(&mut self, depth: usize, destructor: &easter::decl::Dtor) {
        match destructor {
            &easter::decl::Dtor::Simple(_, ref id, ref expr_opt) => self.generate_declaration(depth, id, expr_opt),
            _ => panic!("found destructor: {:#?}", destructor),
        }
    }

    fn generate_return(&mut self, depth: usize, expression: &Option<easter::expr::Expr>) {
        let result = match expression {
            &Some (ref exp) => self.generate_expression(depth, exp),
            _ => "v8::Null".to_string()
        };

        self.writeln(depth, format!("args.GetReturnValue().Set({});", result));
    }

    fn generate_condition(
        &mut self,
        depth: usize,
        test: &easter::expr::Expr,
        ok: &easter::stmt::Stmt,
        nok: &Option<Box<easter::stmt::Stmt>>
    ) {
        let ctx_tmp = self.generate_tmp("ctx");
        let global_tmp = self.generate_tmp("global");
        let boolean_tmp = self.generate_tmp("Boolean");

        self.writeln(depth, format!("Local<Context> {} = isolate->GetCurrentContext();",
                                    ctx_tmp));
        self.writeln(depth, format!("Local<Object> {} = {}->Global();",
                                    global_tmp,
                                    ctx_tmp));
        self.writeln(depth, format!("Local<Function> {} = Local<Function>::Cast({}->Get(String::NewFromUtf8(isolate, \"Boolean\")));",
                                    boolean_tmp,
                                    global_tmp));

        let test_result = self.generate_expression(depth, test);
        let result = self.generate_call_internal(
            depth,
            boolean_tmp,
            "Boolean".to_string(),
            vec![test_result]);

        self.writeln(depth, format!("if ({}->ToBoolean()->Value()) {{", result));
        self.generate_statement(depth + 1, ok);

        match nok {
            &Some (ref stmt) => {
                self.writeln(depth, "} else {");
                self.generate_statement(depth + 1, stmt);
            },
            _ => ()
        };

        self.writeln(depth, "}");
    }

    fn generate_statement(
        &mut self,
        depth: usize,
        statement: &easter::stmt::Stmt
    ) {
        match statement {
            &easter::stmt::Stmt::Expr(_, ref e, _) => {
                self.generate_expression(depth, e);
            },
            &easter::stmt::Stmt::Var(_, ref destructors, _) => {
                for destructor in destructors {
                    self.generate_destructor(depth, destructor);
                }
            },
            &easter::stmt::Stmt::Return(_, ref result, _) =>
                self.generate_return(depth, result),
            &easter::stmt::Stmt::If(_, ref test, ref ok, ref nok) =>
                self.generate_condition(depth, test, ok, nok),
            &easter::stmt::Stmt::Block(_, ref statements) =>
                self.generate_statements(depth, statements),
            _ => panic!("found stmt: {:#?}", statement),
        }
    }

    pub fn generate_statements(
        &mut self,
        depth: usize,
        ast: &Vec<easter::stmt::StmtListItem>
    ) {
        for statement in ast.iter() {
            match statement {
                &easter::stmt::StmtListItem::Decl(
                    easter::decl::Decl::Fun(
                        easter::fun::Fun { ref id, ref params, ref body, .. })) =>
                    match id {
                        &Some(ref id) => self.generate_function_declaration(depth, id, params, body),
                        _ => panic!("anonymous function declarations not supported")
                    },
                &easter::stmt::StmtListItem::Stmt(ref s) =>
                    self.generate_statement(depth, s)
            }
        }
    }

    fn generate_prefix(&mut self) {
        self.writeln(0, "#include <iostream>\n");
        self.writeln(0, "#include <node.h>\n");

        self.writeln(0, "using v8::Context;");
        self.writeln(0, "using v8::Exception;");
        self.writeln(0, "using v8::Function;");
        self.writeln(0, "using v8::FunctionTemplate;");
        self.writeln(0, "using v8::FunctionCallbackInfo;");
        self.writeln(0, "using v8::Isolate;");
        self.writeln(0, "using v8::Local;");
        self.writeln(0, "using v8::Null;");
        self.writeln(0, "using v8::Number;");
        self.writeln(0, "using v8::Object;");
        self.writeln(0, "using v8::String;");
        self.writeln(0, "using v8::Value;\n");

        self.writeln(0, "
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
");
    }

    fn generate_postfix(&mut self, depth: usize) {
        self.writeln(depth, "void Init(Local<Object> exports) {");
        self.writeln(depth + 1, "NODE_SET_METHOD(exports, \"jsc_main\", jsc_main);");
        self.writeln(depth, "}\n");
        self.writeln(depth, "NODE_MODULE(NODE_GYP_MODULE_NAME, Init)");
    }

    pub fn generate(&mut self) {
        self.generate_prefix();

        // Need to work around a mix of immutable and mutable use of self to
        // grab ast here and call generate_statements later.
        let mut body = Vec::new();
        while self.ast.body.len() > 0 {
            body.push(self.ast.body.remove(0));
        }

        self.generate_statements(0, &body);
        self.generate_postfix(0);
    }

    pub fn new<S>(ast: easter::prog::Script, output_directory: S, module_name: S) -> CG where S: Into<String> {
        let path = format!("{}/{}.cc", output_directory.into(), module_name.into());
        let error = format!("Unable to create {}", path);

        CG {
            ast,
            output_file: File::create(path).expect(error.as_str()),
            tmp_count: 0,
            tmps: Vec::new()
        }
    }
}
