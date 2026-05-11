export type PrimitiveFilterValue = string | number | boolean | null | undefined;

export type FilterValue = PrimitiveFilterValue | PrimitiveFilterValue[];

export type FilterRecord = Record<string, FilterValue>;
