pub fn print_binop(
    depth: usize,
    expr: &easter::expr::Expr,
) -> String {
    
}

pub fn print_assop(
    depth: usize,
    expr: &easter::expr::Expr,
) -> String {
    
}

pub fn print_binassop(
    depth: usize,
    expr: &easter::expr::Expr,
) -> String {
    
}

pub fn print_expression(
    depth: usize,
    expr: &easter::expr::Expr,
) -> String {
    match expression {
        &easter::expr::Expr::Call(_, ref name, ref args) =>
            format!("{}({})", print_expression(depth, name), iter::map(&args, |arg| print_expression(depth, arg)).join(", ")),
        &easter::expr::Expr::Null(_) => "null",
        &easter::expr::Expr::Id(ref id) => id.name.as_ref(),
        &easter::expr::Expr::String(_, ref string) => string,
        &easter::expr::Expr::Number(_, ref number) => number.value.to_string(),
        &easter::expr::Expr::Binop(_, ref op, ref exp1, ref exp2) =>
            self.print_binop(depth, op, exp1, exp2),
        &easter::expr::Expr::Dot(_, ref object, ref accessor) =>
            format!("{}.{}", print_expression(depth, object), print_expression(depth, accessor)),
        &easter::expr::Expr::BinAssign(_, ref assop, ref target, ref body) =>
            self.print_binassign(depth, assop, target, body),
        &easter::expr::Expr::Assign(_, ref target_patt, ref body) =>
            match target_patt {
                &easter::patt::Patt::Simple (ref target) =>
                    self.print_assign(depth, None, target, body, scope),
                _ => ""
            },
        &easter::expr::Expr::True(_) => "true",
        &easter::expr::Expr::False(_) => "false",
        &easter::expr::Expr::Arr(_, ref elements) =>
            format!("[{}]", elements.map(|element| print_expression(depth, element)).join(", ")),
        &easter::expr::Expr::Brack(_, ref object, ref accessor) =>
            format!("{}[{}]", print_expression(depth, object), print_expression(depth, accessor)),
        _ => ""
    }
}

pub fn print_return(
    depth: usize,
    expr: &easter::expr::Expr,
) -> String {
    format!("return {}", self.print_expression(depth, expr))
}

pub fn print_statement(
    depth: usize,
    stmt: &easter::stmt::Stmt,
) -> Vec<String> {
    match statement {
        &easter::stmt::Stmt::Expr(_, ref e, _) =>
            [self.print_expression(depth, stmt)],
        &easter::stmt::Stmt::Var(_, ref destructors, _) =>
            iter::Iterator::map(&destructors, |d| self.print_destructor(depth, d)),
        &easter::stmt::Stmt::Return(_, ref result, _) =>
            [self.print_return(depth, result)],
        _ => []
    }
}
