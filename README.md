# Choicekit

Choicekit is a lightweight, headless, framework-agnostic library for building interactive fiction.

## Repository layout

- `apps/library`: the publishable library package, `choicekit`
- `apps/docs`: the documentation site
- `packages/`: shared supporting packages for compression, serialization, events, and polyfills

## Documentation

The docs site is available at [https://iceman8911.github.io/choicekit/](https://iceman8911.github.io/choicekit/).

## Getting started

Install the published package with:

```bash
bun add choicekit
```

Then import from `choicekit`:

```ts
import { ChoicekitEngineBuilder } from "choicekit";
```
