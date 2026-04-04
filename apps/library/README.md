# Choicekit

Loosely based off *Twine SugarCube*, **Choicekit** is a lightweight (<10KB minified and gzipped core), headless, unopinionated, and framework-agnostic library to help with developing web-based interactive fiction.

## Installation

```bash
npm install Choicekit
# or
bun install Choicekit
# or
yarn add Choicekit
```

The rest of the documentation is hosted on github pages.

## State update notes (`setVars`)

`setVars` uses a lightweight copy-on-write approach at the first level of state keys.

- When you touch `state.someTopLevelKey`, that key is copied into the active snapshot.
- Nested writes under that key work as expected.
- It does not track exact nested paths for minimal structural sharing like Immer.

This keeps the core small while still supporting nested mutation ergonomics.

If you want stricter path-level copy-on-write behavior without adding a large dependency, use a helper and return a fully replaced state:

## Why Choicekit? / Choicekit vs Sugarcube / Harlowe / Ink / ChoiceScript / etc

TODO
