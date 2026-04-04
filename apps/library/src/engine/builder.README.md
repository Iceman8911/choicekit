# Choicekit Engine Builder

This file documents `ChoicekitEngineBuilder` from `./builder`.

## Why use the builder

The builder helps construct a typed engine configuration step-by-step while preserving plugin and data-type inference across calls.

It is especially useful when you want strong TypeScript guidance for passages, vars, plugin APIs, and config without writing one large object literal.

## Basic usage

```ts
import { ChoicekitEngineBuilder } from "./builder";

const engine = await new ChoicekitEngineBuilder()
  .withName("MyStory")
  .withPassages(
    { name: "Start", data: "Wake up.", tags: ["intro"] },
    { name: "Hallway", data: "Two doors.", tags: ["hub"] },
  )
  .withVars({ keys: 0, flags: { metGuide: false } })
  .build();
```

## Main fluent methods

- `withName(name)`
- `withPassages(...passages)`
- `withVars(vars | initializer)`
- `withConfig(config)`
- `withClasses(...classes)`
- `withMigrators(migrations)`
- `withPlugin(plugin, config)` (call multiple times)
- `build()`

## Plugin typing

Each `withPlugin(...)` call accumulates plugin API types into `engine.$`.

That means after mounting a typed plugin with id `settings`, you get typed access like `engine.$.settings` in the built engine.

## Notes

- The builder is mutable; create a new instance when you want a clean configuration.
- Engine name controls save namespace: engines with the same name share persisted save data.
