import { TransformableOrJsonSerializableSchema } from "@packages/serializer";
import * as v from "valibot";
import type { ChoicekitType } from "../../engine/types/Choicekit";
import type { ChoicekitPluginSaveStructure } from "../../plugins/plugin";
import { SemanticVersionStringSchema } from "../schemas/version.schemas";

const StateSnapshotMetadataSchema: v.GenericSchema<
	ChoicekitType.SaveData["intialState"]
> = v.objectWithRest(
	{
		$$id: v.string(),
		$$seed: v.number(),
	},
	TransformableOrJsonSerializableSchema,
);

export const ChoicekitPluginSaveStructureSchema: v.GenericSchema<ChoicekitPluginSaveStructure> =
	v.object({
		data: TransformableOrJsonSerializableSchema,
		version: SemanticVersionStringSchema,
	});

const PluginSaveDataSchema: v.GenericSchema<
	Record<string, ChoicekitPluginSaveStructure>
> = v.record(v.string(), ChoicekitPluginSaveStructureSchema);

export const ChoicekitSaveDataSchema: v.GenericSchema<ChoicekitType.SaveData> =
	v.pipe(
		v.object({
			intialState: StateSnapshotMetadataSchema,
			lastPassageId: v.string(),
			plugins: PluginSaveDataSchema,
			savedOn: v.date(),
			snapshots: v.array(StateSnapshotMetadataSchema),
			storyIndex: v.number(),
			version: SemanticVersionStringSchema,
		}),
		v.readonly(),
	);

export const ChoicekitExportDataSchema: v.GenericSchema<ChoicekitType.ExportData> =
	v.object({
		plugins: PluginSaveDataSchema,
		saveData: ChoicekitSaveDataSchema,
	});
