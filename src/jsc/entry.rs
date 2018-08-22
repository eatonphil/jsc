use std::fs::File;
use std::io::Write;

pub fn to_file<S>(f: S) where S: Into<String> {
    let js_entry = File::create(f.into()).expect("error creating js entry");
    let js_program = format!("require(\"./build/Release/test\").main();\n").as_bytes();
    js_entry.write_all(js_program).expect("error writing js entry");
}
