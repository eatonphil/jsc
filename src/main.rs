use std::fs::File;
use std::io::Read;

extern crate esprit;

fn main() {
    let mut f = File::open("example/test.js").expect("test.js not found");
    let mut contents = String::new();
    f.read_to_string(&mut contents)
        .expect("something went wrong reading the file");

    let ast = esprit::script(contents.as_str());

    println!("{:#?}", ast);
}
