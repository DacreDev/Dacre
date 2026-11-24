import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import * as SymbolParser from "./symbolParser.ts";
import { type SymbolLanguage, symbolLanguageForPath } from "./symbolQueries.ts";

const parse = (language: SymbolLanguage, source: string) =>
  SymbolParser.make([language]).pipe(
    Effect.flatMap((parser) => parser.parse(language, source)),
    Effect.scoped,
    Effect.provide(NodeServices.layer),
  );

const outline = (symbols: ReadonlyArray<SymbolParser.ParsedSymbol>) =>
  symbols
    .map((symbol) => [symbol.name, symbol.kind, symbol.line, symbol.container] as const)
    .toSorted((left, right) => left[2] - right[2]);

const typescript = `export interface Shape {
  area(): number;
}
export type Id = string;
export enum Color {
  Red,
}
export abstract class Base {
  abstract name(): string;
}
export class Circle extends Base implements Shape {
  constructor(readonly radius: number) {
    super();
  }
  area() {
    return Math.PI * this.radius ** 2;
  }
  name() {
    return "circle";
  }
}
export function makeCircle(radius: number) {
  return new Circle(radius);
}
export const unit = makeCircle(1);
export const double = (value: number) => value * 2;
namespace Geometry {
  export const origin = 0;
}
declare function external(): void;
let mutable = 1;
`;

const tsx = `export function Button(props: { label: string }) {
  return <button>{props.label}</button>;
}
export const Link = () => <a href="/">home</a>;
`;

const javascript = `const API_URL = "https://example.test";

function fetchUser(id) {
  return fetch(\`\${API_URL}/users/\${id}\`);
}

const formatName = (user) => user.name;

class Cache {
  constructor() {
    this.items = new Map();
  }

  get(key) {
    return this.items.get(key);
  }
}

module.exports = { fetchUser, formatName, Cache };
`;

const python = `MAX_SIZE = 10

class Stack:
    def push(self, item):
        pass

    @property
    def size(self):
        return 0

def helper():
    def inner():
        pass
    return inner
`;

const go = `package shapes

const Pi = 3.14

type Shape interface {
	Area() float64
}

type Circle struct {
	Radius float64
}

type Meters = float64

func (c *Circle) Area() float64 {
	return Pi * c.Radius * c.Radius
}

func NewCircle(r float64) Circle {
	return Circle{Radius: r}
}
`;

const rust = `pub const LIMIT: u32 = 10;

pub struct Point {
    x: i32,
}

pub enum Direction {
    Up,
}

pub type Pair = (i32, i32);

pub trait Shape {
    fn area(&self) -> f64;
    fn describe(&self) -> String {
        String::new()
    }
}

impl Point {
    pub fn new(x: i32) -> Self {
        Point { x }
    }
}

pub mod geometry {
    pub fn origin() -> i32 {
        0
    }
}

macro_rules! square {
    ($x:expr) => {
        $x * $x
    };
}
`;

const java = `package demo;

interface Greeter {
    String greet(String name);
}

enum Mood {
    HAPPY
}

record Pair(int left, int right) {}

public class Hello implements Greeter {
    public Hello() {}

    public String greet(String name) {
        return "Hello " + name;
    }

    static class Inner {
        void run() {}
    }
}
`;

const csharp = `namespace Demo.Shapes
{
    public interface IShape
    {
        double Area();
    }

    public enum Kind
    {
        Round,
    }

    public struct Size
    {
        public int Width;
    }

    public record Tag(string Name);

    public class Circle : IShape
    {
        public double Area()
        {
            return 0;
        }
    }
}
`;

