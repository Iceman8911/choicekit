type Serialized = unknown;

/** All userland custom classes need to implement this if they must be part of the story's state */
type SugarBoxClassInstance<TSerializedStructure extends Serialized> = {
	/** Must return a serializable plain object that when deserialized, can be reinitialized into an identical clone of the class.
	 *
	 * Is required for persistence.
	 */
	toJSON: () => TSerializedStructure;
};

/** All userland custom class constructors need to implement this if they must be part of the story's state */
type SugarBoxClassConstructor<TSerializedStructure extends Serialized> = {
	new (...args: never[]): SugarBoxClassInstance<TSerializedStructure>;

	/** Immutable id that must be stable (i.e never ever change if you wish to keep current saves compatible) since it is used to index registered classes in the engine */
	readonly classId: string;

	/** Static method for reviving the class */
	fromJSON(
		serializedData: TSerializedStructure,
	): SugarBoxClassInstance<TSerializedStructure>;

	prototype: SugarBoxClassInstance<TSerializedStructure>;
};

export type { SugarBoxClassInstance, SugarBoxClassConstructor };

/**
 * (class PlayerAccount {
    static readonly classId = "player_v1";
    
    constructor(public name: string) {}

    toJSON() {
        return { name: this.name };
    }

    static fromJSON(data: { name: string }) {
        return new PlayerAccount(data.name);
    }
}) satisfies SugarBoxClassConstructor<{ name: string }>;
 */
