use std::fs::File;
use std::io::Read;
use std::string::String;

extern crate easter;
extern crate esprit;

pub fn from_file(the_file: &str) -> easter::stmt::Script {
    let mut f = File::open(the_file)
        .expect(format!("{} not found", the_file).as_str());
    let mut contents = String::new();
    f.read_to_string(&mut contents).expect("error reading input");
    esprit::strict(contents.as_str()).expect("error parsing input")
}
