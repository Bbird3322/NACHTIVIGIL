const npcs = new Map();

export const registry = {
  register(npc) {
    if (!npc?.id) throw new Error("NPC must include an id.");
    npcs.set(npc.id, npc);
  },

  get(id) {
    return npcs.get(id);
  },

  all() {
    return [...npcs.values()];
  },

  byType(type) {
    return [...npcs.values()].filter((npc) => npc.type === type);
  },

  byOrg(org) {
    return [...npcs.values()].filter((npc) => npc.org === org);
  },

  clear() {
    npcs.clear();
  },

  get size() {
    return npcs.size;
  },
};
