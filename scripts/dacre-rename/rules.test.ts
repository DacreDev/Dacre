import { describe, expect, it } from "vite-plus/test";

import { findLeftovers, findPathCollisions, isExcluded, renamePath, renameText } from "./rules.ts";

const renamed: ReadonlyArray<readonly [string, string]> = [
  ["T3 Code", "Dacre"],
  ["T3-Code", "Dacre"],
  ["T3 code", "Dacre"],
  ["T3-code", "Dacre"],
  ["t3 code", "Dacre"],
  ["T3Code", "Dacre"],
  ["T3code", "Dacre"],
  ["t3code", "dacre"],
  ["t3-code", "dacre"],
  ["t3_code", "dacre"],
  ["t3Code", "dacre"],
  ["T3CODE_HOME", "DACRE_HOME"],
  ["T3_HOME", "DA_HOME"],
  ["T3_CODE_DARK_THEME_COLORS", "DACRE_DARK_THEME_COLORS"],
  ["T3CODE", "DACRE"],
  ["T3Wordmark", "DacreWordmark"],
  ["T3ConnectPage", "DacreConnectPage"],
  ["T3 Connect", "Dacre Connect"],
  ["T3 Chat", "Dacre Chat"],
  ["t3-chat-dark", "rose-dark"],
  ["T3 Tools Inc.", "Dacre contributors"],
  ["@t3tools/contracts", "@dacre/contracts"],
  ["com.t3tools.t3code.dev", "dev.dacre.app.dev"],
  ["com.t3tools.T3Code.desktop", "dev.dacre.Dacre.desktop"],
  ["com/t3tools/t3code", "dev/dacre/app"],
  ["com.t3tools.KdeCapture", "dev.dacre.KdeCapture"],
  ["t3code://open", "dacre://open"],
  ["t3-thread://v2/a/b", "dacre-thread://v2/a/b"],
  ["mcp__t3-code__t3_list_threads", "mcp__dacre__dacre_list_threads"],
  ["x-t3-token", "x-dacre-token"],
  ["refs/t3/checkpoints", "refs/dacre/checkpoints"],
  ["~/.t3/userdata", "~/.dacre/userdata"],
  ["t3.json", "dacre.json"],
  ["pingdotgg/t3code", "DacreDev/Dacre"],
  ["https://app.t3.codes/pair", "https://app.dacre.invalid/pair"],
  ["`t3 serve`", "`dacre serve`"],
  ['"t3/mcp/Context"', '"dacre/mcp/Context"'],
  ["useT3Connect", "useDacreConnect"],
  ["RelayT3ChatLinkResponse", "RelayDacreChatLinkResponse"],
  ["t3Home", "dacreHome"],
  ["t3McpApp", "dacreMcpApp"],
  ["font-t3-medium", "font-dacre-medium"],
  ["modules/t3-terminal", "modules/dacre-terminal"],
  ["await t3.open(thread)", "await dacre.open(thread)"],
  ['from "./t3.ts"', 'from "./dacre.ts"'],
  ["t3.cmd", "dacre.cmd"],
  ["T3 thread", "Dacre thread"],
  ["t3 connect", "dacre connect"],
  ["t3@latest", "dacre@latest"],
  ["t3-1.1.0-linux-x64.tar.gz", "dacre-1.1.0-linux-x64.tar.gz"],
  ["VITE_T3CODE_RELAY_URL", "VITE_DACRE_RELAY_URL"],
  ["EXPO_PUBLIC_T3_FOO", "EXPO_PUBLIC_DA_FOO"],
  ["FAKE_T3", "FAKE_DACRE"],
  ["allT3", "allDacre"],
  ["node_modules/t3/dist", "node_modules/dacre/dist"],
  [".well-known/t3/environment", ".well-known/dacre/environment"],
  ["t3code/no-raw-surface", "dacre/no-raw-surface"],
  ["oxlint-plugin-t3code", "oxlint-plugin-dacre"],
  ["command -v t3 2>/dev/null", "command -v dacre 2>/dev/null"],
  ["T3-Code-1.2.3-x86_64.AppImage", "Dacre-1.2.3-x86_64.AppImage"],
  ["https://t3.chat/x", "https://chat.dacre.invalid/x"],
  ["t3highlightsOnLoad", "dacrehighlightsOnLoad"],
  ["expo.modules.t3terminal", "expo.modules.dacreterminal"],
  ["Java_expo_modules_t3terminal_Ghostty", "Java_expo_modules_dacreterminal_Ghostty"],
  ["window.t3dev", "window.dacredev"],
  ["t3coderelay-managedendpoint", "dacrerelay-managedendpoint"],
  ["link-t3chat", "link-dacrechat"],
  ["t3env_credential", "dacreenv_credential"],
  ["t3lo.test", "dacrelo.test"],
  ["let __t3f = 1", "let __dacref = 1"],
  ["t3dotgg", "octocat"],
  ["t3coed", "dacer"],
  ["t3co", "dacr"],
  ["t3c", "dac"],
  ["$__t3c", "$__dacrec"],
  ["/tmp/.mount_T3abc/x", "/tmp/.mount_Dacreabc/x"],
  ["C:\\\\t3.exe", "C:\\\\dacre.exe"],
  ["D:\\t3.exe", "D:\\dacre.exe"],
  ["C:\\\\Users\\\\t3\\\\my project", "C:\\\\Users\\\\dacre\\\\my project"],
  ["C:\\\\dev\\\\t3code", "C:\\\\dev\\\\dacre"],
  ["\\\\\\\\.\\\\pipe\\\\t3-token-", "\\\\\\\\.\\\\pipe\\\\dacre-token-"],
  ["[^\\\\/]+\\\\t3\\.exe$", "[^\\\\/]+\\\\dacre\\.exe$"],
  ["/^https:\\/\\/preview\\.t3\\.codes\\//", "/^https:\\/\\/preview\\.dacre\\.invalid\\//"],
  ["printf '\\nt3 install: %s\\n'", "printf '\\ndacre install: %s\\n'"],
  ["Run %st3%s, or %st3 up%s", "Run %sdacre%s, or %sdacre up%s"],
  ["repo=dacre%2Ft3code", "repo=dacre%2Fdacre"],
  ["Fix%20and%20t3code://x", "Fix%20and%20dacre://x"],
  ["urn%3At3%3Aparams", "urn%3Adacre%3Aparams"],
  ["\\x1b[1;36mt3code\\x1b[0m", "\\x1b[1;36mdacre\\x1b[0m"],
  ["\\r\\x1b[2Kt3: downloading", "\\r\\x1b[2Kdacre: downloading"],
  ["source\\nt3McpExtension(pi)", "source\\ndacreMcpExtension(pi)"],
  ['#!/bin/bash\\nt3_launch "$@"\\n', '#!/bin/bash\\ndacre_launch "$@"\\n'],
  ["\\\\bt3\\\\s+feedback\\\\b", "\\\\bdacre\\\\s+feedback\\\\b"],
  ["x64/dacre\\r\\nt3-1.2.3-linux-x64/client", "x64/dacre\\r\\ndacre-1.2.3-linux-x64/client"],
  ["initial\\u0000T3 Code Test\\n", "initial\\u0000Dacre Test\\n"],
  ["\\ue000t3math", "\\ue000dacremath"],
  ["MobileT3", "MobileDacre"],
  ["github.com/t3tools/t3code", "github.com/dacre/dacre"],
  ["https://gitlab.com/t3tools/platform/t3code", "https://gitlab.com/dacre/platform/dacre"],
  ["dev.azure.com/t3tools/platform", "dev.azure.com/dacre/platform"],
  ["git@github.com:T3Tools/t3code.git", "git@github.com:Dacre/dacre.git"],
  ["https://T3Tools.visualstudio.com/x", "https://Dacre.visualstudio.com/x"],
  ["visibleT3Tools", "visibleDacreTools"],
  ["PingDotGG/T3Code", "DacreDev/Dacre"],
  ["Pingdotgg/T3code", "DacreDev/Dacre"],
  ["/^t3[-_ ]?code$/i", "/^dacre$/i"],
  ["mcp__t3[-_]?code(?:[-_]direct)?__", "mcp__dacre(?:[-_]direct)?__"],
  ["t3[-_]code[-_]direct", "dacre[-_]direct"],
  ["/^editor_t3_?code_[0-9a-f]{8}$/", "/^editor_dacre_[0-9a-f]{8}$/"],
  ["T3 Codes bakgrundstjänst", "Dacres bakgrundstjänst"],
  ["name=T3%20Code&url=x", "name=Dacre&url=x"],
  ["client_label=T3+Code+Mobile", "client_label=Dacre+Mobile"],
  ["ABC\\.com\\.t3tools\\.t3code\\.webauthn", "ABC\\.dev\\.dacre\\.app\\.webauthn"],
];

