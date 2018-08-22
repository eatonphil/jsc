use std::fs::File;
use std::io::Read;
use std::string::String;

extern crate easter;
extern crate esprit;

pub fn from_file<S>(the_file: S) -> easter::prog::Script where S: Into<String> {
    let mut f = File::open(the_file.into())
        .expect(format!("{} not found", the_file.into()).as_str());
    let mut contents = String::new();
    f.read_to_string(&mut contents).expect("error reading input");
    esprit::script(contents.as_str()).expect("error parsing input")
}
