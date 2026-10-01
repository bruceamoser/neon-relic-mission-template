/** Preserve live investigation progress while refreshing authored content. */
export function preserveProgress(existing, incoming) {
  const data = structuredClone(incoming);
  const previous = existing.system ?? {};
  const next = data.system;
  if (!next) return data;
  const copy = (key, target = next, source = previous) => {
    if (Object.hasOwn(source, key)) target[key] = structuredClone(source[key]);
  };
  const milestones = (authored = [], live = [], key) => {
    const merged = authored.map(entry => {
      const old = live.find(candidate => key(candidate) === key(entry));
      return old && Object.hasOwn(old, 'triggered') ? { ...entry, triggered: old.triggered } : entry;
    });
    return [...merged, ...live.filter(entry => !authored.some(candidate => key(candidate) === key(entry)))];
  };
  if (existing.type === 'caseBoard') {
    for (const key of ['currentDay', 'shiftsFilled', 'informationCardUuids']) copy(key);
    next.relicMilestones = milestones(next.relicMilestones, previous.relicMilestones, m => m.day);
    const authored = next.organizations ?? [];
    const live = previous.organizations ?? [];
    next.organizations = authored.map(org => {
      const old = live.find(candidate => candidate.id === org.id);
      if (!old) return org;
      for (const key of ['value', 'active', 'dormant', 'squaresConsumed']) copy(key, org, old);
      org.milestones = milestones(org.milestones, old.milestones, m => m.label || m.day);
      return org;
    });
    next.organizations.push(...live.filter(org => !authored.some(candidate => candidate.id === org.id)));
  }
  if (existing.type === 'informationCard') copy('revealed');
  if (existing.type === 'organization') for (const key of ['isActive', 'isDormant']) copy(key);
  return data;
}
