# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-02-16

### Fixed

- Ensured shimmed bundles keep the inline `sourceMappingURL` directive as final non-whitespace content so Temporal's parser can decode sourcemaps reliably.
- Added regression tests for shimmed output and bundled output to guard against executable code trailing inline sourcemap payloads.

## [0.3.2] - Unreleased

### Changed

- Tree shaking is now enabled by default. Unused code in transitive dependencies is eliminated from workflow bundles, reducing bundle size. All workflow exports are preserved because the synthetic entrypoint requires the entire workflow module.

### Added

- `treeShaking` option in `BundleOptions` to control tree shaking (default: `true`, set `false` to opt out).

## [0.3.0] - Unreleased

### Added

#### Multi-Queue Orchestration

- `bundleMultipleWorkflows()` bundles workflow entry points for multiple task queues in parallel, sharing tsconfig resolution, plugin initialization, and other setup work across builds. Accepts an array of `QueueConfig` objects with per-queue `workflowsPath` and optional `activitiesPath`.
- `createMultiBundlers()` returns a `Map<string, WorkflowCodeBundler>` for creating reusable build contexts or watch mode across multiple queues.
- `bundleActivityCode()` bundles activity implementations using esbuild with full access to non-deterministic code, network calls, and file system access. Supports ESM and CJS output formats with optional minification.
- `watchTemporalCode()` provides coordinated watch mode across workflow and activity bundles for multiple task queues with configurable debounce. Returns a `CoordinatedWatchHandle` for stopping all watchers.

#### Bundle Size Analysis

- `analyzeSize()` performs bundle size analysis with gzip size estimation, per-module breakdown sorted by size, and top contributors list. Accepts optional `BundleSizeBudget` with configurable warning and failure thresholds.
- `formatBytes()` and `parseSize()` utilities for converting between byte counts and human-readable size strings (e.g., `"500KB"` to `512000`).
- `compareBundle()` compares two workflow bundles to identify size deltas, added/removed modules, and per-module size changes. `formatComparison()` renders the comparison as a human-readable report.

#### Enhanced Determinism Checking

- `mapViolationsToSource()` maps determinism violations from bundled code back to original source locations using source maps, producing `MappedViolation` objects with file path, line, column, and original source context. `formatMappedViolations()` renders mapped violations for display.
- `FORBIDDEN_ALTERNATIVES` provides a mapping from every forbidden API (e.g., `Date.now()`, `Math.random()`, `setTimeout`) to its Temporal-safe replacement with usage examples. `getAlternative()`, `formatAlternative()`, and `listAlternatives()` expose this mapping programmatically.
- `analyzeHistorySize()` and `analyzeFileHistorySize()` detect workflow code patterns that could cause unbounded history growth (e.g., infinite loops without `continueAsNew`, excessive signal handlers), producing `HistoryWarning` objects with severity, location, and remediation advice.

#### Workflow Validation

- `validateWorkflowExports()` and `validateWorkflowExportsFromSource()` validate that workflow source files export proper workflow functions at build time. Configurable via `ValidationOptions` to require async functions, explicit return types, and custom name patterns.
- `validateActivityTypes()` and `validateActivityTypesFromSource()` validate that activity function signatures use JSON-serializable types, catching type errors before deployment.
- `checkWorkflowBoundaries()`, `checkActivityBoundaries()`, and `checkBoundariesFromSource()` enforce package boundary rules that prevent workflows from importing activity-only packages and vice versa. `DEFAULT_BOUNDARIES` provides sensible defaults for Temporal's SDK packages.

#### CI/CD Integration

- `generateCIReport()` produces a structured `CIReport` JSON object with build status, size analysis, warnings, and metadata suitable for machine consumption. `formatCIReportText()` renders the report as a text summary for PR comments. `formatGitHubAnnotations()` renders the report as GitHub Actions `::warning` and `::error` annotations.
- `remapSourceMapPaths()` and `remapSourceMapFile()` rewrite paths in source maps for deployment environments (e.g., stripping local directory prefixes or remapping to repository-relative paths). `uploadSourceMap()` uploads source maps to an external service endpoint for production debugging.
- `verifyDeterministicBuild()` builds the same workflow bundle multiple times (default: 3) and compares output hashes to verify the build is reproducible, returning a `DeterminismVerifyResult` with the reference hash and any differences found.
- New CLI command `check` builds a workflow and validates against a size budget with `--budget` (e.g., `500KB`, `1MB`) and optional `--strict` mode. Supports `--ci` for machine-readable output.
- New CLI command `verify` performs determinism verification by building the same workflow multiple times and comparing outputs.

#### Plugin System Enhancements

