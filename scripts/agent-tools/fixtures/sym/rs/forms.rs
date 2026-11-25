//! Crate-level docs: not attached to anything.

use std::fmt;

/// Doc line one.
/// Doc line two with a } brace.
#[derive(Debug, Clone)]
#[serde(rename = "x")]
pub struct Config<T>
where
    T: Copy + Default,
{
    pub name: String,
    retries: T,
}

pub struct Unit;
pub struct Tuple(pub u8, String);

impl<T> Config<T>
where
    T: Copy + Default,
{
    /// Builds a config.
    pub fn new(name: &str) -> Self {
        let brace = "}";
        let ch = '}';
        let raw = r#"}"#;
        let _ = (brace, ch, raw);
        Self { name: name.to_string(), retries: T::default() }
    }

    const LIMIT: usize = 3;

    fn private_helper(&self) -> usize {
        Self::LIMIT
    }
}

impl<T: Copy + Default> fmt::Display for Config<T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.name)
    }
}

impl Default for Unit {
    fn default() -> Self { Unit }
}

/// A trait.
pub trait Runner {
    type Output;
    const ID: u32;
    fn run(&self) -> Self::Output;
    fn describe(&self) -> String {
        String::from("runner")
    }
}

macro_rules! square {
    ($x:expr) => {
        $x * $x
    };
}

#[derive(Debug)]
pub(crate) enum Mode {
    Fast,
    Slow(u8),
    Custom { level: i32 },
}

pub union Bits {
    int: u32,
    float: f32,
}

pub type Pair<'a> = (&'a str, &'a str);
pub static GREETING: &str = "hello } world";
const MAX: usize = 10;

pub mod inner {
    pub fn nested_fn<'a, T>(x: &'a T) -> &'a T
    where
        T: ?Sized,
    {
        x
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_new_works() {
        assert_eq!(Config::<u8>::new("a").name, "a");
    }
}

pub async unsafe fn lifetimes<'a>(s: &'a str) -> &'a str {
    let _c = 'x';
    let _d = '\'';
    s
}

extern "C" {
    fn ext_c(a: i32) -> i32;
}
