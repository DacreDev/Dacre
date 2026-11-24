# MCP servers

Add an MCP server once in Dacre and every agent session that can take it gets the server's
tools, beside Dacre's own tools. You no longer have to repeat the server in each provider's config
file.

## Add a server

Open **Settings → MCP servers** and select **Add server**. A server either runs a command
(stdio) or is reached at a URL (HTTP).

- **Command**: a program on the server's `PATH`, such as `npx` or `uvx`, or an absolute path.
  Put each argument on its own line under **Arguments**. Dacre passes them to the program as
  they are, without a shell, so quotes and `$VARIABLES` are not expanded.
- **URL**: the server's streamable HTTP address, such as `https://example.com/mcp`. Servers that
  only offer the older SSE transport are not supported.
- **Environment variables** and **headers** hold tokens and keys. Dacre stores their values as
  secrets on the environment, never in `settings.json`, and never shows them again. To change
  one, type a new value.
- **Projects**: give a server to every project, or only to one.

Servers belong to the environment you are connected to, and its agents run them there. Each
environment keeps its own list.

To bring servers over from Claude Desktop, Claude Code or Cursor, select **Import** and paste the
object with the `mcpServers` key from that app's config. Dacre shows what it found and what it
left out before it saves anything. Arguments and URLs are kept as plain text, so if a server takes
a token in an argument, move it to an environment variable or header if the server can read one.

## Check a server

Select **Test** to start the server, connect to it and list its tools. A test stops after 15
seconds and stops the command it started.

## Which agents get the servers

The **Providers** list on the same page says what each provider receives. Some can start a stdio
server only in the session's folder, so they leave out a server that sets a working folder. Some
agents that use ACP take only stdio or only HTTP servers. Pi and OpenCode 2 do not receive these
servers, and neither does an OpenCode server you run yourself.

Changes reach sessions that start after you save. A server that is turned off, or that belongs to
another project, is not given to the session.
