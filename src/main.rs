#[macro_use]
extern crate serde_derive;

extern crate clap;
extern crate easter;
extern crate esprit;

use std::fs;
use std::path::Path;

mod jsc;

fn main() {
    let args = clap::App::new("jsc")
        .version("0.1.0")
        .arg(clap::Arg::with_name("entry")
             .long("entry")
             .takes_value(true)
             .required(true))
        .arg(clap::Arg::with_name("out_dir")
             .long("out_dir")
             .takes_value(true)
             .required(true))
        .arg(clap::Arg::with_name("target")
             .long("target")
             .takes_value(true)
             .possible_values(&["node-lib", "node-program", "standalone"]))
        .get_matches();

    let source_entry: String = args.value_of("entry").unwrap().to_string();
    let output_directory: String = args.value_of("out_dir").unwrap().to_string();
    let target: String = args.value_of("target").unwrap().to_string();

    if fs::metadata(output_directory.as_str()).is_ok() {
        fs::remove_dir_all(output_directory.as_str()).expect("Unable to remove output directory");
    }
    fs::create_dir_all(output_directory.as_str()).expect("Unable to create output directory");

    let entry_module = Path::new(source_entry.as_str()).file_stem().unwrap().to_str().unwrap();
    let ast = jsc::parser::from_file(source_entry.as_str());
    let mut cg = jsc::cg::CG::new(ast, output_directory.as_str(), entry_module, target != "standalone");
    cg.generate();

    let modules = vec![entry_module.to_string()];

    match target.as_str() {
        "standalone" =>
            jsc::build::build_standalone(output_directory.as_str(), modules.clone()),
        _ => {
            jsc::gyp::generate_binding(output_directory.as_str(), modules.clone());

            if target == "node-program" {
                jsc::build::generate_node_entry(output_directory.as_str(), entry_module);
            }

            jsc::build::build_node(output_directory.as_str());
        },
    }
}
