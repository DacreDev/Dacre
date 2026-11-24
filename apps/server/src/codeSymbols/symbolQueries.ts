/**
 * Definition patterns from each grammar's `queries/tags.scm` (MIT), at the grammar versions
 * `@vscode/tree-sitter-wasm` builds, with the reference patterns left out. Dacre's own patterns
 * fill kinds the upstream files miss. When two patterns capture one node the earlier wins, so a
 * language lists a refinement before the upstream pattern it narrows.
 */

export type SymbolLanguage =
  | "typescript"
  | "tsx"
  | "javascript"
  | "python"
  | "go"
  | "rust"
  | "java"
  | "c-sharp";

const LANGUAGE_BY_EXTENSION: Readonly<Record<string, SymbolLanguage>> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  py: "python",
  pyi: "python",
  go: "go",
  rs: "rust",
  java: "java",
  cs: "c-sharp",
};

export const symbolLanguageForPath = (path: string): SymbolLanguage | undefined => {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? undefined : LANGUAGE_BY_EXTENSION[name.slice(dot + 1).toLowerCase()];
};

// tree-sitter-javascript 0.25.0
const JAVASCRIPT_TAGS = `
((method_definition
  name: (property_identifier) @name) @definition.method
  (#not-eq? @name "constructor"))

[
  (class
    name: (_) @name)
  (class_declaration
    name: (_) @name)
] @definition.class

[
  (function_expression
    name: (identifier) @name)
  (function_declaration
    name: (identifier) @name)
  (generator_function
    name: (identifier) @name)
  (generator_function_declaration
    name: (identifier) @name)
] @definition.function

(lexical_declaration
  (variable_declarator
    name: (identifier) @name
    value: [(arrow_function) (function_expression)]) @definition.function)

(variable_declaration
  (variable_declarator
    name: (identifier) @name
    value: [(arrow_function) (function_expression)]) @definition.function)

(assignment_expression
  left: [
    (identifier) @name
    (member_expression
      property: (property_identifier) @name)
  ]
  right: [(arrow_function) (function_expression)]
) @definition.function

(pair
  key: (property_identifier) @name
  value: [(arrow_function) (function_expression)]) @definition.function

(export_statement value: (assignment_expression left: (identifier) @name right: ([
 (number)
 (string)
 (identifier)
 (undefined)
 (null)
 (new_expression)
 (binary_expression)
 (call_expression)
]))) @definition.constant
`;

// Dacre: module-level `const`, after the function patterns so `const f = () => {}` stays a function.
const MODULE_CONSTANTS = `
(program
  (lexical_declaration
    kind: "const"
    (variable_declarator name: (identifier) @name) @definition.constant))

(program
  (export_statement
    declaration: (lexical_declaration
      kind: "const"
      (variable_declarator name: (identifier) @name) @definition.constant)))
`;

// tree-sitter-typescript 0.23.2, which extends the JavaScript tags.
const TYPESCRIPT_TAGS = `
(function_signature
  name: (identifier) @name) @definition.function

(method_signature
  name: (property_identifier) @name) @definition.method

(abstract_method_signature
  name: (property_identifier) @name) @definition.method

(abstract_class_declaration
  name: (type_identifier) @name) @definition.class

(module
  name: (identifier) @name) @definition.module

(interface_declaration
  name: (type_identifier) @name) @definition.interface
`;

// Dacre
const TYPESCRIPT_EXTRA = `
(type_alias_declaration name: (type_identifier) @name) @definition.type
(enum_declaration name: (identifier) @name) @definition.enum
(internal_module name: (_) @name) @definition.module
`;

// tree-sitter-python 0.25.0
const PYTHON_TAGS = `
(module (expression_statement (assignment left: (identifier) @name) @definition.constant))

(class_definition
  name: (identifier) @name) @definition.class

(function_definition
  name: (identifier) @name) @definition.function
`;

// Dacre refinements first, then tree-sitter-go 0.25.0.
const GO_TAGS = `
(method_declaration
  receiver: (parameter_list
    (parameter_declaration
      type: [(type_identifier) @container (pointer_type (type_identifier) @container)]))
  name: (field_identifier) @name) @definition.method

(type_spec name: (type_identifier) @name type: (interface_type)) @definition.interface
(type_spec name: (type_identifier) @name type: (struct_type)) @definition.class
(type_alias name: (type_identifier) @name) @definition.type
(const_spec name: (identifier) @name) @definition.constant

(function_declaration
  name: (identifier) @name) @definition.function

(method_declaration
  name: (field_identifier) @name) @definition.method

(type_spec
  name: (type_identifier) @name) @definition.type
`;

// Dacre refinements first, then tree-sitter-rust 0.24.0.
const RUST_TAGS = `
(impl_item
  type: [(type_identifier) @container (generic_type type: (type_identifier) @container)]
  body: (declaration_list
    (function_item name: (identifier) @name) @definition.method))

(mod_item
  body: (declaration_list
    (function_item name: (identifier) @name) @definition.function))

(enum_item name: (type_identifier) @name) @definition.enum
(type_item name: (type_identifier) @name) @definition.type
(const_item name: (identifier) @name) @definition.constant
(static_item name: (identifier) @name) @definition.constant

(struct_item
    name: (type_identifier) @name) @definition.class

(enum_item
    name: (type_identifier) @name) @definition.class

(union_item
    name: (type_identifier) @name) @definition.class

(type_item
    name: (type_identifier) @name) @definition.class

(declaration_list
    (function_item
        name: (identifier) @name) @definition.method)

(function_item
    name: (identifier) @name) @definition.function

(trait_item
    name: (type_identifier) @name) @definition.interface

(mod_item
    name: (identifier) @name) @definition.module

(macro_definition
    name: (identifier) @name) @definition.macro
`;

// tree-sitter-java 0.23.5, then Dacre.
const JAVA_TAGS = `
(class_declaration
  name: (identifier) @name) @definition.class

(method_declaration
  name: (identifier) @name) @definition.method

(interface_declaration
  name: (identifier) @name) @definition.interface

(enum_declaration name: (identifier) @name) @definition.enum
(record_declaration name: (identifier) @name) @definition.class
(annotation_type_declaration name: (identifier) @name) @definition.interface
`;

// tree-sitter-c-sharp 0.24.0, then Dacre.
const C_SHARP_TAGS = `
(class_declaration name: (identifier) @name) @definition.class

(interface_declaration name: (identifier) @name) @definition.interface

(method_declaration name: (identifier) @name) @definition.method

(namespace_declaration name: (identifier) @name) @definition.module

(struct_declaration name: (identifier) @name) @definition.class
(record_declaration name: (identifier) @name) @definition.class
(enum_declaration name: (identifier) @name) @definition.enum
(namespace_declaration name: (qualified_name) @name) @definition.module
(file_scoped_namespace_declaration name: (_) @name) @definition.module
`;

export const SYMBOL_QUERIES: Readonly<Record<SymbolLanguage, string>> = {
  typescript: TYPESCRIPT_TAGS + JAVASCRIPT_TAGS + TYPESCRIPT_EXTRA + MODULE_CONSTANTS,
  tsx: TYPESCRIPT_TAGS + JAVASCRIPT_TAGS + TYPESCRIPT_EXTRA + MODULE_CONSTANTS,
  javascript: JAVASCRIPT_TAGS + MODULE_CONSTANTS,
  python: PYTHON_TAGS,
  go: GO_TAGS,
  rust: RUST_TAGS,
  java: JAVA_TAGS,
  "c-sharp": C_SHARP_TAGS,
};
