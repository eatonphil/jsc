#[macro_use]
extern crate serde_derive;

extern crate easter;
extern crate esprit;

use std::env;
use std::fs;
use std::path::Path;

mod jsc;

fn main() {
    let mut args = env::args();
    let source_entry = args.nth(1).expect("Expected file argument");
    let entry_module = Path::new(source_entry.as_str()).file_stem().unwrap().to_str().unwrap();
    let output_directory = args.nth(0).expect("Expected output directory argument");

    let ast = jsc::parser::from_file(source_entry.as_str());

    if fs::metadata(output_directory.as_str()).is_ok() {
        fs::remove_dir_all(output_directory.as_str()).expect("Unable to remove output directory");
    }
    fs::create_dir_all(output_directory.as_str()).expect("Unable to create output directory");
    
    let cg = jsc::cg::CG::new(ast, output_directory.as_str(), entry_module);
    cg.generate();

    jsc::entry::generate(output_directory.as_str(), entry_module);

    let modules = vec![entry_module.to_string()];
    jsc::gyp::generate_binding(output_directory.as_str(), modules);
}
