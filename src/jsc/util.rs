pub fn indent<S>(depth: usize, output: S) -> String where S: Into<String> {
    let spaces = 2;
    let indents = iter::repeat(" ").take(depth * spaces).collect::<String>();
    format!("{}{}\n", indents, output.into())
}
