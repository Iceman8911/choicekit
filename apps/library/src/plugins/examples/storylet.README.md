# Storylet Plugin (Official Example)

This file documents `createStoryletPlugin` from `./storylet`.

## What it does

The storylet plugin adds a namespaced API at `engine.$.storylet` for evaluating narrative storylets against current engine state, selecting the best eligible entry, and tracking usage counters.

Unlike settings/achievements, this plugin serializes with `withSave: true`, so its counters rewind with normal story save slots.

## Factory

```ts
import { createStoryletPlugin } from "./storylet";

const storyletPlugin = createStoryletPlugin();
```

The factory generic order is engine-first:

```ts
createStoryletPlugin<TEngine, TPassageId>()
```

`TPassageId` defaults to `TEngine["passageId"]`, so in most cases you only provide the engine type (or no generics at all).

## Mounting

```ts
const storyletPlugin = createStoryletPlugin();

const engine = await new ChoicekitEngineBuilder()
  .withName("my-story")
  .withPassages(
    { name: "Start", data: "...", tags: [] },
    { name: "Village", data: "...", tags: [] },
    { name: "Forest", data: "...", tags: [] },
  )
  .withVars({
    player: { level: 1 },
  })
  .withPlugin(storyletPlugin, {
    storylets: [
      {
        name: "VillageIntro",
        passageId: "Village",
        priority: 1,
        conditions: [
          (engine) => engine.vars.player.level >= 1,
        ],
      },
      {
        name: "ForestEncounter",
        passageId: "Forest",
        priority: 2,
        conditions: [
          (engine) => [engine.vars.player.level >= 3, 5],
        ],
      },
    ],
  })
  .build();
```

## Condition return shape

Each condition callback can return either:

- `boolean` - pass/fail with default weight `1`
- `[boolean, number]` - pass/fail plus explicit weight used for tie-breaking

All conditions must pass for a storylet to be eligible.

## Typing plugin-aware conditions

If your condition callbacks need APIs from other plugins (for example achievements/settings), use `ChoicekitEngineWithPluginApis` to avoid manually rewriting `engine.$` types.

```ts
import type { ChoicekitEngine } from "../../engine/if-engine";
import type { ChoicekitEngineWithPluginApis } from "../plugin";

type ConditionEngine = ChoicekitEngineWithPluginApis<
  ChoicekitEngine,
  [typeof achievementsPlugin, typeof settingsPlugin]
>;

const storyletPlugin = createStoryletPlugin<ConditionEngine>();
```

## API

`engine.$.storylet` exposes:

- `getEligibleStorylets()`: returns eligible entries sorted by ranking.
- `getTopEligibleStorylet()`: returns best eligible entry or `null`.
- `markStoryletSelected(name)`: increments selected count and registers expected load.
- `loadTopEligibleStorylet()`: marks + navigates to current top entry, returning it (or `null`).
- `getStoryletStats(name)`: returns `{ selected, loaded }` counters.

## Ranking model

Sorting is deterministic and uses this order:

1. Completion ratio (`passingConditions / totalConditions`)
2. Condition priority score (sum of passing condition weights)
3. Storylet `priority`
4. Passing condition count
5. Storylet name (lexical fallback)

This ensures a fully passing storylet (for example `1/1`) outranks a partial match (for example `1/2`) even when base priority is lower.

## Tracking model

- `selected`: incremented when selected via plugin API.
- `loaded`: incremented when passage actually changes to a pending selected storylet passage.

This lets you distinguish "chosen" from "actually entered" storylet outcomes.
