/**
 * Ambient typing for the @8thwall/engine-binary npm helper.
 *
 * The npm package is plain CommonJS without bundled types; the engine itself is
 * loaded via <script> tag (see index.html) and exposes the `XR8` global. This
 * file stays in "script" mode (no top-level import/export) so the ambient
 * module declaration is always applied.
 */
declare module '@8thwall/engine-binary' {
  import type {Xr8} from './xr8'

  /** Resolves to the global `XR8` object once the engine script has loaded. */
  const XR8Promise: Promise<Xr8>

  export {XR8Promise}
}