# Go to symbol

**Go to symbol** finds where functions, classes, methods, interfaces, types, enums, constants and
modules are defined in the current thread's project, and opens the file at that line. On web and
desktop, choose **Go to symbol** in the command palette, or bind `symbols.search` in
**Settings → Keybindings**; it has no shortcut by default. Type any part of a name, in any case.

The first search of a project builds its index in the background, which takes a while in a large
repository; the results fill in when it finishes. Later searches pick up changed files on their
own. If building fails, choose **Rebuild index**.

It reads TypeScript, JavaScript, Python, Go, Rust, Java and C#. Agents in a thread search the same
index with the `code_symbols` tool.

## What it leaves out

The index reads the files Git lists, untracked ones included unless Git ignores them, or the whole
folder outside Git, up to 100,000 files. It skips files over 1 MB, minified and binary files,
`.env` files and SSH keys, and vendored folders such as `node_modules` and `vendor`, even when
they are committed.

To leave out more, add a `.dacreignore` file at the root of the project, with the same patterns as
a `.gitignore`:

```gitignore
generated/
**/*.pb.go
```
