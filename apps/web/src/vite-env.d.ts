/// <reference types="vite/client" />

/**
 * CSS Modules are typed loosely on purpose. Generating exact per-file class
 * unions would need a codegen step in the build, and the payoff — catching a
 * typo'd class name — is not worth a generated artefact that can go stale.
 */
declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}
