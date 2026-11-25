"use client";

import { groupScopeOptions } from "@/lib/domain/location-groups";
import type { GroupSummary } from "@/lib/domain/types";

export function GroupScopeSelect({ groups, value, onChange }: { groups: GroupSummary[]; value: string; onChange: (value: string) => void }) {
  return <label className="compact-field"><span>Групи у звіті</span><select value={value} onChange={(event) => onChange(event.target.value)}>{groupScopeOptions(groups).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}