- `composePlugins()` merges esbuild and Bun plugin arrays into a `ComposedPlugins` object for unified plugin management.
- `sortPluginsByPriority()` orders `ExtendedBundlerPlugin` instances by their `priority` field (lower values run first, default: 100).
- `mergePlugins()` concatenates multiple plugin arrays and deduplicates by name.
- `createPlugin()` and `createEsbuildPluginAdapter()` provide factory functions for creating `ExtendedBundlerPlugin` instances from scratch or by wrapping existing esbuild plugins.
- `createPreserveExportsPlugin()` creates an esbuild plugin for selective export preservation in workflow bundles (smart tree-shaking that preserves workflow exports while removing unused internal code). `analyzeRequiredExports()` determines which exports must be preserved.

#### TypeScript Integration

- `typeCheckWorkflows()` runs TypeScript type checking against workflow source files during the build process, returning `TypeCheckResult` with diagnostics categorized by severity. Configurable via `TypeCheckOptions` for strict mode and workflow-specific type rules.
- `generateWorkflowDeclarations()` and `generateDeclarationContent()` generate TypeScript `.d.ts` declaration files for workflow exports, enabling type-safe workflow client usage.

#### SDK Compatibility

- `checkSdkCompatibility()` checks compatibility between the bundler version, the `@temporalio/workflow` SDK version used during bundling, and the worker SDK version at runtime. Returns an `SdkCompatibility` object with compatibility status and warnings. `formatCompatibilityInfo()` renders the result for display.
- `createInstrumentationPlugin()` creates an esbuild plugin that injects development-mode tracing hooks into workflow and activity function calls. Configurable to trace workflow calls, activity proxy calls, or both. Automatically tree-shaken in production builds.

#### Bundle Signing

- `generateSigningKeyPair()` generates an Ed25519 key pair for bundle signing. Private key is PKCS#8 encoded, public key is SPKI encoded, both base64-encoded.
- `signBundle()` signs a workflow bundle with an Ed25519 private key, producing a `SignedBundle` with the signature and public key embedded alongside the bundle code.
- `verifyBundle()` verifies a signed bundle using the embedded public key. `verifyBundleWithKey()` verifies against a specific trusted public key instead.
- New CLI command `sign` signs a pre-built bundle file using `--private-key`.
- New CLI command `keygen` generates a new Ed25519 key pair and outputs both keys.

#### Testing Support

- `bundleForTesting()` bundles workflow code with test-specific configuration including module mocking (replace modules with test doubles via `mocks` option) and relaxed determinism checks (allow `Date.now()`, `Math.random()` in tests via `relaxedDeterminism` option).

#### Core Infrastructure

- `computeBundleContentHash()` computes a deep content hash of all bundle input files for reliable cache invalidation, traversing the file tree from the workflow entry point. `hashFileContent()` hashes a single file.
- `DiskCache` class provides persistent disk-based caching for workflow bundles with TTL-based and size-based eviction. `createDiskCache()` factory function accepts `DiskCacheOptions` for configuring cache directory, max age (default: 7 days), and max size (default: 100MB).

#### New Types

- `ActivityBundle`, `ActivityBundleOptions` for activity bundling
- `BundleComparison`, `BundleSizeBudget`, `ModuleSizeInfo`, `SizeAnalysisResult` for size analysis
- `BuildMetadata` for extended build metadata (git commit, CI environment, runtime version)
- `CIReport` for CI-friendly output
- `CoordinatedWatchHandle` for multi-queue watch mode
- `ContentHashOptions` for content hashing configuration
- `DiskCacheOptions` for disk cache configuration
- `DeterminismVerifyResult` for build determinism verification
- `ExportValidationResult`, `ValidationOptions` for workflow export validation
- `ExtendedBundlerPlugin` with priority ordering
- `HistoryAnalysisResult`, `HistoryWarning` for history growth analysis
- `InstrumentationOptions` for development tracing
- `MappedViolation` for source-mapped determinism violations
- `MultiBundleOptions`, `QueueConfig` for multi-queue orchestration
- `PackageBoundaries`, `BoundaryCheckResult`, `BoundaryViolation` for boundary enforcement
- `PreserveExportsOptions` for smart tree-shaking
- `SdkCompatibility` for version compatibility
- `SignedBundle`, `SigningKeyPair` for bundle signing
- `SourceMapRemapOptions`, `SourceMapUploadOptions`, `SourceMapUploadData` for source map management
- `TestBundleOptions` for test-specific bundling
- `TypeCheckOptions`, `TypeCheckResult`, `TypeCheckDiagnostic` for TypeScript checking
- `TypeValidationResult` for activity type validation
- `WatchCoordinatorOptions` for coordinated watch mode
- `WatchOptions` for watch mode behavior

## [0.2.0] - 2025-07-15

### Added

- TypeScript path alias support via the `tsconfigPath` option in `BundleOptions`. When set to `true`, automatically searches for `tsconfig.json` near the workflow entry point. When set to a string, uses that specific tsconfig file. Resolves aliases like `@/*` to `./src/*` during bundling.
- `createTsconfigPathsPlugin()` creates an esbuild plugin for resolving TypeScript path aliases from tsconfig `compilerOptions.paths`.
- `findTsconfig()` searches for a tsconfig.json file starting from a given directory, walking up the directory tree.
- `parseTsconfigPaths()` parses a tsconfig.json and extracts the `baseUrl` and `paths` configuration.
- `resolvePathAlias()` resolves a single import specifier against parsed tsconfig path mappings, trying each candidate path until one exists on disk.
- Path alias resolution works with both esbuild and Bun.build backends.