describe("symbol parser", () => {
  it.effect.each([
    {
      language: "typescript",
      source: typescript,
      expected: [
        ["Shape", "interface", 1, null],
        ["area", "method", 2, "Shape"],
        ["Id", "type", 4, null],
        ["Color", "enum", 5, null],
        ["Base", "class", 8, null],
        ["name", "method", 9, "Base"],
        ["Circle", "class", 11, null],
        ["area", "method", 15, "Circle"],
        ["name", "method", 18, "Circle"],
        ["makeCircle", "function", 22, null],
        ["unit", "constant", 25, null],
        ["double", "function", 26, null],
        ["Geometry", "module", 27, null],
        ["external", "function", 30, null],
      ],
    },
    {
      language: "tsx",
      source: tsx,
      expected: [
        ["Button", "function", 1, null],
        ["Link", "function", 4, null],
      ],
    },
    {
      language: "javascript",
      source: javascript,
      expected: [
        ["API_URL", "constant", 1, null],
        ["fetchUser", "function", 3, null],
        ["formatName", "function", 7, null],
        ["Cache", "class", 9, null],
        ["get", "method", 14, "Cache"],
      ],
    },
    {
      language: "python",
      source: python,
      expected: [
        ["MAX_SIZE", "constant", 1, null],
        ["Stack", "class", 3, null],
        ["push", "method", 4, "Stack"],
        ["size", "method", 8, "Stack"],
        ["helper", "function", 11, null],
        ["inner", "function", 12, null],
      ],
    },
    {
      language: "go",
      source: go,
      expected: [
        ["Pi", "constant", 3, null],
        ["Shape", "interface", 5, null],
        ["Circle", "class", 9, null],
        ["Meters", "type", 13, null],
        ["Area", "method", 15, "Circle"],
        ["NewCircle", "function", 19, null],
      ],
    },
    {
      language: "rust",
      source: rust,
      expected: [
        ["LIMIT", "constant", 1, null],
        ["Point", "class", 3, null],
        ["Direction", "enum", 7, null],
        ["Pair", "type", 11, null],
        ["Shape", "interface", 13, null],
        ["describe", "method", 15, "Shape"],
        ["new", "method", 21, "Point"],
        ["geometry", "module", 26, null],
        ["origin", "function", 27, "geometry"],
        ["square", "function", 32, null],
      ],
    },
    {
      language: "java",
      source: java,
      expected: [
        ["Greeter", "interface", 3, null],
        ["greet", "method", 4, "Greeter"],
        ["Mood", "enum", 7, null],
        ["Pair", "class", 11, null],
        ["Hello", "class", 13, null],
        ["greet", "method", 16, "Hello"],
        ["Inner", "class", 20, "Hello"],
        ["run", "method", 21, "Inner"],
      ],
    },
    {
      language: "c-sharp",
      source: csharp,
      expected: [
        ["Demo.Shapes", "module", 1, null],
        ["IShape", "interface", 3, "Demo.Shapes"],
        ["Area", "method", 5, "IShape"],
        ["Kind", "enum", 8, "Demo.Shapes"],
        ["Size", "class", 13, "Demo.Shapes"],
        ["Tag", "class", 18, "Demo.Shapes"],
        ["Circle", "class", 20, "Demo.Shapes"],
        ["Area", "method", 22, "Circle"],
      ],
    },
  ] as const)("finds $language definitions with their kinds, lines and containers", (row) =>
    Effect.gen(function* () {
      assert.deepStrictEqual(outline(yield* parse(row.language, row.source)), [...row.expected]);
    }),
  );

  it.effect("reports columns in UTF-16 code units, as editors count them", () =>
    Effect.gen(function* () {
      const symbols = yield* parse("typescript", 'let é = "x"; function after() {}\n');
      assert.deepStrictEqual(symbols, [
        { name: "after", kind: "function", line: 1, column: 23, container: null },
      ]);
    }),
  );

  it("picks the grammar from the file extension", () => {
    assert.deepStrictEqual(
      [
        "src/a.ts",
        "a.d.ts",
        "App.TSX",
        "x.mjs",
        "lib.rs",
        "Main.java",
        "Program.cs",
        "README.md",
      ].map(symbolLanguageForPath),
      ["typescript", "typescript", "tsx", "javascript", "rust", "java", "c-sharp", undefined],
    );
  });
});
