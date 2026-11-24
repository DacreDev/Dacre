// @effect-diagnostics nodeBuiltinImport:off - Config load checks the debt-ceiling files exist before any Effect runtime exists.
import "vite-plus/test/config";
import { defineConfig } from "vite-plus";
import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { cachedTestTasks } from "./scripts/lib/cached-tests.ts";

const TEST_EXCLUDE = [
  "**/.repos/**",
  "**/.dacre/**",
  "**/node_modules/**",
  "**/dist/**",
  "**/dist-electron/**",
  "**/.{idea,git,cache,output,temp}/**",
];

// Directories whose tests belong to a package's own test config. desktop also
// owns the kde-snap-shot tests through its `include`.
const TEST_CONFIG_PACKAGES = ["apps/desktop", "apps/server", "apps/web", "packages/client-runtime"];

// `vp test run <file>` from the repo root hands each file to its package's
// config. Packages that borrow this config (`--config ../../vite.config.ts`) run
// from their own directory, as CI does, so they keep one plain project.
const isRepoRootTestRun = process.cwd() === import.meta.dirname;

/** Debt ceilings for files that still exist, so a branch deleting a file can't break the config. */
const existingCeilings = <Entry>(ceilings: Record<string, Entry>) =>
  Object.entries(ceilings).filter(([file]) =>
    NodeFS.existsSync(NodeURL.fileURLToPath(new URL(file, import.meta.url))),
  );

/** Per-file debt ceilings for the design-system rules, generated into lint-ceilings.json. */
const lintCeilings: Record<string, Record<string, number | Array<string>>> = JSON.parse(
  NodeFS.readFileSync(new URL("./lint-ceilings.json", import.meta.url), "utf8"),
);
const generatedCeilings = (rule: string) =>
  existingCeilings(lintCeilings[rule] ?? {}).map(([file, entry]) => {
    const options: ["error", { maxOccurrences: number } | { allowed: Array<string> }] = [
      "error",
      typeof entry === "number" ? { maxOccurrences: entry } : { allowed: entry },
    ];
    return { files: [file], rules: { [rule]: options } };
  });

const RESTRICTED_IMPORT_PATHS = [
  {
    name: "@dacre/client-runtime",
    message:
      "Import from an explicit @dacre/client-runtime/* subpath. The package has no root export.",
  },
  {
    name: "@pierre/diffs/react",
    importNames: ["CodeView"],
    message: "Use StyledDiffCodeView so web diff surfaces share styling and virtualized geometry.",
  },
];

const RESTRICTED_UI_VARIANT_PATTERNS = [
  {
    group: ["**/components/ui/*", "**/ui/*", "./ui/*"],
    importNames: ["buttonVariants", "toggleVariants", "badgeVariants", "selectTriggerVariants"],
    message:
      "Render the components/ui export instead of borrowing its class recipe (render={<Button …/>}, SelectButton, ToggleGroup).",
  },
];

const RESTRICTED_PULL_REQUEST_GLYPH_IMPORTS = {
  name: "lucide-react",
  importNames: [
    "GitMerge",
    "GitMergeIcon",
    "GitPullRequest",
    "GitPullRequestIcon",
    "GitPullRequestArrow",
    "GitPullRequestArrowIcon",
    "GitPullRequestClosed",
    "GitPullRequestClosedIcon",
    "GitPullRequestDraft",
    "GitPullRequestDraftIcon",
    "GitPullRequestCreate",
    "GitPullRequestCreateIcon",
    "GitPullRequestCreateArrow",
    "GitPullRequestCreateArrowIcon",
  ],
  message:
    "Pick a glyph by meaning from PullRequestGlyph in apps/web/src/components/pullRequest/pullRequestIcons.tsx so every surface draws the same pull request the same way.",
};

