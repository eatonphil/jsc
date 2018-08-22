use std::env;

mod jsc;

fn main() {
    let args: Vec<String> = env::args().collect();

    let ast = jsc::parser::from_file(args[0]);
    let cg = jsc::cg::CG::new(ast, "cout", "module");
    cg.generate();

    jsc::entry::to_file("cout/main.js");
}
