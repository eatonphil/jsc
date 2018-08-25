use std::fs::File;
use std::io::Write;

extern crate serde_json;

#[derive(Serialize, Debug)]
struct GYPTarget {
    target_name: String,
    sources: Vec<String>,
}

#[derive(Serialize, Debug)]
struct GYPBinding {
    targets: Vec<GYPTarget>,
}

pub fn generate_binding<S>(dir_s: S, modules: Vec<String>) where S: Into<String> {
    let dir = dir_s.into();

    let binding = GYPBinding {
        targets: modules.iter().map(|module| GYPTarget {
            target_name: module.to_owned(),
            sources: [format!("{}.cc", module)].to_vec(),
        }).collect()
    };

    let binding_json = serde_json::to_string_pretty(&binding).expect("Error creating binding json");;

    let file = format!("{}/binding.gyp", dir);
    let mut file = File::create(file).expect("Error creating binding.gyp");
    file.write_all(binding_json.as_bytes()).expect("Error writing binding.gyp");
}