export default defineConfig({
  run: {
    cache: { scripts: false },
    tasks: {
      ...cachedTestTasks(process.env.DA_CACHED_TESTS),
      // The two knip passes read the same files and write nothing, so they run side by side.
      // The `knip:check` script runs this task, so `vp run knip:check` and `pnpm run knip:check` both use it.
      "knip:check:all": {
        command: 'node -e ""',
        dependsOn: ["knip:check:files", "knip:check:exports"],
        cache: false,
      },
    },
  },
  resolve: {
    alias: {
      "~": NodeURL.fileURLToPath(new URL("./apps/web/src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Fixture subprocesses must not inherit the outer task runner’s cache policy.
    env: { VP_REMOTE_CACHE: "off", VP_REMOTE_CACHE_URL: "" },
    exclude: TEST_EXCLUDE,
    hookTimeout: 60_000,
    testTimeout: 60_000,
    allowOnly: !process.env.CI,
    // Flaky tests are fixed, not retried.
    retry: 0,
    fakeTimers: {
      toFake: [
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
        "setImmediate",
        "clearImmediate",
        "Date",
        "performance",
        "requestAnimationFrame",
        "cancelAnimationFrame",
        "requestIdleCallback",
        "cancelIdleCallback",
      ],
    },
    setupFiles: [
      NodeURL.fileURLToPath(
        new URL("./packages/shared/src/testing/longTempDir.ts", import.meta.url),
      ),
      NodeURL.fileURLToPath(
        new URL("./packages/shared/src/testing/providerEnv.ts", import.meta.url),
      ),
      NodeURL.fileURLToPath(new URL("./packages/shared/src/testing/gitEnv.ts", import.meta.url)),
    ],
    ...(isRepoRootTestRun
      ? {
          projects: [
            ...TEST_CONFIG_PACKAGES,
            {
              extends: true,
              test: {
                name: "root",
                exclude: [
                  ...TEST_EXCLUDE,
                  ...TEST_CONFIG_PACKAGES.map((dir) => `${dir}/**`),
                  "native/kde-snap-shot/**",
                ],
              },
            },
          ],
        }
      : {}),
  },
  staged: {
    // In order, so lint reads the formatted file. CI lint failures cost a full round trip.
    "*": ["vp fmt --no-error-on-unmatched-pattern", "vp lint --no-error-on-unmatched-pattern"],
    // knip checks the whole repo, so it takes no file list. Any code or manifest change can leave
    // a file, export, or dependency unused.
    "{*.{js,jsx,ts,tsx,mjs,cjs,mts,cts},package.json,knip.jsonc}": () => "vp run knip:check",
  },
  fmt: {
    ignorePatterns: [
      ".repos/**",
      ".alchemy",
      "dist",
      "dist-electron",
      "node_modules",
      "pnpm-lock.yaml",
      "*.tsbuildinfo",
      "**/routeTree.gen.ts",
      "**/*.graphql.ts",
      "packages/source-control-github/schema/**",
      "apps/server/schema/**",
      "*.icon/**",
    ],
    sortPackageJson: {},
    overrides: [
      {
        files: [".devcontainer/devcontainer.json"],
        options: {
          trailingComma: "none",
        },
      },
    ],
  },
  lint: {
    ignorePatterns: [
      ".repos",
      ".repos/**",
      "dist",
      "dist-electron",
      "node_modules",
      "pnpm-lock.yaml",
      "*.tsbuildinfo",
      "**/routeTree.gen.ts",
      "**/*.graphql.ts",
      "packages/source-control-github/schema/**",
      "apps/server/schema/**",
    ],
    plugins: ["eslint", "oxc", "react", "unicorn", "typescript"],
    jsPlugins: ["./oxlint-plugin-dacre/index.ts", "@shadcn/lint"],
    settings: {
      shadcn: { ui: "~/components/ui" },
    },
    categories: {
      correctness: "warn",
      suspicious: "warn",
      perf: "warn",
    },
    rules: {
      "oxc/no-accumulating-spread": "error",
      "eslint/no-control-regex": "off",
      "typescript/no-this-alias": "off",
      "unicorn/prefer-add-event-listener": "off",
      "unicorn/prefer-string-starts-ends-with": "off",
      "unicorn/prefer-set-has": "off",
      "unicorn/prefer-array-find": "off",
      "unicorn/no-new-array": "off",
      "unicorn/no-array-reverse": "off",
      "react/no-object-type-as-default-prop": "off",
      "react/jsx-no-constructed-context-values": "off",
      "react/memo-dependencies": "error",
      "react/purity": "error",
      "react/refs": "error",
      "react/exhaustive-effect-dependencies": "error",
      "react/set-state-in-effect": "error",
      "react/immutability": "error",
      "react/no-array-index-key": "error",
      "react/no-unstable-nested-components": "error",
      "react/static-components": "error",
      "react/capitalized-calls": "error",
      "typescript/no-extraneous-class": "error",
      "eslint/no-empty-pattern": "error",
      "eslint/no-new": "error",
      "unicorn/no-useless-spread": "error",
      "eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "eslint/no-unsafe-optional-chaining": "error",
      "eslint/no-unneeded-ternary": "error",
      "unicorn/no-useless-fallback-in-spread": "error",
      "unicorn/require-module-specifiers": "error",
      "unicorn/no-array-sort": "off",
      "unicorn/consistent-function-scoping": "off",
      "oxc/no-map-spread": "off",
      "react-in-jsx-scope": "off",
      "react-hooks/exhaustive-deps": "off",
      "eslint/no-shadow": "off",
      "eslint/no-await-in-loop": "off",
      "eslint/no-underscore-dangle": "off",
      "typescript/consistent-return": "off",
      "typescript/no-base-to-string": "off",
      "typescript/no-duplicate-type-constituents": "off",
      "typescript/no-floating-promises": "off",
      "typescript/no-implied-eval": "off",
      "typescript/no-meaningless-void-operator": "off",
      "typescript/no-redundant-type-constituents": "off",
      "typescript/no-unnecessary-boolean-literal-compare": "off",
      "typescript/no-unnecessary-type-conversion": "off",
      "typescript/no-unnecessary-type-arguments": "off",
      "typescript/no-unnecessary-type-assertion": "off",
      "typescript/no-unnecessary-type-parameters": "off",
      "typescript/no-unsafe-type-assertion": "off",
      "typescript/await-thenable": "off",
      "typescript/require-array-sort-compare": "off",
      "typescript/restrict-template-expressions": "off",
      "typescript/unbound-method": "off",
      "eslint/no-restricted-imports": [
        "error",
        { paths: [...RESTRICTED_IMPORT_PATHS, RESTRICTED_PULL_REQUEST_GLYPH_IMPORTS] },
      ],
      "dacre/no-global-process-runtime": "error",
      "dacre/no-inline-schema-compile": "error",
      "dacre/no-low-value-comments": "error",
      "dacre/no-manual-effect-runtime-in-tests": "error",
      "dacre/no-native-title-tooltip": "error",
      // Test files only (the rule checks the filename).
      "dacre/no-polling-loop-in-tests": "error",
      "dacre/no-raw-mcp-registration": "error",
      "dacre/no-real-time-wait-in-tests": "error",
      "dacre/no-test-in-loop": "error",
      "dacre/no-test-timeout-or-unreasoned-skip": "error",
      "dacre/no-rpc-permission-bypass": ["error", { allowRawClientAccess: true }],
      "dacre/no-unscoped-has": "error",
      "dacre/no-wall-clock-in-tests": "error",
      "dacre/namespace-node-imports": "error",
      "dacre/prefer-catch-tags": "error",
      "dacre/prefer-effect-fn": "error",
      "dacre/require-centered-scroll-gutter": "error",
      "dacre/require-suppression-reason": "error",
    },
    overrides: [
      {
        files: [
          "**/*.{test,spec,testkit}.{ts,tsx}",
          "**/{test,tests,testkit,testing,fixtures,integration}/**",
          "packages/provider-testing/**",
        ],
        rules: { "dacre/prefer-effect-fn": "off" },
      },
      {
        files: ["apps/web/src/**", "apps/desktop/src/**"],
        // Users still pick their own project icon from the full Lucide set.
        excludeFiles: ["apps/web/src/projectIconOptions.ts"],
        rules: { "dacre/no-sparkles-icon": "error" },
      },
      {
        files: ["apps/web/**/*.test.{ts,tsx}"],
        rules: { "dacre/require-disposable-render": "error" },
      },
      {
        files: ["apps/web/src/**/*.browser.test.{ts,tsx}"],
        rules: { "dacre/no-frame-waits-in-browser-tests": "error" },
      },
      {
        files: ["apps/**/src/**", "packages/**/src/**"],
        rules: { "dacre/no-dom-test-environment": "error" },
      },
      {
        files: ["apps/web/src/**"],
        rules: { "dacre/no-spaced-caps": "error" },
      },
      {
        files: ["apps/web/src/**"],
        rules: { "dacre/no-dot-separated-text": "error" },
      },
      {
        // A <button>, <a> or <input> with appearance classes is a hand-built control that
        // skips the components/ui variants; shadcn/no-restyle cannot see it because it only
        // checks ui components. components/ui builds the primitives from raw elements.
        files: ["apps/web/src/**"],
        excludeFiles: ["apps/web/src/components/ui/**"],
        rules: { "dacre/no-styled-raw-controls": "error" },
      },
      {
        // Type comes from the seven roles (text-title … text-micro, or <Text>), not
        // Tailwind's size and weight scale. components/ui defines the roles' users,
        // tests assert on markup, and the catalog demos raw classes on purpose.
        files: ["apps/web/src/**"],
        excludeFiles: [
          "apps/web/src/components/ui/**",
          "apps/web/src/components/design-system/**",
          "apps/web/src/**/*.test.{ts,tsx}",
        ],
        rules: { "dacre/no-raw-type-classes": "error" },
      },
      {
        // Surfaces come from the surface-* utilities and radius tokens, not hand-built
        // bg, border, rounded and shadow classes that the surface styles cannot repaint.
        // components/ui is included, so a feature look moved into a variant still counts.
        files: ["apps/web/src/**"],
        excludeFiles: ["apps/web/src/**/*.test.{ts,tsx}"],
        rules: { "dacre/no-raw-surface": "error" },
      },
      {
        files: ["apps/web/src/components/ui/**"],
        excludeFiles: ["apps/web/src/**/*.test.{ts,tsx}"],
        rules: { "dacre/no-new-ui-variants": "error" },
      },
      {
        files: ["packages/client-runtime/src/state/**", "apps/{web,desktop}/src/**"],
        rules: { "dacre/no-rpc-permission-bypass": ["error", { allowRawClientAccess: false }] },
      },
      {
        files: [
          "packages/client-runtime/src/state/runtime.ts",
          "packages/client-runtime/src/state/vcsAction.ts",
        ],
        rules: {
          "dacre/no-rpc-permission-bypass": [
            "error",
            { allowGuardInstallation: true, allowRawClientAccess: false },
          ],
        },
      },
      {
        files: [
          "apps/web/src/components/settings/AuthorizedClientsSettings.tsx",
          "apps/web/src/components/device/DevicePhoneViewport.tsx",
          "apps/web/src/components/device/DeviceDuoViewport.tsx",
        ],
        rules: { "dacre/no-rpc-permission-bypass": ["error", { allowRawClientAccess: true }] },
      },
      {
        files: ["packages/client-runtime/src/connection/outdatedHostUpdate.ts"],
        rules: { "dacre/no-rpc-permission-bypass": "off" },
      },
      {
        files: [
          "packages/client-runtime/src/rpc/**",
          "**/*.{test,spec}.{ts,tsx,js,jsx,mts,cts,mjs,cjs}",
        ],
        rules: { "dacre/no-rpc-permission-bypass": "off" },
      },
      {
        files: ["packages/shared/src/HostProcess.ts"],
        rules: { "dacre/no-global-process-runtime": "off" },
      },
      {
        // The `dacre` npm launcher is published as plain, dependency-free Node.
        files: ["scripts/npm-launcher/**"],
        rules: {
          "dacre/no-global-process-runtime": "off",
          "dacre/namespace-node-imports": "off",
        },
      },
      {
        files: ["apps/server/src/mcp/McpHttpServer.ts"],
        rules: { "dacre/no-raw-mcp-registration": "off" },
      },
      {
        files: ["apps/web/src/**"],
        excludeFiles: ["apps/web/src/components/ui/**"],
        rules: {
          "eslint/no-restricted-imports": [
            "error",
            {
              paths: [...RESTRICTED_IMPORT_PATHS, RESTRICTED_PULL_REQUEST_GLYPH_IMPORTS],
              patterns: RESTRICTED_UI_VARIANT_PATTERNS,
            },
          ],
        },
      },
      {
        files: ["apps/web/src/components/pullRequest/pullRequestIcons.tsx"],
        rules: { "eslint/no-restricted-imports": ["error", { paths: RESTRICTED_IMPORT_PATHS }] },
      },
      {
        // The server and every client load a forge's shared definition, so a UI runtime
        // imported there would break the server; client-only forge code goes in `src/client/`.
        files: ["packages/source-control-*/src/shared/**"],
        rules: {
          "eslint/no-restricted-imports": [
            "error",
            {
              paths: [...RESTRICTED_IMPORT_PATHS, RESTRICTED_PULL_REQUEST_GLYPH_IMPORTS],
              patterns: [
                {
                  group: [
                    "react",
                    "react/*",
                    "react-*",
                    "lucide-react",
                    "@dacre/client-runtime",
                    "@dacre/client-runtime/*",
                    "../client/*",
                    "../server/*",
                    "../../client/*",
                    "../../server/*",
                    "../../../client/*",
                    "../../../server/*",
                    "@dacre/source-control-*/client/*",
                    "@dacre/source-control-*/server/*",
                  ],
                  message:
                    "Shared forge definitions load on the server and every client; keep UI and server code out.",
                },
              ],
            },
          ],
        },
      },
      {
        files: ["apps/server/src/**", "packages/source-control-*/src/server/**"],
        rules: {
          "eslint/no-restricted-imports": [
            "error",
            {
              paths: [...RESTRICTED_IMPORT_PATHS, RESTRICTED_PULL_REQUEST_GLYPH_IMPORTS],
              patterns: [
                {
                  group: [
                    "@dacre/source-control-*/client/*",
                    "../client/*",
                    "../../client/*",
                    "../../../client/*",
                  ],
                  message:
                    "A forge's client entry is UI-only; the server reads its `shared/definition`.",
                },
              ],
            },
          ],
        },
      },
      {
        // Raw ResizeObserver state commits miss the paint; observeResize flushes derived layout together.
        files: ["apps/web/src/**"],
        excludeFiles: [
          "apps/web/src/lib/observeResize.ts",
          "**/*.{test,spec}.{ts,tsx,js,jsx,mts,cts,mjs,cjs}",
        ],
        rules: { "dacre/no-raw-resize-observer": "error" },
      },
      {
        files: ["apps/web/src/**"],
        rules: { "shadcn/no-unknown-classes": "error" },
      },
      {
        files: ["apps/web/src/**"],
        rules: { "dacre/no-outset-state-indicators": "error" },
      },
      {
        files: ["apps/web/src/**"],
        rules: { "dacre/max-settings-description-length": "error" },
      },
      {
        files: ["apps/*/src/**", "packages/*/src/**"],
        excludeFiles: [
          "**/*.{test,spec}.{ts,tsx,js,jsx,mts,cts,mjs,cjs}",
          "**/testkit/**",
          "**/_generated/**",
        ],
        rules: { "dacre/no-em-dash-copy": "error" },
      },
      {
        files: ["apps/web/src/**"],
        rules: { "shadcn/no-raw-colors": "error" },
      },
      {
        // Third-party marks must retain their exact colors.
        files: ["apps/web/src/components/Icons.tsx", "apps/web/src/components/JetBrainsIcons.tsx"],
        rules: { "shadcn/no-raw-colors": "off" },
      },
      {
        files: ["apps/web/src/**"],
        excludeFiles: ["apps/web/src/components/ui/**"],
        rules: {
          "shadcn/require-static-classes": "error",
          "shadcn/no-arbitrary-values": [
            "error",
            {
              allow: [
                "layout",
                "transition",
                "rounded-[inherit]",
                "gap-[0.33em]",
                "gap-[0.2em]",
                "leading-[normal]",
                "underline-offset-[0.2em]",
                "rounded-[25%]",
                "text-[length:80cqh]",
                "bg-[Highlight]",
                "fill-[#26251E]",
                "fill-[#EDECEC]",
                "fill-[#0F0F0F]",
                "fill-[#F5F5F5]",
                "fill-[#d97757]",
                "text-[#d97757]",
              ],
            },
          ],
          "shadcn/no-restyle": [
            "error",
            {
              allow: ["layout"],
              contracts: [
                {
                  // CollapsibleTrigger has no styled counterpart; other triggers use render={<Button …/>}.
                  pattern: "^CollapsibleTrigger$",
                  allow: ["layout", "color", "typography", "spacing", "shape", "effects", "motion"],
                },
              ],
            },
          ],
        },
      },
      // Registered always so a disable comment for intentional English counts as used.
      // `vp run i18n:untranslated` counts what it flags.
      {
        files: ["apps/web/src/**", "packages/client-runtime/src/**"],
        excludeFiles: [
          "**/*.{test,spec,bench}.{ts,tsx}",
          "**/{test,testkit,testing,fixtures}/**",
          "**/*.test-fixtures.ts",
          "**/{test-fixtures,*TestFixtures}.ts",
          "packages/client-runtime/src/rpc/**",
        ],
        rules: { "dacre/no-untranslated-copy": "error" },
      },
      {
        // React Compiler owns memoization; upstream rules do not ban redundant useMemo/useCallback.
        files: ["apps/web/src/**/*.{ts,tsx}"],
        rules: {
          "react/exhaustive-effect-dependencies": "error",
          "react/globals": "error",
          "react/hooks": "error",
          "react/immutability": "error",
          // The compiler memoizes context values; this rule would ask for useMemo.
          "react/jsx-no-constructed-context-values": "off",
          "react/memo-dependencies": "error",
          "react/preserve-manual-memoization": "error",
          // Render-time clock reads use @dacre/client-runtime/clock or state seeded with the
          // time; any other read carries a suppression that says why. oxlint also flags time reads
          // inside event handlers (oxc#27309); those suppressions cite it.
          "react/purity": "error",
          "react/refs": "error",
          "react/set-state-in-effect": "error",
          "react/set-state-in-render": "error",
          "react/static-components": "error",
          "react/unsupported-syntax": "error",
          "dacre/no-manual-memo": "error",
        },
      },
      {
        files: ["apps/web/src/**", "packages/*/src/**"],
        rules: { "dacre/no-unreasoned-state-sync": "error" },
      },
      {
        // React Compiler caches use* functions only if they call a hook.
        files: ["apps/web/src/**/*.{ts,tsx}"],
        excludeFiles: ["**/*.test.ts", "**/*.test.tsx"],
        rules: { "dacre/no-hookless-use-function": "error" },
      },
      // Design-system debt: each file's count must equal its ceiling. `vp run lint:ceilings`
      // lowers them after a fix; never raise one or add a file to pass lint.
      ...generatedCeilings("dacre/no-styled-raw-controls"),
      ...generatedCeilings("dacre/no-raw-type-classes"),
      ...generatedCeilings("dacre/no-raw-surface"),
      ...generatedCeilings("dacre/no-new-ui-variants"),
    ],
    options: {
      reportUnusedDisableDirectives: "error",
      typeAware: false,
      typeCheck: false,
    },
  },
});
