use std::iter::*;

use ::jsc::util;

pub trait Printer {
    fn print(&self, depth: usize) -> String;
}

impl Printer for Vec<easter::expr::ExprListItem> {
    fn print(&self, depth: usize) -> String {
        self.iter()
            .filter_map(|maybe_arg| match maybe_arg {
                easter::expr::ExprListItem::Expr(arg) =>
                    Some(arg.print(depth)),
                _ =>
                    None,
            })
            .collect::<Vec<String>>()
            .join(", ")
    }
}

impl Printer for Vec<Option<easter::expr::ExprListItem>> {
    fn print(&self, depth: usize) -> String {
        self.iter()
            .filter_map(|maybe| maybe.clone())
            .collect::<Vec<easter::expr::ExprListItem>>()
            .print(depth)
    }
}

impl Printer for Vec<easter::decl::Dtor> {
    fn print(&self, depth: usize) -> String {
        format!("var {};",
                self.iter()
                .map(|d| match d {
                    easter::decl::Dtor::Simple(_, ref id, Some(ref value)) =>
                        format!("{} = {}", id.name.as_ref().to_string(), value.print(depth)),
                    easter::decl::Dtor::Simple(_, ref id, None) =>
                        format!("{}", id.name.as_ref().to_string()),
                    _ => "<compound-assignment-printer-unsupport>".to_string(),
                })
                .collect::<Vec<String>>()
                .join(",  \n"))
    }
}

impl Printer for easter::patt::AssignTarget {
    fn print(&self, depth: usize) -> String {
        match self {
            easter::patt::AssignTarget::Id(id) =>
                id.name.as_ref().to_string(),
            easter::patt::AssignTarget::Dot(_, ref object, ref accessor) =>
                format!("{}.{}", object.print(depth), accessor.value),
            easter::patt::AssignTarget::Brack(_, ref object, ref accessor) =>
                format!("{}[{}]", object.print(depth), accessor.print(depth)),
        }
    }
}

impl Printer for easter::expr::Expr {
    fn print(&self, depth: usize) -> String {
        match self {
            easter::expr::Expr::Call(_, ref name, ref args) =>
                format!("{}({})", name.print(depth), args.print(depth)),
            easter::expr::Expr::Null(_) => "null".to_string(),
            easter::expr::Expr::Id(ref id) => id.name.as_ref().to_string(),
            easter::expr::Expr::String(_, ref string) => string.value.clone(),
            easter::expr::Expr::Number(_, ref number) => number.value.to_string(),
            easter::expr::Expr::Binop(_, ref op, ref exp1, ref exp2) =>
                format!("{} {} {}", op, exp1.print(depth), exp2.print(depth)),
            easter::expr::Expr::Dot(_, ref object, ref accessor) =>
                format!("{}.{}", object.print(depth), accessor.value),
            easter::expr::Expr::BinAssign(_, ref assop, ref target, ref value) =>
                format!("{} {} {}", target.print(depth), assop, value.print(depth)),
            easter::expr::Expr::Assign(_, ref target_patt, ref body) =>
                match target_patt {
                    easter::patt::Patt::Simple (ref target) =>
                        format!("{} = {}", target.print(depth), body.print(depth)),
                    _ => "".to_string(),
                },
            easter::expr::Expr::True(_) => "true".to_string(),
            easter::expr::Expr::False(_) => "false".to_string(),
            easter::expr::Expr::Arr(_, ref elements) =>
                format!("[{}]", elements.print(depth)),
            easter::expr::Expr::Brack(_, ref object, ref accessor) =>
                format!("{}[{}]", object.print(depth), accessor.print(depth)),
            _ => "".to_string(),
        }
    }
}

impl Printer for easter::stmt::Stmt {
    fn print(&self, depth: usize) -> String {
        match self {
            easter::stmt::Stmt::Expr(_, ref e, _) =>
                e.print(depth),
            easter::stmt::Stmt::Var(_, ref destructors, _) =>
                destructors.print(depth),
            easter::stmt::Stmt::Return(_, Some(ref result), _) =>
                format!("return {};", result.print(depth)),
            easter::stmt::Stmt::Return(_, None, _) =>
                "return;".to_string(),
            _ => "".to_string(),
        }
    }
}

// Variation when using `let ...`
impl Printer for easter::decl::Dtor {
    fn print(&self, depth: usize) -> String {
        match self {
            easter::decl::Dtor::Simple(_, ref id, Some(ref value)) =>
                format!("let {} = {};", id.name.as_ref().to_string(), value.print(depth)),
            easter::decl::Dtor::Simple(_, ref id, None) =>
                format!("let {};", id.name.as_ref().to_string()),
            _ => "<compound-assignment-printer-unsupport>".to_string(),
        }        
    }
}

pub fn print_source<Writer: FnMut(String), P: Printer>(
    depth: usize,
    printable: P,
    mut write: Writer,
) {
    let source = printable.print(0);
    let lines = source.split("\n").collect::<Vec<&str>>();
    lines.iter().for_each(|line| if !line.is_empty() {
        write(util::indent(depth, format!("// {}", line)))
    });
}
