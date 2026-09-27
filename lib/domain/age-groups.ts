export const MIN_AGE_GROUP = 6;
export const MAX_AGE_GROUP = 17;

export const AGE_GROUP_VALUES = Array.from(
  { length: MAX_AGE_GROUP - MIN_AGE_GROUP + 1 },
  (_, index) => MIN_AGE_GROUP + index,
);

export const YOUNGER_PHYSICAL_TEST_BAND = {
  key: "u6_u12",
  label: "U6–U12",
  ageFrom: 6,
  ageTo: 12,
} as const;

export const OLDER_PHYSICAL_TEST_BAND = {
  key: "u13_u17",
  label: "U13–U17",
  ageFrom: 13,
  ageTo: 17,
} as const;
