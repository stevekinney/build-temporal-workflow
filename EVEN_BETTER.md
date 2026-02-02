# Developer Complaints about bundleWorkflowCode and Proposed Solutions

## Build-time Errors and Pain Points

Real-world users have hit frustrating build errors when bundling workflows with Temporal's TypeScript SDK. A common complaint is that certain dependencies cause the webpack-based bundler to fail. For example, one user described how a workflow module importing a "heavyweight" package (like the HTTP client `got`) would not bundle because that package pulls in Node built-ins (`fs`, `dns`, `util`, etc.). Webpack (which by default targets a browser-like environment) attempted to include those modules and errored out. The error message in their build was along the lines of:

```
Module not found: Error: Can't resolve 'dns'
```

This error repeated for several Node core modules. In their case, the bundling stopped with dozens of errors, even though those Node APIs would never actually run inside Temporal's isolated V8 context.

Another pain point is integration with certain build tools that mangle or minify code. Temporal's SDK uses the Workflow function's name as the workflow type identifier. In practice, this means if you minify your code, the function names change and Temporal can't find the workflows. A developer using Next.js 15 discovered this the hard way – after Next's build minified their workflow functions, Temporal failed to register them. In Next ≤14 they could disable minification as a workaround, but Next 15 removed that option. The user's expectation was that:

> "Temporal TypeScript's SDK should support minification, full stop. Users shouldn't have to make a magic webpack config to make things happen."

This highlights a gap between how developers expect to build/deploy their code and the SDK's current limitations.

### Proposed Solution

