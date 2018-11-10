use std::fs::File;
use std::io::Write;
use std::process::Command;

fn exec<S>(dir: String, program_s: S, args: Vec<String>) where S: Into<String> {
    let program = program_s.into();
    match Command::new(program.clone()).args(args.clone()).current_dir(dir).output() {
        Err (e) =>
            panic!("Error calling:\n\"{} {:?}\"\n\nGot:\n{}\n", program, args, e),
        Ok (output) => {
            if !output.status.success() {
                panic!("Error calling:\n\"{} {:?}\"\n\nGot:\n{}\n{}\n",
                       program,
                       args,
                       String::from_utf8_lossy(&output.stdout),
                       String::from_utf8_lossy(&output.stderr))
            }
        }
    }
}
pub fn generate_node_entry<S>(dir_s: S, module_s: S) where S: Into<String> {
    let dir = dir_s.into();
    let module = module_s.into();

    let file = format!("{}/{}.js", dir, module);
    let mut entry = File::create(file).expect("error creating js entry");
    let program = format!("require(\"./build/Release/{}\").jsc_main();\n", module);
    entry.write_all(program.as_bytes()).expect("error writing js entry");
}

pub fn build_node<S>(dir_s: S) where S: Into<String> {
    let dir = dir_s.into();

    exec(dir.clone(), "node-gyp", vec!["configure".to_string()]);
    exec(dir, "node-gyp", vec!["build".to_string()]);
}

pub fn build_standalone<S>(dir_s: S, modules: Vec<String>) where S: Into<String> {
    let dir = dir_s.into();

    let mut args: Vec<String> = modules.iter().map(|m| format!("{}.cc", m)).collect();
    let entry = modules[0].as_str();
    // TODO: don't hardcode paths
    let mut rest: Vec<String> = vec!["-o", entry, "-I/usr/local/Cellar/node/11.1.0/include/node", "-ldl", "-pthread", "-std=c++0x"]
        .iter()
        .map(|arg| arg.to_string())
        .collect();
    args.append(&mut rest);

    exec(dir, "g++", args);
}
