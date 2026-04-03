import { TransformableOrJsonSerializableSchema } from "@packages/serializer";
import * as v from "valibot";
import type { SugarboxType } from "../../engine/types/sugarbox";
import type { SugarboxPluginSaveStructure } from "../../plugins/plugin";
import { SemanticVersionStringSchema } from "../schemas/version.schemas";

const StateSnapshotMetadataSchema: v.GenericSchema<
	SugarboxType.SaveData["intialState"]
> = v.objectWithRest(
	{
		$$id: v.string(),
		$$seed: v.number(),
	},
	TransformableOrJsonSerializableSchema,
);

export const SugarboxPluginSaveStructureSchema: v.GenericSchema<SugarboxPluginSaveStructure> =
	v.object({
		data: TransformableOrJsonSerializableSchema,
		version: SemanticVersionStringSchema,
	});

const PluginSaveDataSchema: v.GenericSchema<
	Record<string, SugarboxPluginSaveStructure>
> = v.record(v.string(), SugarboxPluginSaveStructureSchema);

export const SugarboxSaveDataSchema: v.GenericSchema<SugarboxType.SaveData> =
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

export const SugarboxExportDataSchema: v.GenericSchema<SugarboxType.ExportData> =
	v.object({
		plugins: PluginSaveDataSchema,
		saveData: SugarboxSaveDataSchema,
	});
