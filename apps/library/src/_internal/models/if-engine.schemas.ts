import { TransformableOrJsonSerializableSchema } from "@packages/serializer";
import * as v from "valibot";
import type { ChoicekitType } from "../../engine/types/Choicekit";
import type { ChoicekitPluginSaveStructure } from "../../plugins/plugin";
import { SemanticVersionStringSchema } from "../schemas/version.schemas";

export const ChoicekitPluginSaveStructureSchema: v.GenericSchema<ChoicekitPluginSaveStructure> =
	v.object({
		data: TransformableOrJsonSerializableSchema,
		version: SemanticVersionStringSchema,
	});

const PluginSaveDataSchema: v.GenericSchema<
	Map<string, ChoicekitPluginSaveStructure>
> = v.map(v.string(), ChoicekitPluginSaveStructureSchema);

const StateSnapshotMetadataSchema: v.GenericSchema<
	ChoicekitType.SaveData["initialState"]
> = v.objectWithRest(
	{
		$$id: v.string(),
		$$plugins: PluginSaveDataSchema,
		$$seed: v.number(),
	},
	TransformableOrJsonSerializableSchema,
);

const PartialStateSnapshotSchema = v.objectWithRest(
	{
		$$id: v.optional(v.string()),
		$$plugins: v.optional(PluginSaveDataSchema),
		$$seed: v.optional(v.number()),
	},
	TransformableOrJsonSerializableSchema,
) as v.GenericSchema<ChoicekitType.SaveData["snapshots"][number]>;

export const ChoicekitSaveMetadataSchema: v.GenericSchema<ChoicekitType.SaveMetadata> =
	v.object({
		lastPassageId: v.string(),
		savedOn: v.date(),
		version: SemanticVersionStringSchema,
	});

export const ChoicekitSaveDataSchema = v.pipe(
	v.object({
		initialState: StateSnapshotMetadataSchema,
		snapshots: v.array(PartialStateSnapshotSchema),
		storyIndex: v.number(),
	}),
	v.readonly(),
) as v.GenericSchema<ChoicekitType.SaveData>;

export const ChoicekitSaveRecordSchema: v.GenericSchema<ChoicekitType.SaveRecord> =
	v.object({
		data: ChoicekitSaveDataSchema,
		meta: ChoicekitSaveMetadataSchema,
	});

export const ChoicekitStoredSaveDataSchema: v.GenericSchema<string> =
	v.string();

export const ChoicekitExportDataSchema: v.GenericSchema<ChoicekitType.ExportData> =
	v.object({
		plugins: PluginSaveDataSchema,
		saveData: ChoicekitSaveRecordSchema,
	});
