# `@packages/serializer`

Very lightweight serializer / deserializer package built to fulfill the needs of `sugarbox`, an interactive fiction library. As such, it needs to:

- Be as small as possible
- Support the serialization and deserialization of:
    - [ ] Primitives (e.g `number`, `boolean`, `null`, `undefined`, etc)
    - [ ] Special Numbers (e.g `Infinity`, `NaN`)
    - [ ] Plain objects
    - [ ] Arrays
    - [ ] Circular references
    - [ ] JS-native and platform agnostic global classes (e.g `Map`, `Set`, `Date`, etc)
    - [ ] Custom classes
    - [ ] BigInt
    - This is to match the behaviour of [twine sugarcube](https://www.motoslave.net/sugarcube/2/docs/#twinescript-supported-types)
- Maybe have:
    - Versioning