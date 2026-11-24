# Updating Dacre

Dacre has no published releases yet, so there is nothing to update to
automatically. The update button and `dacre update` say so and change nothing.

## Update a checkout

```bash
git pull
pnpm install
pnpm exec vp run build:desktop
```

Then restart the server. Your threads and settings stay in your Dacre home
directory, so a rebuild does not touch them.

## Update providers

**Settings → Providers** shows provider updates for the selected environment.
**Update all** updates every outdated provider on every connected environment
at once. Hover it to see which providers it will update. A provider is left out
when any of its enabled, outdated instances offers only a manual update command,
or when its instances use different update commands, such as two instances that
run different CLI installs. Update those by hand, or point every instance of the
provider at the same CLI.

After a successful provider CLI update, Dacre refreshes model discovery for
every enabled instance of that provider using its own configuration. Connected
clients receive the refreshed catalogs automatically.

Provider updates do not restart running chats. An existing session can keep
using the previous CLI until it ends. If discovery fails, check the provider
status and refresh it again.
