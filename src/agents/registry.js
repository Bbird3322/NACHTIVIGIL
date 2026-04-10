// src/agents/registry.js
// NPCレジストリ — 全NPC管理
 
const _npcs = new Map();
 
const registry = {
  /**
   * NPCを登録する
   * @param {object} npc - id フィールドを持つNPCオブジェクト
   */
  register(npc) {
    if (!npc?.id) throw new Error("NPC に id が必要です");
    _npcs.set(npc.id, npc);
  },
 
  /**
   * IDでNPCを取得する
   * @param {string} id
   * @returns {object|undefined}
   */
  get(id) {
    return _npcs.get(id);
  },
 
  /**
   * 全NPCを配列で返す
   * @returns {object[]}
   */
  all() {
    return [..._npcs.values()];
  },
 
  /**
   * タイプでフィルタリングする
   * @param {"investigator"|"superior"|"informant"|"enemy"|"agency"|"media"} type
   * @returns {object[]}
   */
  byType(type) {
    return [..._npcs.values()].filter(n => n.type === type);
  },
 
  /**
   * 組織でフィルタリングする
   * @param {string} org
   * @returns {object[]}
   */
  byOrg(org) {
    return [..._npcs.values()].filter(n => n.org === org);
  },
 
  /**
   * レジストリをクリアする（新シナリオ開始時）
   */
  clear() {
    _npcs.clear();
  },
 
  /**
   * 登録済みNPC数
   */
  get size() {
    return _npcs.size;
  },
};