The new `bundle-temporal-workflow` library should eliminate these build-time headaches. First, it can target a Node environment by default and explicitly treat Node core modules as externals or no-ops. This way, packages that reference Node APIs (but don't actually use them in workflows) won't break the build. For instance, the bundler could automatically exclude or stub out core modules like `dns` or `fs` – avoiding Webpack's "can't resolve" errors without requiring developers to manually tweak config. This aligns with our goal of better output: the bundle would only include what's needed for the workflow, skipping Node internals and reducing noise.

Additionally, the new bundler should support minified and mangled code gracefully. We can achieve this by allowing workflows to be named explicitly or by generating a stable identifier at build time. For example, `bundle-temporal-workflow` could provide an option to inject human-readable workflow names (or use function file paths) so that even if the function name is changed by minification, Temporal can still register the Workflow. This design addresses the Next.js scenario above, making the system more ergonomic – no special Webpack magic needed on the user's part. Overall, by handling Node-specific modules and naming reliably, the bundler will better meet developers' expectations for "it just works" in production builds.

## Performance Problems

Developers have also raised concerns about the performance of bundling – both in terms of build speed and bundle size. Using Webpack to bundle workflows can be slow, especially for larger codebases. In one forum discussion, a Temporal engineer acknowledged that bundling on Worker startup can add multiple seconds:

> ">5 seconds is not uncommon... for complex workflow projects with tons of dependencies."

A user running Jest tests noticed that each test incurred a ~2.5–3 second penalty just from `Worker.create` (which triggers a bundle); their simple Temporal unit test was hitting the 5s timeout by spending most of that time in setup. Temporal recommends pre-bundling workflows to cache this cost. In fact, one Slack user was able to cut test execution time from 1.5s down to 250ms by prebuilding the workflow bundle and reusing it across tests. These anecdotes show that Webpack's bundling can be a bottleneck, impacting developer productivity (slower tests, slower startup in development, etc.).

### Proposed Solution

The `bundle-temporal-workflow` library should be built with speed in mind – using a faster bundling engine and enabling caching. Replacing Webpack with a tool like esbuild or Vite (which internally uses esbuild/rollup) can drastically improve bundling times (often by an order of magnitude on TypeScript projects). Faster bundling means a Temporal worker can start up quicker, and test suites won't be bogged down by per-test compilation.

We will also support ahead-of-time bundling out of the box: for example, providing a CLI or API to bundle workflows as part of a build step, so that the worker can just load the pre-made bundle. This approach aligns with the goal of faster workflow startup and gives developers flexibility to incorporate Temporal's bundling into their build pipelines (CI, etc.). The output of the new bundler will also be optimized for size – by tree-shaking unused code and excluding Node shims, the bundle will be smaller and load into the Worker faster.

In short, using a modern bundler and caching, we expect significantly reduced build times and a smoother developer experience (no more 5-second waits), directly addressing the performance complaints.

## Debugging Difficulties

Some of the trickiest pain points arise when something goes wrong inside the bundled code, as it can be hard to debug. Users have recounted scenarios where errors in the workflow isolate were non-obvious. For instance, one developer using Yarn 3 with Plug'n'Play (no traditional `node_modules`) hit a runtime error:

```
... .mul is not a function
```

This cryptic message was ultimately traced to a dependency version conflict – the `long` library was included twice (v4 and v5) due to how the bundler resolved packages in a monorepo setup. Diagnosing this was non-trivial: the developer tried switching between dynamic and pre bundling, with no clear improvement ("still no dice"), and even attempted to build the Temporal SDK from source to inspect types, hitting further roadblocks. This illustrates how debugging a bundled workflow can require deep dives (analyzing the bundle output or dependency tree) that most users aren't prepared for.

Another debugging challenge comes from accidentally importing unsupported code into workflows. Because workflow code must be deterministic and sandbox-safe, importing a Node library or any module with side effects can cause bizarre failures. In one case, a user tried to exclude a binary-heavy library (`sharp`) via webpack config, but still saw an error:

```
Class extends value undefined is not a constructor
```

This was traced to an `EventEmitter` (Node `events` module) being pulled in. The user noted that in a large Nx monorepo, "it's easy for VSCode to auto-import the wrong dependency", and asked if there was any way to detect such issues (like flagging an import of `events` in workflow code). Currently, the SDK doesn't warn ahead of time – you only find out when the workflow fails at runtime, which is a poor developer experience.

### Proposed Solution

The new bundler will prioritize improved debuggability and transparency. Concretely, `bundle-temporal-workflow` can include better error reporting when packaging workflows. Instead of obscure stack traces inside generated code, we can catch common pitfalls and present clear messages. For example:

- If multiple versions of a package end up in the bundle (as in the Yarn PnP case), the bundler could detect that during build and warn the developer with a human-readable message (e.g., "Dependency X is included multiple times – check your dependency versions").
- We can also enforce or warn about likely nondeterministic imports: the bundler knows the set of Node built-in modules and could refuse to bundle them, listing which workflow file is pulling them in. This directly addresses the request for detecting problematic imports – making the tool itself act as a guardrail.

These features make the system more ergonomic by catching errors early.

Moreover, the output bundle will include high-quality source maps and integration points for debugging. We want developers to be able to set breakpoints in their original TypeScript workflow code while a workflow runs in the sandbox. The new bundler can ensure that source maps are generated and perhaps even provide a lightweight way to run workflows in a debug mode (for example, not minifying the bundle and preserving function names, to align with the VSCode Temporal debugging extension). By focusing on clearer diagnostics and dev-friendly output, we will significantly ease the debugging difficulties that were common with the old Webpack approach.

## Monorepo and Package Manager Friction

Temporal's SDK bundler has struggled to play nicely with alternative package managers and monorepo setups, according to multiple reports. A notable example is pnpm, which uses symlinks and a different `node_modules` structure. Developers found that the Worker's webpack process couldn't resolve imports in a pnpm project – it would throw errors like:

```
Module not found: Error: Can't resolve '@temporalio/common' in .../@temporalio/workflow/lib
```

when trying to bundle. Essentially, Webpack didn't "see" the symlinked modules that pnpm had put in place. The maintainer of the SDK even relayed that "users are reporting they can't use the SDK with pnpm" and that as a workaround they had to enable `shamefully-hoist=true` in pnpm, which forces a traditional flat `node_modules` layout. This workaround lets Webpack find the modules, but it defeats pnpm's benefits and is not an ideal solution for those users.

Monorepo build systems like Nx and Turborepo introduced their own friction. In one community thread, a team attempted to bundle Temporal workflows inside an Nx monorepo. They ended up with Webpack errors complaining it could not resolve the path to their workflows file, indicating misconfiguration in module resolution within the monorepo context. A Temporal engineer advised them to avoid double-bundling (since the worker already bundles workflows). Ultimately, they abandoned Webpack for that part: "Using `tsc` worked for me", the user reported, though integrating Temporal into their existing build was still challenging. In fact, they later commented that getting Temporal to run in the Nx monorepo was "very hard" – they had to cobble together tips from a blog and use a custom executor instead of the stock build process. This is clearly not the experience Temporal aims for; ideally, adding Temporal to a multi-package repo or a workspace manager (npm/yarn/pnpm workspaces) should "just work".

### Proposed Solution

Our new bundler will be designed with monorepo and non-standard package manager compatibility from the start. We'll ensure `bundle-temporal-workflow` uses Node's module resolution in a way that respects pnpm's symlinks and Yarn Plug'n'Play. For example, instead of assuming a flat `node_modules` hierarchy, the bundler can leverage Node's resolution (which is aware of pnpm's `.pnpm` directory structure) or use pnpm's API (if available) to locate dependencies. By testing against pnpm projects, we'll verify that `shamefully-hoist` is not needed – the bundler should find `@temporalio/common` and others via the proper paths, eliminating the class of "module not found" errors. This makes Temporal more ergonomic for modern JavaScript teams who often prefer pnpm for its speed and stricter guarantees.

For Nx/Turborepo and similar, the solution is partly documentation (encouraging using our bundler as a separate step or avoiding bundling the worker code again) and partly improved flexibility. The new bundler could expose a straightforward CLI or Node API that fits into any build pipeline. Monorepo users can, for instance, add a step in their build that runs `bundle-temporal-workflow` for the workflows package, outputting a bundle artifact that the worker will load. This decoupling means you don't have to contort Nx's webpack config to accommodate Temporal – just use our tool in a targeted way.

We will also make sure to handle cross-package imports smoothly: if workflows import code from another package in the repo, the bundler should resolve it properly (possibly by leveraging project references or reading TsConfig paths). Essentially, no manual hacks should be required to use Temporal in a multi-package repository. By addressing these concerns, we align with the goal of being compatible with Temporal's Worker runtime in all scenarios – whether your codebase is a single project or a complex monorepo, the bundling step will integrate cleanly.

## Configuration and Customization Limitations

Another category of complaints is that `bundleWorkflowCode` was a black box with limited configurability. Many developers needed slight tweaks to the bundling process but found it hard to achieve. For example, one GitHub issue outlines proposals to make the bundler more flexible: adding an option to ignore certain modules (not bundle them) and allowing custom webpack config overrides. These suggestions came directly from user pain. In the "heavy dependencies" scenario, the team eventually added an `ignoreModules` option to the SDK, because without it, there was no clean way to tell the bundler "don't try to bundle module X – it's not actually needed at runtime." Before that addition, the only workaround was to use an undocumented hook to manipulate the webpack config. Indeed, one forum user shared code where they accessed `bundlerOptions.webpackConfigHook` to inject an externals rule (e.g., marking the native library `sharp` as external). While this hook exists, it's not well-documented, and using it requires being familiar with webpack internals and Temporal's bundler implementation – something most end users struggled with.

Another area of customization is hooking in custom code converters or interceptors. The default bundler didn't clearly document how to include customizations like interceptors in the workflow bundle. A user requested better docs after discovering that if you use Workflow Interceptors, you must pass their module into `bundleWorkflowCode`, otherwise replaying those workflows will fail with nondeterminism errors. This is more of a documentation gap, but it underscores that the bundling system had hidden requirements that developers could only discover by trial and error.

### Proposed Solution

The `bundle-temporal-workflow` library will emphasize configurability with sensible defaults. We plan to support a simple config object where developers can set options such as `ignoreModules` (list modules by name to exclude from the bundle) and perhaps `externals` or `globals` for any special handling. Rather than needing to tap into a low-level Webpack hook, users could just do:

```typescript
bundle({
  workflowsPath,
  ignoreModules: ['sharp', 'aws-sdk'],
});
```

to skip bundling those heavy libraries. Under the hood, the bundler will automatically stub them or leave them out, and log a warning if they're actually imported during execution. This fulfills the earlier community request for an official ignore mechanism and makes the tool more ergonomic.

For advanced customization, we can offer a plugin or hook system, but in a more developer-friendly way than modifying webpack config. For example, a function option like `modifyBundle(config)` could be provided, where `config` is a high-level representation (not necessarily the raw Webpack config, but an abstract of entries, externals, maybe an esbuild plugin interface). This would let power users tweak behavior when absolutely necessary, without us exposing or committing to webpack itself.

Crucially, we will document all these options clearly on the project README and Temporal docs. If interceptors or custom payload converters are used, our documentation and examples will show how to include them in the bundle (or the new tool might even auto-include known interceptors if it can statically detect them). By improving configurability and documentation, we ensure the bundling process is no longer a mysterious black box. Instead, it becomes a transparent part of using Temporal that can be tuned to fit unusual needs while still protecting the core guarantees of the Worker runtime (for instance, we'll validate that any config override doesn't break determinism or sandbox constraints). This design balances flexibility with safety, addressing the past complaints about rigid or unclear configuration.

## Compatibility with Alternative Runtimes (Bun, Deno, etc.)

Developers are excited about new JS runtimes like Bun and Deno for their performance and features, and naturally some have tried running Temporal's TypeScript SDK on them. However, compatibility issues with `bundleWorkflowCode` and the Worker have been reported. One user attempted to run a Temporal Worker under Bun (which has its own JavaScript runtime and module system). Bun was able to start the worker's bundling process – it even logged "Webpack compiled successfully in 486 ms" and created a workflow bundle – but then the worker crashed at startup with a low-level error (a Rust panic in Temporal's core, related to a hash table). This indicates that despite Bun's Node-compatibility, there are subtle differences causing instability. The user identified missing `v8.promiseHooks.createHook` support in Bun as one issue, and after patching that, hit another error with Temporal's native core library. In short, at the time of writing, you cannot reliably run Temporal's worker on Bun.

Deno shows a similar story: Deno's Node-compatibility layer has improved, and one enthusiast reported that Deno v2.4 could run Temporal's Hello World workflow code out-of-the-box (and even created a workflow bundle), but the Temporal client had issues and some things didn't fully work. The Temporal team has publicly stated that supporting Deno (or any non-Node runtime) will require significant changes. One core developer mentioned they have a big Rust dependency (the Core SDK) and that making it run via WASM is a goal for the future, which would unlock running Temporal in browsers, Deno, Cloudflare Workers, etc. Until that happens, the SDK's reliance on Node APIs (like the `http2` module for gRPC, and N-API for the core) means full support for Bun/Deno is aspirational.

### Proposed Solution

While the new `bundle-temporal-workflow` library alone cannot port Temporal to Bun or Deno, we will design it to be forward-compatible with these environments. In practice, this means a few things:

1. **The bundler itself should be able to run in non-Node contexts.** We might implement it in a way that doesn't strictly require Node-specific APIs. For example, if using esbuild's JavaScript API (which can be bundled or run in a browser/Deno), our tool could potentially execute in Deno's runtime to produce a bundle. At the very least, we'll avoid introducing new Node-only dependencies in the bundling process. This keeps the door open for Temporal's TypeScript support on other runtimes.

2. **The output of the bundler can be made more runtime-agnostic.** Currently, the bundle is a CommonJS module that the Node Worker uses. We can explore outputting an ESModule or a UMD bundle that could be consumed by either Node or Deno. For example, an option to produce an ESM bundle (since Deno and modern runtimes prefer ESModules) would mean that once Temporal's core is compatible, the workflows bundle wouldn't be the blocker. Similarly, ensuring the bundle doesn't include Node polyfills (or at least can be configured not to) will help it run on runtimes that don't shim Node libs.

3. **We will coordinate with Temporal's core team goals of running the Worker in WASM.** Our bundler's "better output" goal aligns here: by stripping away Node-specific requirements and generating a clean JS bundle, it's closer to something that could be executed in a WebWorker or Deno isolate. As the Temporal team adds an HTTP/1.1 client and moves core to WASM, the new bundler will be ready to produce bundles that can run in those environments without change.

In summary, we propose that `bundle-temporal-workflow` be as runtime-flexible as possible. While Node.js will remain the primary environment in the short term, we'll test our bundler with experimental setups (like running a workflow on Deno) to catch any unnecessary assumptions. By doing so, we address the complaints and interest from developers wanting Temporal on Bun and Deno: the new bundler will not be the limiting factor. This approach is in line with making the Temporal TypeScript SDK future-proof and broadly compatible, so that when the core SDK is ready to support new runtimes, the bundling layer will seamlessly support them as well.

## User Expectations vs. Actual Bundler Behavior

Finally, a number of community complaints boil down to "it didn't work the way I expected." The current `bundleWorkflowCode` sometimes violates the Principle of Least Surprise for developers. We've already touched on a few examples:

- The Next.js minification issue (developers expected function names not to matter, but they do, causing surprise failures)
- The interceptor inclusion issue (developers didn't realize they had to explicitly bundle interceptors, leading to nondeterministic replay errors)
- Another instance was error messaging – when a workflow wasn't registering, the worker simply logged "No workflows registered, not polling" with no clue that the cause was a misnamed config property in code. Users expected plugging in a bundle path would just work, but a subtle API difference (`workflowBundle` vs `workflowBundlePath`) tripped them up.

These gaps between expectation and reality can make Temporal feel finicky.

### Proposed Solution

Our overall design for `bundle-temporal-workflow` is geared toward aligning the tool's behavior with intuitive user expectations. To address the examples above:

1. **Explicit Workflow Names:** We plan to allow or even require explicitly naming workflows (or use a build step to inject a stable name). This way, minification won't matter – the workflow type name used by the SDK will remain constant. This directly satisfies the Next.js user's demand that the SDK "support minification... Users shouldn't have to..." tweak their build. The new bundler could, for instance, auto-generate a manifest of workflow names or use function export names that aren't affected by mangling. The result is a more predictable mapping of your code to Temporal's registry.

2. **Bundling All Necessaries by Default:** If a project is using Workflow Interceptors or custom payload converters, the new bundler will have sensible defaults to include them. We could scan for imports of `@temporalio/workflow` interceptor modules or provide an easy config (`interceptors: [MyInterceptor]`) to bundle them. The key is that a developer shouldn't be caught off-guard by replay failures – if something needs to be in the workflow sandbox, our tool or documentation will make that clear. We'll document scenarios like replay and versioning and how the bundler supports them, so that there's no hidden "gotcha" causing nondeterminism.

3. **Clearer API and Errors:** The new library will have a clean, typed API that reduces the chance of misuse. For example, instead of passing a raw object with a slightly different shape (as with `workflowBundle` vs `workflowBundlePath` in the Worker options), we might provide a function `loadBundle(path)` that returns the correct structure to pass to the Worker. This way, it's harder to get it wrong. And if something is misconfigured, the error messages will be actionable. If the worker starts with no workflows (as in the forum case), the Worker could throw or log an error like:

   ```
   No workflows registered – did you pass the correct bundle path?
   ```

   rather than silently waiting. Small UX improvements like this will better match user expectations and reduce confusion.

In designing these solutions, we are guided by our existing goals for the new bundler: making it faster, produce better output, improve ergonomics, and remain fully compatible with Temporal's runtime. Each proposal above – from handling names and interceptors to improving defaults – serves to bridge the gap between what developers anticipate and what actually happens when they bundle their workflows. By learning from real-world complaints and addressing them head-on, the `bundle-temporal-workflow` project aims to deliver a much more developer-friendly experience while maintaining the powerful capabilities of Temporal's TypeScript SDK.