const unchanged = [
  "ultracode",
  "withLegacyUltracodeEffort",
  "pierre-words-0.2.2-t3.4-7c04b7f1.tgz",
  "react-native-screens@5.0.0-t3.61",
  "t3-xai-pro",
  "claude-cli/2.0 (external, cli)",
  "claude-code/2.1.273",
  "xai-grok-cli",
  "antigravity/hub/2.24.0",
  "mt-3",
  "format3",
  "wBZPxHx4f8AqpzlcnzkT3",
  "Test\\tpass\\t3m10s",
  "Name\\tValue\\n\\t3",
  "https://en.wikipedia.org/wiki/T3_(protocol)",
  "sha512-abc/t3/def+T3+==",
  "base64,QUJDt3/t3+T3==",
  "t3_write_pty",
];

describe("renameText", () => {
  it.each(renamed)("renames %s", (input, output) => {
    expect(renameText(input)).toBe(output);
  });

  it.each(unchanged)("leaves %s alone", (input) => {
    expect(renameText(input)).toBe(input);
  });

  it("changes nothing on a second run", () => {
    for (const input of [...renamed.map(([source]) => source), ...unchanged]) {
      const once = renameText(input);
      expect(renameText(once)).toBe(once);
    }
  });
});

describe("renamePath", () => {
  it.each([
    ["apps/web/src/components/T3Wordmark.tsx", "apps/web/src/components/DacreWordmark.tsx"],
    ["apps/mobile/modules/t3-terminal/index.ts", "apps/mobile/modules/dacre-terminal/index.ts"],
    ["scripts/npm-launcher/t3.mjs", "scripts/npm-launcher/dacre.mjs"],
    ["assets/prod/t3-black-windows.ico", "assets/prod/dacre-black-windows.ico"],
    ["docs/internals/06_t3-connect.md", "docs/internals/06_dacre-connect.md"],
    [
      "apps/web/deps/pierre-words-0.2.2-t3.4-7c04b7f1.tgz",
      "apps/web/deps/pierre-words-0.2.2-t3.4-7c04b7f1.tgz",
    ],
  ])("maps %s", (input, output) => {
    expect(renamePath(input)).toBe(output);
  });
});