## [0.1.0] - 2025-07-01

### Added

- Initial release of `build-temporal-workflow` as a drop-in replacement for `@temporalio/worker`'s `bundleWorkflowCode`.
- esbuild-based bundling backend delivering 9-11x faster builds and 94% less memory usage compared to the Webpack-based official bundler.
- Bun.build backend (opt-in via `bundler: 'bun'`) for even faster builds when running under the Bun runtime (up to 20x vs Webpack).
- `bundleWorkflowCode()` function with API-compatible signature: accepts `workflowsPath`, `workflowInterceptorModules`, `payloadConverterPath`, `failureConverterPath`, `ignoreModules`, and returns a `WorkflowBundle` with `code` and optional `sourceMap`.
- `WorkflowCodeBundler` class with `createBundle()`, `createContext()` (reusable build contexts for test suites), and `watch()` methods.
- `watchWorkflowCode()` for file-watching with automatic rebuild on source changes.
- `getCachedBundle()` for in-memory bundle caching with automatic invalidation when workflow files change. `clearBundleCache()` and `getBundleCacheStats()` for cache management.
- `preloadBundles()` for warming the cache with multiple workflow bundles concurrently.
- `loadBundle()` for loading pre-built bundles from disk with optional SDK version validation.
- `analyzeReplaySafety()` for detecting non-deterministic patterns (`Date.now()`, `Math.random()`, `setTimeout`, `fetch`, `crypto.randomBytes()`, etc.) in workflow code. `formatReplayViolations()` for human-readable output. `REPLAY_UNSAFE_PATTERNS` constant for the full pattern list.
- `validateBundle()`, `validateBundleDetailed()`, and `validateBundleStructure()` for validating bundle integrity, structure, and SDK version compatibility.
- `generateManifest()` for generating workflow manifests with export names, source hashes, and line numbers. `compareManifests()` for diffing manifests. `serializeManifest()` and `parseManifest()` for serialization.
- `WorkflowBundleError` structured error class with machine-readable error codes (`FORBIDDEN_MODULES`, `DYNAMIC_IMPORT`, `RESOLUTION_FAILED`, `IGNORED_MODULE_USED`, `CONFIG_INVALID`, `BUILD_FAILED`, `ENTRYPOINT_NOT_FOUND`) and contextual information.
- Dependency chain analysis showing the complete import path from the workflow entry point to any forbidden module. `findDependencyChain()`, `findAllDependencyChains()`, `formatDependencyChain()`, and `summarizeDependencyChain()`.
- `createTemporalPlugin()` for using the Temporal esbuild plugin directly in custom build pipelines.
- Determinism policy utilities: `loadDeterminismPolicy()`, `isForbidden()`, `isAllowedBuiltin()`, `moduleMatches()`, `normalizeSpecifier()`, `getModuleOverridePath()`, `ALLOWED_BUILTINS`.
- Cross-runtime support for Deno and Bun input flavors: `detectInputFlavor()`, `resolveCrossRuntimeConfig()`, `createCrossRuntimePlugin()`. Handles `npm:` specifiers, URL imports with caching, import maps, and `bun:` builtins.
- Opt-in file loader plugins as submodule exports: `textLoader()` (`.txt`, `.md`), `markdownLoader()` (`.md`), `tomlLoader()` (`.toml` via `smol-toml`), `yamlLoader()` (`.yaml`, `.yml` via `yaml`). Available from `build-temporal-workflow/plugins` or individually from `build-temporal-workflow/plugins/text`, etc. Each accepts custom extensions.
- Vite plugin (`build-temporal-workflow/vite`) for importing workflow bundles with `?workflow` query parameter or `with { type: 'workflow' }` import attributes. Supports custom identifier and bundle options. Caches builds in development mode.
- Bun plugin (`build-temporal-workflow/bun`) for importing workflow bundles with `?workflow` query parameter. Works as both a runtime plugin and with `Bun.build`.
- Type declarations for static file imports (`build-temporal-workflow/types`).
- CLI tool `bundle-temporal-workflow` with `build`, `analyze`, and `doctor` commands. Build supports `--output`, `--source-map`, `--mode`, `--ignore`, `--watch`, `--json`, `--verbose`, and converter/interceptor options. Analyze shows bundle composition with size breakdown and dependency visualization. Doctor validates environment and SDK compatibility.
- Source map support with `inline`, `external`, and `none` modes.
- Bundle metadata embedding with creation time, build mode, entry hash, bundler version, SDK version, externals, and warnings.
- `createConsoleLogger()` for development logging compatible with the `Logger` interface.
- Benchmark suite with statistical analysis, 95% confidence intervals, outlier detection (IQR method), and significance testing (Welch's t-test).
