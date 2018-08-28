use std::fs::File;
use std::io::Write;
use std::iter;

extern crate easter;

pub struct CG {
    ast: easter::prog::Script,
    output_file: File,
    tmp_count: u64,
    tmps: Vec<String>,
    use_node: bool,
    generated_funcs: Vec<String>
}

struct TCO {
    name: String,
    params: Vec<String>,
    in_return: bool
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
        params: &easter::fun::Params,
        body: &Vec<easter::stmt::StmtListItem>,
        _: &Option<TCO>
    ) {
        let name = if id.is_some() {
            let id = id.name.as_ref();
            if id == "main" {
                "jsc_main"
            } else {
                self.generated_funcs.push(id.to_string());
                id
            }
        } else {
            "lambda"
        };

        self.writeln(depth, format!("void {}(const FunctionCallbackInfo<Value>& args) {{", name));
        self.writeln(depth + 1, "Isolate* isolate = args.GetIsolate();");

        let mut param_strings = Vec::new();
        for (i, param) in params.list.iter().enumerate() {
            match param {
                &easter::patt::Patt::Simple (ref id) => {
                    param_strings.push(id.name.as_ref().to_string());
                    self.writeln(
                        depth + 1,
                        format!("Local<Value> {} = args[{}];",
                                id.name.as_ref(),
                                i));
                },
                _ =>
                    panic!("Received complex param (involving destructuring)"),
            }
        }

        let tail_recurse_label = self.generate_tmp("tail_recurse");
        self.writeln(0, format!("{}:", tail_recurse_label));

        self.generate_statements(depth + 1, body, &Some (TCO {
            name: tail_recurse_label,
            params: param_strings,
            in_return: false,
        }));

        self.writeln(depth, "}\n");
    }

    // TODO: this cannot generate dependencies or all expressions must be treated as such
    fn generate_call_internal(
        &mut self,
        depth: usize,
        fn_tmp: String,
        args: Vec<String>,
        tco: &Option<TCO>
    ) -> String {
        match tco {
            &Some (TCO { in_return: true, ref params, ref name }) => {
                for (i, arg) in args.iter().enumerate() {
                    self.writeln(depth, format!("{} = {};", params[i], arg));
                }

                self.writeln(depth, format!("goto {};", name));

                "".to_string()
            },
            _ => {
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
        }
    }

    fn generate_call(
        &mut self,
        depth: usize,
        expression: &easter::expr::Expr,
        args: &Vec<easter<>::expr::Expr>,
        tco: &Option<TCO>
    ) -> String {
        let fn_name = self.generate_expression(depth, expression, &None);

        let args_len = args.len();
        let mut argv_items = Vec::with_capacity(args_len);
        for arg in args.iter() {
            let arg_holder = self.generate_expression(depth, arg, &None);
            let tmp = self.generate_tmp("arg");
            self.writeln(depth, format!("Local<Value> {} = {};", tmp, arg_holder));
            argv_items.push(tmp);
        }

        let fn_tmp = self.generate_tmp("fn");
        // Should check only within this scope?
        if self.generated_funcs.contains(&fn_name) {
            let ftpl_tmp = self.generate_tmp("ftpl");
            self.writeln(depth, format!("Local<FunctionTemplate> {} = FunctionTemplate::New(isolate, {});",
                                        ftpl_tmp,
                                        fn_name));
            self.writeln(depth, format!("Local<Function> {} = {}->GetFunction();", fn_tmp, ftpl_tmp));
            self.writeln(depth, format!("{}->SetName(String::NewFromUtf8(isolate, \"{}\"));", fn_tmp, fn_name));
        } else {
            self.writeln(depth, format!("Local<Function> {} = Local<Function>::Cast({});", fn_tmp, fn_name));
        }

        self.generate_call_internal(depth, fn_tmp, argv_items, tco)
    }

    fn generate_number_op(
        &mut self,
        op: &str,
        left: String,
        right: String,
    ) -> String {
        let number_check = format!("{}->IsNumber() || {}->IsNumber()", left, right);
        let number_case = format!("Number::New(isolate, {}->ToNumber(isolate)->Value() {} {}->ToNumber(isolate)->Value())", left, op, right);

        // TODO: find NaN value
        format!("({}) ? ({}) : Local<Number>::Cast(Null(isolate))",
                number_check,
                number_case)
    }

    fn generate_generic_op(
        &mut self,
        string_case: String,
        number_op: &str,
        left: String,
        right: String,
    ) -> String {
        let string_check = format!("{}->IsString() || {}->IsString()", left, right);

        format!("({}) ? Local<Value>::Cast({}) : Local<Value>::Cast({})",
                string_check,
                string_case,
                self.generate_number_op(number_op, left, right))
    }

    fn generate_plus(
        &mut self,
        left: String,
        right: String
    ) -> String {
        let string_case = format!("String::Concat({}->ToString(), {}->ToString())", left, right);
        let number_op = "+";

        self.generate_generic_op(string_case, number_op, left, right)
    }

    fn generate_minus(
        &mut self,
        left: String,
        right: String
    ) -> String {
        self.generate_number_op("-", left, right)
    }

    // TODO: support non numbers
    fn generate_leq(
        &mut self,
        left: String,
        right: String
    ) -> String {
        self.generate_number_op("<=", left, right)
    }

    // TODO: support non numbers
    fn generate_geq(
        &mut self,
        left: String,
        right: String
    ) -> String {
        self.generate_number_op(">=", left, right)
    }

    fn generate_lt(
        &mut self,
        left: String,
        right: String
    ) -> String {
        self.generate_number_op("<", left, right)
    }

    fn generate_gt(
        &mut self,
        left: String,
        right: String
    ) -> String {
        self.generate_number_op(">", left, right)
    }

    // TODO: deal with string case
    fn generate_eq(
        &mut self,
        left: String,
        right: String
    ) -> String {
        self.generate_number_op("==", left, right)
    }

    fn generate_neq(
        &mut self,
        left: String,
        right: String,
    ) -> String {
        self.generate_number_op("!=", left, right)
    }

    fn generate_binop(
        &mut self,
        depth: usize,
        binop: &easter::punc::Binop,
        exp1: &Box<easter::expr::Expr>,
        exp2: &Box<easter::expr::Expr>
    ) -> String {
        let left = self.generate_expression(depth, &exp1, &None);
        let right = self.generate_expression(depth, &exp2, &None);
        match binop.tag {
            easter::punc::BinopTag::Eq => self.generate_eq(left, right),
            easter::punc::BinopTag::NEq => self.generate_neq(left, right),
            easter::punc::BinopTag::Plus => self.generate_plus(left, right),
            easter::punc::BinopTag::Minus => self.generate_minus(left, right),
            easter::punc::BinopTag::LEq => self.generate_leq(left, right),
            easter::punc::BinopTag::GEq => self.generate_geq(left, right),
            easter::punc::BinopTag::Lt => self.generate_lt(left, right),
            easter::punc::BinopTag::Gt => self.generate_gt(left, right),
            _ => panic!("Unsupported operator: {:?}", binop.tag)
        }
    }

    fn generate_dot(
        &mut self,
        depth: usize,
        object: &easter::expr::Expr,
        accessor: &easter::obj::DotKey
    ) -> String {
        let exp = self.generate_expression(depth, object, &None);
        format!("Local<Object>::Cast({})->Get(String::NewFromUtf8(isolate, \"{}\"))",
                exp,
                accessor.value)
    }

    fn generate_assign(
        &mut self,
        depth: usize,
        assop: &easter::punc::Assop,
        patt: &easter::patt::AssignTarget,
        body: &easter::expr::Expr
    ) -> String {
        let op = match assop.tag {
            easter::punc::AssopTag::Eq => "=",
            easter::punc::AssopTag::PlusEq => "+=",
            easter::punc::AssopTag::MinusEq => "-=",
            easter::punc::AssopTag::TimesEq => "*=",
            easter::punc::AssopTag::DivEq => "/=",
            easter::punc::AssopTag::ModEq => "%=",
            easter::punc::AssopTag::LShiftEq => "<<=",
            easter::punc::AssopTag::RShiftEq => ">>=",
            easter::punc::AssopTag::URShiftEq => ">>>=",
            easter::punc::AssopTag::BitOrEq => "|=",
            easter::punc::AssopTag::BitXorEq => "^=",
            easter::punc::AssopTag::BitAndEq => "&="
        };

        let target: String = match patt {
            &easter::patt::AssignTarget::Id (ref id) =>
                id.name.as_ref().to_string(),
            _ =>
                panic!("Unsupported assign target: {:#?}", assop.tag)
        };

        let body_gen = self.generate_expression(depth, body, &None);

        format!("{} {} {}", target, op, body_gen)
    }

    fn generate_expression(
        &mut self,
        depth: usize,
        expression: &easter::expr::Expr,
        tco: &Option<TCO>
    ) -> String {
        match expression {
            &easter::expr::Expr::Call(_, ref name, ref args) =>
                self.generate_call(depth, name, args, tco),
            &easter::expr::Expr::Id(ref id) =>
                match id.name.as_ref() {
                    "console" => "isolate->GetCurrentContext()->Global()->Get(String::NewFromUtf8(isolate, \"console\"))",
                    "global" => "isolate->GetCurrentContext()->Global()",
                    other => other
                }.to_string(),
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
            &easter::expr::Expr::Dot(_, ref object, ref accessor) =>
                self.generate_dot(depth, object, accessor),
            &easter::expr::Expr::Assign(_, ref assop, ref target_patt, ref body) =>
                match target_patt {
                    &easter::patt::Patt::Simple (ref target) =>
                        self.generate_assign(depth, assop, &target, body),
                    _ =>
                        panic!("Got complex assignment (destructuring): {:#?}", expression)
                },
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
                let generated = self.generate_expression(depth, &exp, &None);
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

    fn generate_return(
        &mut self,
        depth: usize,
        expression: &Option<easter::expr::Expr>,
        tco: &Option<TCO>
    ) {
        let result = match expression {
            &Some (ref exp) => {
                let tco_in_return = match tco {
                    &Some (TCO { ref name, ref params, .. }) => Some (TCO {
                        name: name.clone(),
                        params: params.clone(),
                        in_return: true
                    }),
                    _ => None
                };
                self.generate_expression(depth, exp, &tco_in_return)
            },
            _ => "v8::Null".to_string()
        };

        // TCO not invoked
        if result != "" {
            self.writeln(depth, format!("args.GetReturnValue().Set({});", result));
            self.writeln(depth, "return;");
        }
    }

    fn generate_test(
        &mut self,
        depth: usize,
        test: &easter::expr::Expr
    ) -> String {
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

        let test_result = self.generate_expression(depth, test, &None);
        let result = self.generate_call_internal(
            depth,
            boolean_tmp,
            vec![test_result],
            &None);

        result
    }

    fn generate_condition(
        &mut self,
        depth: usize,
        test: &easter::expr::Expr,
        ok: &easter::stmt::Stmt,
        nok: &Option<Box<easter::stmt::Stmt>>,
        tco: &Option<TCO>
    ) {
        let result = self.generate_test(depth, test);

        self.writeln(depth, format!("if ({}->ToBoolean()->Value()) {{", result));
        self.generate_statement(depth + 1, ok, tco);
        self.writeln(depth + 1, "return;");

        match nok {
            &Some (ref stmt) => {
                self.writeln(depth, "} else {");
                self.generate_statement(depth + 1, stmt, tco);
            },
            _ => ()
        };

        self.writeln(depth, "}");
    }

    fn generate_while(
        &mut self,
        depth: usize,
        test: &easter::expr::Expr,
        body: &Box<easter::stmt::Stmt>,
        tco: &Option<TCO>
    ) {
        let result = self.generate_test(depth, test);
        self.writeln(depth, format!("while ({}->ToBoolean()->Value()) {{", result));
        self.generate_statement(depth + 1, body, tco);
        let next = self.generate_test(depth + 1, test);
        self.writeln(depth + 1, format!("{} = {};", result, next));
        self.writeln(depth, "}");
    }

    fn generate_statement(
        &mut self,
        depth: usize,
        statement: &easter::stmt::Stmt,
        tco: &Option<TCO>
    ) {
        match statement {
            &easter::stmt::Stmt::Expr(_, ref e, _) => {
                let gen = self.generate_expression(depth, e, tco);
                self.writeln(depth, format!("{};", gen));
            },
            &easter::stmt::Stmt::Var(_, ref destructors, _) => {
                for destructor in destructors {
                    self.generate_destructor(depth, destructor);
                }
            },
            &easter::stmt::Stmt::Return(_, ref result, _) =>
                self.generate_return(depth, result, tco),
            &easter::stmt::Stmt::If(_, ref test, ref ok, ref nok) =>
                self.generate_condition(depth, test, ok, nok, tco),
            &easter::stmt::Stmt::While(_, ref test, ref body) =>
                self.generate_while(depth, test, body, tco),
            &easter::stmt::Stmt::Block(_, ref statements) =>
                self.generate_statements(depth, statements, tco),
            _ => panic!("found stmt: {:#?}", statement),
        }
    }

    fn generate_statements(
        &mut self,
        depth: usize,
        ast: &Vec<easter::stmt::StmtListItem>,
        tco: &Option<TCO>
    ) {
        let len = ast.len();
        for (i, statement) in ast.iter().enumerate() {
            match statement {
                &easter::stmt::StmtListItem::Decl(
                    easter::decl::Decl::Fun(
                        easter::fun::Fun { ref id, ref params, ref body, .. })) =>
                    match id {
                        &Some(ref id) => self.generate_function_declaration(depth, id, params, body, &None),
                        _ => panic!("anonymous function declarations not supported")
                    },
                &easter::stmt::StmtListItem::Stmt(ref s) =>
                    self.generate_statement(depth, s, if i == len - 1 { tco } else { &None })
            }
        }
    }

    fn generate_prefix(&mut self) {
        if self.use_node {
            self.writeln(0, "\n#include <node.h>\n");
        } else {
            self.writeln(0, "#include <stdio.h>");
            self.writeln(0, "#include <stdlib.h>");
            self.writeln(0, "#include <string.h>\n");

            self.writeln(0, "#include <libplatform.h>");
            self.writeln(0, "#include <v8.h>\n");
        }

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
    }

    fn generate_postfix(&mut self) {
        if self.use_node {
            self.writeln(0, "void Init(Local<Object> exports) {");
            self.writeln(1, "NODE_SET_METHOD(exports, \"jsc_main\", jsc_main);");
            self.writeln(0, "}\n");
            self.writeln(0, "NODE_MODULE(NODE_GYP_MODULE_NAME, Init)");
        } else {
            self.writeln(0, "
int main(int argc, char* argv[]) {
  int exit_code;
  
  // Initialize V8.
  v8::V8::InitializeICUDefaultLocation(argv[0]);
  v8::V8::InitializeExternalStartupData(argv[0]);
  std::unique_ptr<v8::Platform> platform = v8::platform::NewDefaultPlatform();
  v8::V8::InitializePlatform(platform.get());
  v8::V8::Initialize();
  
  // Create a new Isolate and make it the current one.
  v8::Isolate::CreateParams create_params;
  create_params.array_buffer_allocator =
      v8::ArrayBuffer::Allocator::NewDefaultAllocator();
  v8::Isolate* isolate = v8::Isolate::New(create_params);
  
  {
    v8::Isolate::Scope isolate_scope(isolate);
    // Create a stack-allocated handle scope.
    v8::HandleScope handle_scope(isolate);
    // Create a new context.
    v8::Local<v8::Context> context = v8::Context::New(isolate);
    // Enter the context for compiling and running the hello world script.
    v8::Context::Scope context_scope(context);

    {
      Local<FunctionTemplate> entry_fntpl = FunctionTemplate::New(isolate, __jsc_main);
      Local<Function> entry_fn = entry_fntpl->GetFunction();

      // TODO: pass args
      Local<Value> result = entry_fn->Call(Null(isolate), 0, 0);
      exit_code = result->ToNumber(isolate)->Value();
    }
  }
  
  isolate->Dispose();
  v8::V8::Dispose();
  v8::V8::ShutdownPlatform();
  delete create_params.array_buffer_allocator;
  return exit_code;
}
");
        }
    }

    pub fn generate(&mut self) {
        self.generate_prefix();

        // Need to work around a mix of immutable and mutable use of self to
        // grab ast here and call generate_statements later.
        let mut body = Vec::new();
        while self.ast.body.len() > 0 {
            body.push(self.ast.body.remove(0));
        }

        self.generate_statements(0, &body, &None);
        self.generate_postfix();
    }

    pub fn new<S>(
        ast: easter::prog::Script,
        output_directory: S,
        module_name: S,
        use_node: bool
    ) -> CG where S: Into<String> {
        let path = format!("{}/{}.cc", output_directory.into(), module_name.into());
        let error = format!("Unable to create {}", path);

        CG {
            use_node,
            ast,
            output_file: File::create(path).expect(error.as_str()),
            tmp_count: 0,
            tmps: Vec::new(),
            generated_funcs: Vec::new()
        }
    }
}