describe("findLeftovers", () => {
  it.each([
    "T3 Code",
    "t3code",
    "a/.t3/b",
    "t3.codes",
    "pingdotgg",
    "\\nt3 install",
    "%st3%s",
    "%2Ft3code",
    "\\x1b[1mt3code",
    "\\ue000t3math",
    "PingDotGG/x",
    "https://apps.apple.com/us/app/dacre-remote-claude-more/id6787819824",
  ])("reports %s", (input) => {
    expect(findLeftovers(input).length).toBeGreaterThan(0);
  });

  it("gives the line of each leftover", () => {
    expect(findLeftovers("clean\nT3 Code")).toEqual([{ token: "T3", line: 2 }]);
  });

  it.each(unchanged)("ignores %s", (input) => {
    expect(findLeftovers(input)).toEqual([]);
  });

  it("ignores a line marked as deliberate", () => {
    expect(
      findLeftovers('parse("t3-thread://v2/e/t"); // rename-scan: T3 input on purpose'),
    ).toEqual([]);
  });
});

describe("isExcluded", () => {
  it.each([
    [".repos/x", "100644"],
    ["LICENSE", "100644"],
    ["NOTICE", "100644"],
    ["third-party-licenses/a", "100644"],
    ["apps/web/deps/a-t3.4.tgz", "100644"],
    ["scripts/dacre-rename/rules.ts", "100644"],
    ["patches/a@1.0.0.patch", "100644"],
    ["apps/mobile/modules/t3-highlights/Vendor/highlights/highlights.c", "100644"],
    ["apps/mobile/modules/x/link.swift", "120000"],
  ])("excludes %s", (path, mode) => {
    expect(isExcluded(path, mode)).toBe(true);
  });

  it("includes normal source", () => {
    expect(isExcluded("apps/web/src/App.tsx", "100644")).toBe(false);
  });
});

describe("findPathCollisions", () => {
  it("reports a rename onto an existing path", () => {
    expect(findPathCollisions(["a/t3code.ts", "a/dacre.ts"])).toEqual(["a/dacre.ts"]);
  });

  it("reports two sources that map to one path", () => {
    expect(findPathCollisions(["a/t3code.ts", "a/t3-code.ts"])).toEqual(["a/dacre.ts"]);
  });

  it("accepts independent renames", () => {
    expect(findPathCollisions(["a/t3code.ts", "b/t3code.ts", "c.ts"])).toEqual([]);
  });
});
