# Product usage data

Dacre does not collect product usage data and has no analytics code.

To turn relay tracing off for a server, set `DACRE_TELEMETRY_ENABLED=false` in its environment
before starting it. An administrator can do the same with a
[managed policy](./managed-policy.md#other-capabilities).

## Agent feedback

Agent feedback lets agents write a short report about a Dacre tool or `dacre` command that did
not do what they expected. Choose a mode in **Agent feedback** in **Settings > Labs**. It is off by
default.

Reports are saved on your machine, and `dacre feedback list` shows them. Before anything is saved,
Dacre removes file paths, your user name, machine name, project title, branch, git remote, and
anything that looks like a key, token, email address, or URL with a password. Reports never leave
your machine.

## Relay diagnostics

Dacre does not host a relay. If you deploy your own, connection traces go to the backend you
configure for them.

## Export diagnostics to your own receiver

To send traces, metrics, or logs to an OpenTelemetry receiver, open
**Settings > Maintenance > Diagnostics**, select an environment, and enter each signal's OTLP HTTP
endpoint under **OpenTelemetry export** (for example `http://localhost:4318/v1/traces`). Save, then
restart that environment's server. The receiver must be reachable from the server's machine.
**Test** sends an empty export from the server to check an endpoint before or after you save it;
saved endpoints are checked when the section opens. Checks send authentication headers only to
the signal's currently running endpoint and do not follow redirects. To check a new endpoint
that requires authentication, save it and restart the server first.

`DACRE_OTLP_*_URL` and standard `OTEL_EXPORTER_OTLP_*` environment variables override the saved
settings. An overridden signal shows **Set by environment** and names the variable that set it, and its
**Test** checks the running endpoint instead of the field. For endpoints saved here or set with `DACRE_OTLP_*_URL`, set `DACRE_OTLP_HEADERS` for
receivers that need authentication and `DACRE_OTLP_PROTOCOL=http/protobuf` for receivers that do
not accept JSON. An endpoint set with `OTEL_EXPORTER_OTLP_*` takes its headers and protocol from
`OTEL_EXPORTER_OTLP_HEADERS` and `OTEL_EXPORTER_OTLP_PROTOCOL` instead.
