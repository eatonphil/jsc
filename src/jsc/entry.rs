use std::fs::File;
use std::io::Write;

pub fn generate<S>(dir_s: S, module_s: S) where S: Into<String> {
    let dir = dir_s.into();
    let module = module_s.into();

    let file = format!("{}/{}.js", dir, module);
    let mut entry = File::create(file).expect("error creating js entry");
    let program = format!("require(\"./build/Release/{}\").jsc_main();\n", module);
    entry.write_all(program.as_bytes()).expect("error writing js entry");
}
