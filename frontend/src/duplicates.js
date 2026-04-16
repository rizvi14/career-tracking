function normalize(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\b(inc|llc|corp|ltd|limited|co|company)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSimilar(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na];
  return shorter.length >= 4 && longer.includes(shorter);
}

// Returns a Set of IDs that have at least one similar counterpart.
export function findDuplicateIds(apps) {
  const ids = new Set();
  for (let i = 0; i < apps.length; i++) {
    for (let j = i + 1; j < apps.length; j++) {
      if (
        isSimilar(apps[i].company, apps[j].company) &&
        isSimilar(apps[i].title, apps[j].title)
      ) {
        ids.add(apps[i].id);
        ids.add(apps[j].id);
      }
    }
  }
  return ids;
}

// Returns groups (arrays of apps) where each group shares a similar company+title.
export function findDuplicateGroups(apps) {
  const groups = [];
  const assigned = new Set();

  for (let i = 0; i < apps.length; i++) {
    if (assigned.has(apps[i].id)) continue;
    const group = [apps[i]];
    for (let j = i + 1; j < apps.length; j++) {
      if (
        isSimilar(apps[i].company, apps[j].company) &&
        isSimilar(apps[i].title, apps[j].title)
      ) {
        group.push(apps[j]);
        assigned.add(apps[j].id);
      }
    }
    if (group.length > 1) {
      assigned.add(apps[i].id);
      groups.push(group);
    }
  }

  return groups;
}
