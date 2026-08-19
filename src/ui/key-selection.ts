export function toggleId(selected: string[], id: string, checked: boolean): string[] {
  if (checked) {
    if (selected.includes(id)) return selected;
    return [...selected, id];
  }
  return selected.filter((value) => value !== id);
}

export function selectAllIds(ids: string[], select: boolean): string[] {
  return select ? [...ids] : [];
}

export function selectionState(
  ids: string[],
  selected: string[],
): "none" | "some" | "all" {
  if (ids.length === 0 || selected.length === 0) return "none";
  if (ids.every((id) => selected.includes(id))) return "all";
  return "some";
}
