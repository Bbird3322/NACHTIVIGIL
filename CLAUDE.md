# NACHTIVIGIL — Claude Code 開発仕様書

> 夜警（Nachtwächter）+ Vigil（警戒）から命名。
> 公安警察 捜査・諜報・協力者育成シミュレーション。

---

## プロジェクト概要

プレイヤーが情報機関の指揮官として国家安全保障上の脅威を捜査・排除するターン制シミュレーションゲーム。シナリオごとに時代・国・組織が異なる（全5シナリオ）。

AIエージェント（Ollama / OpenRouter のGemmaモデルが主ターゲット）が、独立した人格・記憶・情報スコープを持つNPCとして全勢力を演じる。

**世界はプレイヤーと無関係に動いている。**
全NPCは毎ターン裏側で行動し、その記録はワールドDBに蓄積される。
プレイヤーは操作によってのみその断片を知ることができる。

---

## 技術スタック

| 項目 | 選択 |
|---|---|
| ランタイム | バニラHTML + CSS + JavaScript（ビルド不要） |
| フレームワーク | なし（ESモジュール分割） |
| LLMバックエンド | OpenRouter API / Ollama ローカル / Anthropic API（切り替え可） |
| 主ターゲットモデル | google/gemma-3-27b-it:free（GM・ワールド）/ google/gemma-3-12b-it:free（NPC） |
| データ永続化 | localStorage |
| スタイリング | CSS変数ベースのダークテーマ（外部ライブラリなし） |

---

## ディレクトリ構成

```
noctivigil/
├── index.html
├── CLAUDE.md
├── config/
│   ├── difficulty.json          # 難易度パラメータ（ENCRYPTED/DECRYPTED/EXPOSED）
│   └── customDifficulty.json    # カスタム難易度プロファイル
├── src/
│   ├── core/
│   │   ├── gameState.js         # GS・playerKnowledge 定義・初期値
│   │   ├── mechanics.js         # ダイス・日付・予算・フラグ判定（LLMなし）
│   │   ├── legal.js             # M_legal / 令状 / 証拠保全 / 起訴確率（LLMなし）
│   │   ├── aiDirector.js        # DDA・救済・抑制（LLMなし）
│   │   ├── evaluation.js        # S〜Cランク・昇進・エンディング・実績チェック
│   │   └── persistence.js       # localStorage セーブ/ロード
│   ├── world/
│   │   ├── worldDB.js           # worldEvents / intelPool / npcStates
│   │   ├── worldSim.js          # 毎ターンシミュレーション（ルールベース優先）
│   │   ├── actionRules.js       # NPCタイプ別行動確率テーブル
│   │   ├── infoScope.js         # buildInfoScope / formatScopeAsNarrative
│   │   ├── eventDB.js           # EventDef・抽選パイプライン
│   │   ├── infraDB.js           # セーフハウス・通信ハブ・ラボ
│   │   └── factionDB.js         # 派閥モデル・WorldState
│   ├── agents/
│   │   ├── registry.js          # NPCレジストリ（全NPC管理）
│   │   ├── gm.js                # GMエージェント（場面進行）
│   │   ├── npc.js               # NPCエージェント基底クラス
│   │   ├── investigator.js      # 捜査員（スキル・疲弊・忠誠）
│   │   ├── superior.js          # 上司・上位組織
│   │   ├── informant.js         # 協力者・インフォーマント
│   │   ├── enemy.js             # 敵エージェント
│   │   ├── agency.js            # 他官庁
│   │   └── media.js             # マスコミ
│   ├── llm/
│   │   ├── client.js            # LLM呼び出し（プロバイダ切り替え・リトライ）
│   │   └── memory.js            # 記憶要約・管理
│   └── ui/
│       ├── feed.js              # メッセージフィード
│       ├── sidebar.js           # サイドバー5タブ
│       ├── opPanel.js           # 作戦提案パネル
│       ├── contactModal.js      # 接触方式選択（方式 × 捜査員選択）
│       ├── intelPanel.js        # 入手情報一覧・信頼度表示
│       ├── legalPanel.js        # 令状・違反タイムライン・証拠連鎖ビュー
│       ├── infraPanel.js        # ノードカード・露呈タイムライン
│       ├── factionPanel.js      # 派閥関係図
│       ├── npcPanel.js          # NPCカード・記憶閲覧
│       └── difficultyUI.js      # 難易度選択・カスタム設定
└── data/
    ├── orgs.json                # 組織マスタ
    ├── events/
    │   ├── common.json          # 共通イベント定義
    │   └── scenario_*.json      # シナリオ別イベント上書き
    ├── actionRules.json         # NPC行動確率テーブル（外出し）
    └── scenarios/
        ├── scenario_jp2025.json
        ├── scenario_dea1990.json
        ├── scenario_stasi1985.json
        ├── scenario_sid1970.json
        └── scenario_kmt1945.json
```

---

## アーキテクチャ全体像

```
┌──────────────────────────────────────────────────────────────────┐
│                        WORLD DATABASE                            │
│  worldEvents[]   全NPCの行動記録。プレイヤー不可視。            │
│  intelPool[]     情報断片。操作によって可視化される。           │
│  npcStates{}     各NPCの現在状態（位置・計画・警戒度）         │
└─────────────────────┬────────────────────────────────────────────┘
                      │ 毎ターン自動更新（LLMなし優先）
                      ▼
             ┌─────────────────┐
             │  worldSim.js    │  ルールベースで全NPCの行動生成
             └────────┬────────┘  複雑な接触シーンのみLLM
                      │
         ┌────────────┼────────────┐
         ▼            ▼            ▼
      敵陣営        友好陣営      中立陣営（それぞれ独立して動く）
                      │
                      │ プレイヤーの操作で断片を取得
                      ▼
┌──────────────────────────────────────────────────────────────────┐
│                       PLAYER LAYER                               │
│  操作: 監視 / 接触 / 捜査員派遣 / 傍受 / 協力者活用 ...        │
│  取得: intelPool から情報スコープに応じた断片を受け取る         │
│  蓄積: playerKnowledge に確認済み情報を記録                      │
└──────────────────────────────────────────────────────────────────┘
                      │ NPCとの直接・間接接触
                      ▼
┌──────────────────────────────────────────────────────────────────┐
│                       NPC AGENTS                                 │
│  各NPCは infoScope（知れる情報の範囲）を持つ                    │
│  接触時: NPC の infoScope 内の情報のみで応答                    │
│  NPCは「自分が知るはずのないこと」は絶対に語らない             │
└──────────────────────────────────────────────────────────────────┘
```

---

## ゲームステート（GS）定義 — gameState.js

すべての数値はSI単位で統一する。

- スキル値：**0〜100**（investigatorのskills含む全NPC共通）
- Loyalty：**0〜100**（旧0〜5は廃止。コードで100スケールを使う）
- EnemyAlert：**0〜100**（旧0〜5は廃止）
- exposureRate：**0.0〜1.0**（%表記は使わない）
- M_legal：**0.0〜1.0**
- PressHeat：**0.0〜1.0**

```javascript
const GS = {
  // メタ
  scenarioId: "scenario_jp2025",
  day: 1,
  date: "2025-04-07",          // ISO8601形式で統一
  rank: "チーフ",
  assignment: "警視庁公安部",
  promotionPoints: 0,

  // 財務（円単位）
  budget: 50_000_000,
  monthlyBudget: 50_000_000,   // 毎月21日に補充
  pocketMoney: 2_000_000,
  salary: 7_000_000,

  // 要員
  personnel: { available: 20, total: 20 },

  // 装備（count: 在庫数）
  equipment: [
    { name: "監視ドローン",   count: 2 },
    { name: "盗聴器",         count: 5 },
    { name: "偽造ID",         count: 3 },
    { name: "特殊通信装置",   count: 1 },
  ],

  // ゲームフラグ（すべて0.0〜1.0 or boolean）
  meters: {
    enemyAlertness: 0.15,      // 0.0〜1.0（敵の警戒度）
    exposureRate: 0.0,         // 0.0〜1.0（計画暴露率）
    PressHeat: 0.0,            // 0.0〜1.0（報道熱量）
    M_legal: 1.0,              // 0.0〜1.0（手続適法性）
    chainIntegrity: 1.0,       // 0.0〜1.0（証拠連鎖健全性）
    auditHeat: 0.0,            // 0.0〜1.0（資金監査圧力）
  },
  leaks: false,
  exposureResult: "未発覚",
  bureaucracyPressure: {},     // { "警察庁": 0.3, "公安調査庁": 0.1, ... }（0.0〜1.0）
  intelMeeting: false,
  jointMeeting: false,

  // ダイス（最後の出目。診断用）
  lastD100: null,
  lastD6: null,

  // 任務
  missionName: "—",
  missionStage: "情報収集",    // 情報収集 / 内偵 / 逮捕・取り調べ
  missionPhaseLevel: 0,        // 0〜3。高いほど intelPool の解禁数が増える
  missionStatus: "進行中",
  sideMissions: [],            // [{ id, name, completed, bonus }]

  // 作戦（null or 稼働中の作戦オブジェクト）
  currentOp: null,
  /*
  currentOp: {
    name, days, daysRemaining, personnel,
    cost, dailyCost, status,   // "active" | "complete"
    description, risk,
    method,                    // "legal" | "illegal"（シナリオ_jp2025のみ）
    evidenceValid,             // methodに応じてlegal.jsが設定
  }
  */

  // 評価
  evalAxes: { mission: 0, legality: 0, exposure: 0, civil: 0, budget: 0, time: 0, procedure: 0, chain: 0 },
  evalTotal: 0,
  evalRank: null,              // "S" | "A" | "B" | "C"

  // エンディング・実績
  pendingEndings: [],          // 条件を満たしたエンディングid（即終了ではなく選択肢として提示）
  unlockedAchievements: [],

  // ログ（直近60件）
  log: [],                     // [{ day, type, desc }]

  // シナリオ固有変数（アクティブなシナリオのみ）
  // 詳細は「シナリオシステム」セクション参照
  scenarioVars: {},
};
```

---

## ワールドデータベース（worldDB.js）

### worldEvents — 全NPCの裏側行動記録

プレイヤーには不可視。GMとNPCエージェントのみ参照可能。

```javascript
// worldEvent オブジェクト
{
  id: "we_001",
  day: 3,
  actor: "enemy_chen",          // 行動主体NPC id
  action: "dead_drop",          // 行動種別
  target: "enemy_kim",          // 対象NPC id（あれば）
  location: "新宿区大久保",
  description: "陳がキムに接触。新たな指令書を渡した。",
  significance: 3,              // 0〜5（重要度）
  discoverable: true,
  discoveryMethods: [
    "surveillance_enemy_chen",  // 陳を監視していた場合
    "informant_inf_yamamoto",   // 山本が知っている場合
    "sigint",                   // 通信傍受
  ],
  discovered: false,
  discoveredDay: null,
  expiresDay: 10,               // この日数を過ぎると発見不可能
  phaseRequired: 0,             // missionPhaseLevel がこれ以上で解禁
}
```

### intelPool — プレイヤーへの情報断片プール

```javascript
// intelPool エントリ
{
  id: "intel_001",
  linkedEvent: "we_001",
  content: "新宿区大久保で東アジア系男性二人の接触を確認",
  reliability: 0.8,             // 0.0〜1.0（1.0未満は偽情報混入リスク）
  source: "surveillance",
  accessLevel: 2,               // 必要な捜査深度（0=誰でも / 5=高度工作のみ）
  npcRequired: null,            // 特定NPCが必要な場合（informant idなど）
  skillRequired: null,          // 必要なスキル種別
  claimed: false,
}
```

### npcStates — NPCの現在状態スナップショット

```javascript
// npcStates["enemy_chen"]
{
  location: "新宿区",
  activity: "active",           // active / dormant / fleeing / arrested
  currentPlan: "we_005",        // 現在進行中の worldEvent id
  alertLevel: 0.4,              // 0.0〜1.0（こちらへの警戒度）
  knownToPlayer: false,
  knownInfoAboutPlayer: [],     // このNPCがプレイヤー側について把握している事項
}
```

---

## 情報スコープ（infoScope.js）

NPCをLLMで呼ぶ直前に `buildInfoScope(npcId)` でスコープを構築し、
システムプロンプトに注入する。これにより情報漏洩を防ぐ。

### スコープ決定ロジック

```javascript
function buildInfoScope(npcId) {
  const npc = registry.get(npcId);
  return {
    // 1. 自分が直接関与したイベント
    direct: worldEvents.filter(e => e.actor === npcId || e.target === npcId),

    // 2. 同組織メンバーの行動（組織内共有情報）
    org: worldEvents.filter(e => getOrgOf(e.actor) === npc.org && e.actor !== npcId),

    // 3. ロール特権情報（役職に応じて異なる）
    rolePrivilege: getRolePrivileges(npc.role),
    /*
      マスコミ  → 公開情報・リーク情報のみ
      上司      → playerReportsに記録された情報のみ（プレイヤーが報告したもの）
      協力者    → 自分の生活圏・職場で得た情報のみ
      捜査員    → 派遣先で直接見聞きしたもの + 受けたブリーフィング
      敵スパイ  → 自組織の計画 + alertLevelに応じてプレイヤー側の情報が増加
    */

    // 4. フェーズアンロック（捜査が深まると開示範囲が広がる）
    phaseUnlocked: worldEvents.filter(e => e.phaseRequired <= GS.missionPhaseLevel),

    // 5. ハードブロック（絶対に知らない情報）
    hardBlocked: getHardBlocks(npcId),
    // 例: 自分の正体が割れていることをスパイはまだ知らない
    // 例: 山本はMSSの指揮系統を知らない
  };
}
```

### スコープ階層早見表

```
情報の種類              | 敵スパイ | 協力者 | 捜査員 | 上司 | マスコミ
------------------------|----------|--------|--------|------|----------
自分の行動記録          | ○        | ○      | ○      | ○    | ○
同組織の内部計画        | ○        | ×      | △ *1   | ○    | ×
プレイヤーの捜査内容    | △ *2     | △ *3   | ○      | △ *4 | △ *5
他陣営の内部情報        | ×        | ×      | ×      | ×    | ×
公開情報・報道          | ○        | ○      | ○      | ○    | ○

*1 報告を受けた内容のみ
*2 alertLevel が上がるにつれて知る範囲が広がる
*3 Loyalty（0〜100）に応じて共有される情報量が変わる
*4 プレイヤーが報告した内容のみ（隠蔽可能）
*5 リーク情報・公開情報のみ
```

### NPCシステムプロンプト注入

```javascript
function buildNpcSystemPrompt(npcId, contactContext) {
  const npc = registry.get(npcId);
  const scope = buildInfoScope(npcId);
  const scopeText = formatScopeAsNarrative(scope); // 自然言語に変換

  return `
あなたは「${npc.name}」です。

【人格】
${npc.personality}

【立場・所属】
${npc.role} / ${npc.org}

【あなたが現在知っていること】
（あなたはこの情報のみを知っています。これ以外のことは知りません。）
${scopeText}

【過去の接触記録】
${formatMemories(npc.memories)}

【重要な制約】
- あなたはゲームのNPCであることを認識しません
- 上記「知っていること」に含まれない情報は一切語ってはいけません
- 知らないことを聞かれたら、知らないキャラクターとして自然に応答してください
- 現在の接触状況: ${contactContext}
`;
}
```

---

## ワールドシミュレーター（worldSim.js）

### 毎ターン処理フロー

```
advanceDay() 呼び出し
  │
  ├─ [LLMなし] バックグラウンド判定（mechanics.js）
  │    ├── D6 / D100 ロール → GS.lastD6 / GS.lastD100 に記録
  │    ├── 官庁横槍 / リーク / 敵カウンター / 暴露判定
  │    ├── 予算日次控除・作戦残日数カウント・要員返還
  │    ├── 捜査員疲弊・ストレス蓄積
  │    └── シナリオ固有判定（checkScenarioMechanics）
  │
  └─ [ルールベース優先] ワールドアクション生成
       simulateWorldTurn()
       ├── 各NPCの行動を actionRules から確率選択
       ├── 選択した行動を worldEvents に追記
       ├── 発見可能な断片を intelPool に追加
       ├── npcStates を更新
       └── 複雑な接触シーンのみ LLM で描写生成（WORLDACTIONタグ）
```

### NPCタイプ別行動確率テーブル（actionRules.js）

```javascript
const ACTION_RULES = {
  enemy: {
    low_alert: {          // alertLevel 0.0〜0.3: 積極工作フェーズ
      "dead_drop":           0.3,
      "recruit_informant":   0.2,
      "intelligence_gather": 0.3,
      "meet_handler":        0.2,
    },
    mid_alert: {          // alertLevel 0.3〜0.7: 慎重行動フェーズ
      "surveillance_check":  0.4,
      "route_change":        0.3,
      "go_dormant":          0.2,
      "emergency_contact":   0.1,
    },
    high_alert: {         // alertLevel 0.7〜1.0: 退避・妨害フェーズ
      "flee":                0.4,
      "counter_measure":     0.3,
      "go_dormant":          0.2,
      "sacrifice_asset":     0.1, // 協力者を切り捨てる
    },
  },
  informant: {
    high_loyalty: {       // loyalty 70〜100
      "gather_info":         0.5,
      "report_to_handler":   0.3,
      "maintain_cover":      0.2,
    },
    low_loyalty: {        // loyalty 0〜30: 離反リスク
      "withhold_info":       0.3,
      "contact_enemy":       0.2, // 二重スパイ化の芽
      "maintain_cover":      0.3,
      "gather_info":         0.2,
    },
  },
  superior: {
    default: {
      "request_report":      0.4,
      "political_pressure":  0.3,
      "budget_review":       0.2,
      "approve_quietly":     0.1,
    },
  },
};
```

---

## プレイヤーによる情報取得フロー

```
プレイヤーの操作
  │
  ├─ 監視（surveillance）
  │    discoveryMethods に "surveillance_{npcId}" が含まれる worldEvent を抽出
  │    捜査員スキル（surveillance, 0〜100）で取得精度が変わる
  │    → 該当 intelPool を claimed=true にして提示
  │    → LLMなし（ルールベース処理のみ）
  │
  ├─ 協力者への質問
  │    informant の infoScope ∩ 質問内容 で回答可能範囲を決定
  │    loyalty < 30 の場合: reliability 低下 or 偽情報混入
  │    → LLMに infoScope を注入して応答生成
  │
  ├─ 捜査員派遣（内偵）
  │    discoveryMethods に "investigator" を持つ worldEvent を抽出
  │    捜査員の info_gathering スキル（0〜100）で精度が変わる
  │    fatigue が高いと失敗・露見リスク上昇
  │
  ├─ 通信傍受（SIGINT）
  │    discoveryMethods に "sigint" を持つ worldEvent を抽出
  │    装備「特殊通信装置」消費 / commsHub のtapSlots消費
  │    許可なしの場合: ViolationCode=warrant_missing + M_legal低下
  │
  ├─ 上司・他官庁への照会
  │    相手の infoScope 内の情報のみ開示
  │    bureaucracyPressure が高いと「情報出し渋り」（interagencyVetoBaseで判定）
  │
  └─ 直接接触
       最も多くの情報を得られる
       プレイヤー本人の身元露出リスクあり
```

### 接触方式マトリクス

| 接触方式 | 身元露出 | 信頼構築速度 | 情報深度 | リスク |
|---|---|---|---|---|
| プレイヤー直接 | 高 | 速い | 深い | 本人が燃える |
| 捜査員経由 | 低 | 捜査員trust_buildingスキル依存 | 中程度 | 捜査員が燃える可能性 |
| 監視のみ | なし | なし | 表面のみ | 発覚リスクのみ |
| 偽装接触 | 偽造ID消費 | 中程度 | 中程度 | ID発覚リスク |

---

## playerKnowledge — プレイヤーの既知情報ストア

```javascript
const playerKnowledge = {
  confirmedFacts: [
    // { id, content, sourceEvent, sourceIntel, acquiredDay, reliability, tags }
  ],
  suspicions: [],        // 確信度の低い情報（グレー）
  leads: [],             // 未確認の手がかり
  knownNpcs: [],         // 存在を把握しているNPC id

  // 上司への報告済み情報（隠蔽したものはここに含まれない）
  reportedToSuperior: [],
};
```

---

## NPCレジストリ設計（registry.js）

**スキル値は全NPC共通で 0〜100 スケール。**

```javascript
const NPCS = {
  investigators: [
    /*
    {
      id: "inv_tanaka",
      name: "田中 浩二",
      role: "外事担当 捜査員",
      status: "available",     // available / deployed / injured / compromised
      skills: {
        info_gathering: 65,    // 情報収集（0〜100）
        surveillance: 55,      // 尾行・監視
        trust_building: 30,    // 信頼構築（低いと協力者が心を開かない）
        interrogation: 50,     // 取調べ
        cyber: 20,             // サイバー
      },
      fatigue: 0,              // 0〜100（高いとミス率上昇）
      stress: 0,               // 0〜100（精神負荷）
      integrity: 80,           // 0〜100（職務倫理。低いと汚職リスク上昇）
      personalDebt: 10,        // 0〜100（負債・弱み）
      loyalty: 90,             // 0〜100（低いと内部リーク源になる）
      traits: ["cautious"],    // ["nightOwl","techSavvy","reckless","cautious"]
      personality: "元外事警察OB。几帳面で慎重。",
      memories: [],            // [{ day, event }]（イベントメモ）
      recentHistory: [],       // LLM会話履歴（直近10件上限）
      deployedTo: null,        // 派遣先NPC id
      infoScope: {
        directObservations: [],
        briefings: [],
        personal: [],
      },
    }
    */
  ],

  superiors: [
    /*
    {
      id: "sup_sasaki",
      name: "警備局長 佐々木",
      org: "警察庁警備局",
      authority: 3,            // 1〜3（承認権の強さ）
      personality: "キャリア官僚。政治的配慮を最優先。",
      relation: 50,            // 0〜100（プレイヤーとの関係値）
      reportRequired: true,
      approvalThreshold: 30_000_000,  // この金額以上の作戦は承認が必要
      memories: [],
      recentHistory: [],
      infoScope: {
        playerReports: [],     // プレイヤーから受けた報告のみ
        orgIntelligence: [],   // 警察庁独自情報
        politicalContext: [],
      },
    }
    */
  ],

  informants: [
    /*
    {
      id: "inf_yamamoto",
      name: "山本 健",
      cover: "貿易会社勤務",
      org: "中国大使館 関係者",
      loyalty: 60,             // 0〜100（30未満で偽情報リスク）
      contactMethod: "dead_drop",
      personality: "金銭的問題を抱える。家族を大切にする。",
      operationCost: 200_000,
      memories: [],
      recentHistory: [],
      infoScope: {
        orgAccess: ["中国大使館一般職員の動向", "大使館周辺の定期的な接触"],
        personalNetwork: ["貿易関係者X", "大使館員Y"],
        hardBlocked: ["MSSの指揮系統", "工作計画の全体像"],
      },
    }
    */
  ],

  enemies: [
    /*
    {
      id: "enemy_chen",
      name: "陳 偉（推定）",
      org: "中国国家安全部（MSS）",
      hostility: 60,           // 0〜100
      alertLevel: 0.2,         // 0.0〜1.0（こちらへの警戒度。GS.meters.enemyAlertnessと連動）
      cover: "留学生",
      personality: "冷静・専門的。感情を見せない。",
      knownInfoAboutPlayer: [],
      memories: [],
      recentHistory: [],
      infoScope: {
        ownPlans: [],
        orgIntel: [],
        playerSideKnowledge: [], // alertLevel >= 0.6 でここに情報が入り始める
      },
    }
    */
  ],

  agencies: [],  // 他官庁（agency.js参照）
  media: [],     // マスコミ（media.js参照）
};
```

---

## 記憶管理（memory.js）

NPCの記憶は3段階で管理する。LLMを呼ぶのは自動要約のみ。

```javascript
// 段階1: イベントメモ（軽量・永続）
// memories: [{ day: 3, event: "初接触。謝礼20万円。大使館員の移動パターンを提供" }]

// 段階2: 最近の会話履歴（直近10件上限）
// recentHistory: [{ role: "user", content: "..." }, { role: "assistant", content: "..." }]
// 上限超えた分は要約して memories に移動

// 段階3: 接触終了後の自動要約（LLM使用）
async function summarizeContact(npcId, history) {
  const summary = await llm.call(SUMMARY_SYSTEM, [
    { role: "user", content: `以下の会話から重要事項を1〜2文で要約してください:\n${JSON.stringify(history)}` }
  ]);
  const npc = registry.get(npcId);
  npc.memories.push({ day: GS.day, event: summary });
  npc.recentHistory = npc.recentHistory.slice(-10);
}
```

---

## LLMエージェント呼び出しフロー

```
プレイヤーの指示
  │
  ├─ [GM] 場面進行・状況報告（gm.js）
  │    system: GM_SYSTEM_PROMPT（下記参照）
  │            + playerKnowledge のサマリー
  │            + 現在フェーズ・作戦状況
  │    → STATEタグでGS更新
  │    → OPERATIONタグで作戦提案
  │
  └─ [NPC接触] 接触方式に応じてエージェントを選択
       │
       ├─ 直接接触
       │    ① buildInfoScope(npcId)
       │    ② buildNpcSystemPrompt(npcId, scope)
       │    ③ NPC LLM 呼び出し
       │    ④ 接触終了後: summarizeContact() → NPCEVENTタグで状態更新
       │
       ├─ 捜査員経由
       │    ① 捜査員の infoScope でフィルタ（捜査員が知らないことはNPCに伝わらない）
       │    ② 捜査員エージェント LLM 呼び出し
       │    ③ 捜査員エージェントがNPCエージェントを呼び出す
       │    ④ 結果を捜査員メモ + playerKnowledge に反映
       │
       └─ 監視のみ
            worldEvents から discoveryMethods を照合してintelPool取得
            LLMなし（ルールベース処理のみ）
```

### GM システムプロンプト（gm.js）

```
あなたは「NOCTIVIGIL」のGM（ゲームマスター）です。

場面の進行と状況管理を担当します。以下を同時に演じます：
①部下・味方捜査官 ②敵スパイ・工作員 ③マスコミ記者（敵対/中立/協力）
④他官庁担当者（警察庁・公安調査庁・CIRO・防衛省情報本部等）
⑤政治アクター ⑥協力者・二重スパイ

【ルール】
- 1ターン＝1日。各レスポンス冒頭「Day X（YYYY年MM月DD日）:」
- プレイヤーへの行動提案・次手の示唆は絶対禁止
- 情報は客観的かつ詳細に。敵・他機関はリアルに、時に理不尽に動くこと
- グレー・違法捜査も選択肢（リスクと効率を必ず併存させること）

作戦を提案・確認する際のみ末尾直前に:
<OPERATION>{"name":"作戦名","days":日数,"personnel":人数,"cost":費用(円),"description":"概要","risk":"リスク"}</OPERATION>

NPC接触終了時のみ:
<NPCEVENTS>[{"npcId":"...","loyaltyDelta":0,"hostilityDelta":0,"newMemory":"要約","intelGained":{"content":"...","reliability":0.8}}]</NPCEVENTS>

ワールド行動（LLM描写生成時のみ）:
<WORLDACTION>{"actor":"...","action":"...","location":"...","significance":3,"discoverable":true,"discoveryMethods":["..."],"expiresDay":10,"narrative":"..."}</WORLDACTION>

必ず各レスポンス末尾にSTATEタグ:
<STATE>{"meters":{"enemyAlertness":0.15,"exposureRate":0.0,"PressHeat":0.0,"M_legal":1.0,"chainIntegrity":1.0},"leaks":false,"bureaucracyPressure":{},"missionName":"...","missionStage":"情報収集","missionPhaseLevel":0,"missionStatus":"進行中","sideMissions":[],"scenarioVars":{}}</STATE>
```

---

## タグ仕様（LLM → JS）

| タグ | 用途 | 必須 |
|---|---|---|
| `<STATE>` | GS更新。`meters`・`missionStage`・`scenarioVars`を含む | 毎ターン必須 |
| `<OPERATION>` | 秘書官パネルに作戦提案を表示 | 作戦提案時のみ |
| `<NPCEVENTS>` | loyaltyDelta / hostilityDelta / newMemory / intelGained | NPC接触終了時のみ |
| `<WORLDACTION>` | ワールドシミュレーションのLLM描写生成 | 複雑場面のみ |

**パースは防御的に行う。JSONパース失敗時は前の状態を維持する。**

---

## 法令・令状・証拠保全（legal.js）

### 主要メーター（すべて0.0〜1.0）

```javascript
// M_legal: 手続適法性
// M_legal = clamp01(a1*S_warrant − a2*P_violation + a3*chainIntegrity − a5*coverage_overreach)
// 推奨係数: a1=0.5, a2=0.4, a3=0.3, a5=0.6

// S_warrant: 令状適合スコア
// S_warrant = valid ? fit * (1 − coverage_overreach) : 0
// fit = Jaccard(scope_actual, scope_authorized)

// chainIntegrity: 証拠連鎖の健全性
// 移送ごとに -= 0.03 * chainTransferLossMult（難易度係数）
// 開封ごとに -= 0.02（正当理由あり: 0.01）
```

### 違反分類（sev: 1〜3 = 軽微〜重大）

```javascript
const VIOLATIONS = {
  warrant_missing: { procFaultMult: 2, mLegalDelta: -0.10, pressHeatDelta: +0.05 },
  overreach:       { procFaultMult: 1, mLegalDelta: -0.07, pressHeatDelta: +0.04 },
  custody_break:   { procFaultMult: 1, mLegalDelta: -0.05, pressHeatDelta: +0.03 },
  brutality:       { procFaultMult: 3, mLegalDelta: -0.15, pressHeatDelta: +0.10 },
};
// 適用: ΔM_legal = table.mLegalDelta * sev * pressSensitivity（難易度係数）
```

### 起訴確率

```javascript
// pCharge = sigmoid(α*readiness + β*judgeBias + γ*pressTilt + ζ*M_legal − δ*procedureFaults)
// 推奨係数: α=1.2, β=0.6, γ=0.4, ζ=0.8, δ=0.7
// readiness = clamp(0.5*EvdScore + 0.3*CoverageCompleteness + 0.2*WarrantRatio, 0, 1)
```

---

## 人員システム（investigator.js）

```javascript
// タスク成功率
// pTask = baseSuccess * (skillFit/100) * (1 - fatigue/150) * (1 - stress/200) * traitMod

// 汚職リスク（EXPOSED難易度時のみ有効）
// pCorrupt = scenarioK * max(0, personalDebt - integrity) / 100
// pBetray = pCorrupt * (1 - loyalty/100)
// scenarioK: シナリオ別係数（jp2025=0.5, italy=0.8, mexico=1.0等）

// 疲弊・ストレス推移
// 行動割当: +fatigue 10〜20/ターン, +stress 5〜10/ターン
// 休養割当: -fatigue 15/ターン, -stress 10/ターン
```

---

## インフラシステム（infraDB.js）

```javascript
// 共通: cover(0〜1), status("online"|"flagged"|"burned"|"destroyed")
// pExposeTurn = exposureBase * exposureMult * activityCoef * (1-cover) * (1-securityCoef)

const INFRA_DEFAULTS = {
  safehouse: {
    ENCRYPTED: { cover:0.7, beds:5, security:5, exposureBase:0.005 },
    DECRYPTED: { cover:0.5, beds:4, security:4, exposureBase:0.010 },
    EXPOSED:   { cover:0.35, beds:3, security:4, exposureBase:0.020 },
  },
  commsHub: {
    // pTap = base * g(sigintLvl, security) * warrantFactor
    // warrantFactor: 有効令状=1.0 / 緊急=0.6 / 無令状=0.2
    ENCRYPTED: { tapSlots:4, sigintLvl:2, speed:"normal" },
    DECRYPTED: { tapSlots:4, sigintLvl:2, speed:"normal" },
    EXPOSED:   { tapSlots:3, sigintLvl:1, speed:"slow" },
  },
  lab: {
    // qualityOut = min(1.0, qualityIn + 0.06*forensicKit)
    ENCRYPTED: { throughput:3, forensicKit:2 },
    DECRYPTED: { throughput:3, forensicKit:2 },
    EXPOSED:   { throughput:2, forensicKit:1 },
  },
};
```

---

## AIディレクター（aiDirector.js）

目標勝率帯55〜65%に収束させる動的難易度調整。LLMなし。
演出は「特例予算」「記者リーク」などの世界内イベント名で隠蔽する。

```javascript
const AI_DIRECTOR = {
  targetWinRate: 0.60,
  clampRange: 0.15,
  window: 3,  // 直近N回の作戦評価を参照

  rescue: {   // 連敗時の救済
    pressDecayDelta: +0.02,
    baseSlotsDelta: +1,
    enemyAlertnessDelta: -0.10,   // 0.0〜1.0スケール
    readinessBoost: +0.1,
  },
  clamp: {    // 連勝時の抑制
    enemyAlertnessDelta: +0.10,
    pressHeatDelta: +0.05,
    leakWeightDelta: +0.1,
    auditHeatDelta: +0.05,
  },
};

function runAIDirector(GS, recentRanks) {
  const avg = recentRanks.reduce((s,r) => s + {S:4,A:3,B:2,C:1}[r], 0) / recentRanks.length;
  if (avg <= 1.5) applyRescue(GS);
  if (avg >= 3.5) applyClamp(GS);
}
```

---

## イベントシステム（eventDB.js）

### EventDefスキーマ

```javascript
{
  id: "ev.press.cyclone",
  category: "ops|legal|press|faction|infra|personnel|tech|economy|world",
  rarity: "common|uncommon|rare|epic|mythic",  // weight係数: 1.0/0.6/0.3/0.12/0.05
  weight: 1.0,
  cooldown: 6,
  prereq: {
    flags: [],
    meters: { PressHeat: ">=0.5" },       // DSLで記述
    difficulty: ["EXPOSED"],              // 難易度限定イベントはここで制御
  },
  blacklist: { flags: [], status: ["gameover"] },
  chain: { next: ["ev.id2"], gate: "any", window: 5 },
  effects: [{ type: "PressHeat", "+": 0.15 }],
  ui: "news|brief|popup|feed|silent",
}

// 抽選パイプライン（毎ターン・LLMなし）:
// weight' = baseWeight * rarityCoef * difficultyCoef * worldCoef * directorCoef * scenarioCoef
// 同カテゴリ連続3回で weight *= 0.5（減衰）
// multinomial(weight') で最大N件選出 → cooldown更新 → 連鎖スケジュール
```

### ノイズ vs 虚報

```
intelNoiseRate（ノイズ）: 情報の不確実性・欠落。「推定」として提示。DECRYPTEDでも発生。
misinfoProb（虚報）:      敵の意図的誤情報。後段の検証まで真偽未確定。EXPOSED限定。
```

---

## 難易度システム（difficulty.json）

**優先度: default → シナリオ → 難易度 → 周回モード**

| 名称 | 想定層 | 特徴 |
|---|---|---|
| ENCRYPTED | 初級 | ヒントあり・失敗フラグ無効・敵欺瞞なし・Guard（自動ロールバック） |
| DECRYPTED | 中級 | 補助なし・要請式ブリーフ週1回・失敗有効・特殊エンディング閲覧可だが実績不可 |
| EXPOSED | 上級 | 虚報・逆工作・二重スパイ有効・即詰みStrict・全実績取得対象 |

```json
{
  "ENCRYPTED": {
    "hintEnabled": 1,
    "intelNoiseRate": 0.00,
    "reportLatencyMult": 0.90,
    "exposureMult": 0.80,
    "leakChancePerTurn": 0.00,
    "leakImpactMult": 0.80,
    "misinfoProb": 0.00,
    "fakeTaskInjectionRate": 0.00,
    "doubleAgentMonthly": 0.00,
    "loyaltySystemEnabled": 0,
    "failureFlagRate": 0.00,
    "instantFailPolicy": "Guard",
    "pressSensitivity": 0.85,
    "pressDecayMult": 1.05,
    "bureaucracyPressureInit": 0.0,
    "interagencyVetoBase": 0.05,
    "enemyAlertnessBase": 0.10,
    "scoreWeightsProfile": "E1",
    "chainTransferLossMult": 0.50,
    "humintReliability": 0.85
  },
  "DECRYPTED": {
    "hintEnabled": 0,
    "briefOnDemandPerWeek": 1,
    "intelNoiseRate": 0.02,
    "reportLatencyMult": 1.00,
    "exposureMult": 1.00,
    "leakChancePerTurn": 0.01,
    "leakImpactMult": 1.00,
    "misinfoProb": 0.00,
    "fakeTaskInjectionRate": 0.00,
    "doubleAgentMonthly": 0.00,
    "loyaltySystemEnabled": 0,
    "failureFlagRate": 0.02,
    "instantFailPolicy": "Review",
    "pressSensitivity": 1.00,
    "pressDecayMult": 1.00,
    "bureaucracyPressureInit": 0.3,
    "interagencyVetoBase": 0.12,
    "enemyAlertnessBase": 0.15,
    "scoreWeightsProfile": "D1",
    "chainTransferLossMult": 1.00,
    "humintReliability": 0.78
  },
  "EXPOSED": {
    "hintEnabled": 0,
    "briefOnDemandPerWeek": 0,
    "intelNoiseRate": 0.15,
    "reportLatencyMult": 1.15,
    "exposureMult": 1.25,
    "leakChancePerTurn": 0.04,
    "leakImpactMult": 1.25,
    "misinfoProb": 0.15,
    "fakeTaskInjectionRate": 0.05,
    "doubleAgentMonthly": 0.10,
    "loyaltySystemEnabled": 1,
    "loyaltyJitterPerWeek": 0.01,
    "loyaltyDecayBase": 0.02,
    "failureFlagRate": 0.06,
    "instantFailPolicy": "Strict",
    "pressSensitivity": 1.30,
    "pressDecayMult": 0.90,
    "bureaucracyPressureInit": 0.6,
    "interagencyVetoBase": 0.20,
    "enemyAlertnessBase": 0.25,
    "scoreWeightsProfile": "X1",
    "chainTransferLossMult": 1.25,
    "humintReliability": 0.65
  }
}
```

### 即詰みポリシー

```javascript
// Guard（ENCRYPTED）: 致命条件を検知したら自動ロールバック＋警告
// Review（DECRYPTED）: 致命条件で「監督レビュー」フェーズ遷移（大幅減点）
// Strict（EXPOSED）: 以下のいずれかで即時失敗
function checkInstantFail(GS, diff) {
  if (diff.instantFailPolicy !== "Strict") return false;
  const m = GS.meters;
  if (m.M_legal < 0.20 && m.PressHeat >= 0.70) return "legal_press_fail";
  if (m.exposureRate >= 0.85 && m.enemyAlertness >= 0.70) return "exposure_enemy_fail";
  if (m.chainIntegrity <= 0.60 && GS.violations?.some(v => v.sev >= 2)) return "chain_violation_fail";
  return false;
}
```

### スコア重みプロファイル（合計=1.0）

```javascript
const SCORE_PROFILES = {
  E1: { mission:0.35, legality:0.20, exposure:0.15, civil:0.10, budget:0.08, time:0.05, procedure:0.04, chain:0.03 },
  D1: { mission:0.25, legality:0.15, exposure:0.20, civil:0.10, budget:0.10, time:0.08, procedure:0.06, chain:0.06 },
  X1: { mission:0.20, legality:0.15, exposure:0.25, civil:0.15, budget:0.05, time:0.05, procedure:0.05, chain:0.10 },
};
```

---

## シナリオシステム（data/scenarios/）

コアシステムは共通。シナリオ固有の変数・ルール・エンディングは各JSONに記述する。
`GS.scenarioVars` はアクティブなシナリオの変数**のみ**を持つ（全シナリオを同居させない）。

### シナリオ一覧

| ID | 舞台・時代 | 役職 | 固有メカニクス |
|---|---|---|---|
| scenario_jp2025 | 2025年 東京 | 警視庁公安部チーフ | PublicOpinion / 令状主義 / 適法化プロセス |
| scenario_dea1990 | 1990年 メキシコ | DEA駐在捜査官 | Exposure(0〜5) / AssassinationRisk / CorruptionMeter |
| scenario_stasi1985 | 1985年 東ベルリン | シュタージ中級幹部 | ParanoiaLevel / PurgeRisk / 冤罪フラグ / 隠しKarma / 1989年リミット |
| scenario_sid1970 | 1970年 イタリア | SID捜査官 | FactionBalance（5軸） / ロッジP2隠しイベント |
| scenario_kmt1945 | 1945〜49年 中国 | 中統現地指揮官 | Karma(-100〜+100) / 亡命先選択 / 歴史的リミット |

### シナリオJSONスキーマ

```json
{
  "id": "scenario_jp2025",
  "title": "2025年の日本",
  "org": "警視庁公安部",
  "startRank": "チーフ（係長格）",
  "startDate": "2025-04-07",
  "timeLimit": null,
  "victoryCondition": "警察庁公安局トップへの昇進",
  "defeatConditions": [
    { "id": "dismissal",  "trigger": "illegalOpsExposed && noRecovery", "label": "違法捜査露見→免職" },
    { "id": "publicFail", "trigger": "scenarioVars.publicOpinion <= 0", "label": "世論0→国会追及で失脚" },
    { "id": "leakFail",   "trigger": "criticalLeakExposed",             "label": "内部リーク→証拠不正が報道で露呈" }
  ],
  "scenarioVarsInit": {
    "publicOpinion": 50,
    "prefectureConflict": 0,
    "illegalOpsCount": 0,
    "legalizationSuccessCount": 0,
    "concealmentSuccessCount": 0
  },
  "specialRules": [
    { "id": "warrant_system", "label": "令状主義",
      "description": "正規手続: 令状申請→裁判所承認→時間コスト+2〜3日、証拠有効\n違法捜査: 即効性・高成功率、証拠能力ゼロ、露見時に降格/免職フラグ" },
    { "id": "legalization",   "label": "適法化（リカバリー）プロセス",
      "description": "違法入手情報を別件逮捕・伝聞証拠・匿名供述などで正規化。ダイス+敵反撃+マスコミ介入で判定" },
    { "id": "concealment",    "label": "隠蔽能力",
      "description": "違法捜査の痕跡を処理。成功→不問、失敗→即政治問題化" }
  ],
  "promotionRoute": [
    "係長（チーフ）", "課長補佐", "課長", "次長", "部長",
    "警察庁警備局幹部", "警察庁警備局長（クリア）"
  ],
  "endings": [
    { "id": "end_zero",              "title": "ゼロへの昇格",         "type": "special_victory" },
    { "id": "end_watchdog",          "title": "飼い慣らされた番犬",   "type": "special_victory" },
    { "id": "end_scapegoat",         "title": "スケープゴート",       "type": "special_defeat"  },
    { "id": "end_crusher",           "title": "潰し屋",               "type": "special_victory" },
    { "id": "end_reorganize_success","title": "再編成（成功）",       "type": "special_victory" },
    { "id": "end_reorganize_fail",   "title": "再編成（失敗）",       "type": "special_defeat"  },
    { "id": "end_security_hole",     "title": "セキュリティホール",   "type": "special_victory" },
    { "id": "end_public_king",       "title": "世論の王",             "type": "special_victory" }
  ],
  "achievements": []
}
```

### シナリオ固有判定ルール（LLMなし）

```javascript
// mechanics.js の checkScenarioMechanics(GS) から呼ばれる

// scenario_stasi1985
function checkStasiParanoia(sv) {
  sv.paranoiaLevel = Math.max(1.0, sv.paranoiaLevel); // 0には絶対に戻らない
  if (sv.paranoiaLevel >= 3) triggerEvent("internal_audit");
  if (sv.paranoiaLevel >= 5) triggerDefeat("purge");   // 即粛清
}

// scenario_sid1970
function checkFactionBalance(sv) {
  const fb = sv.factionBalance;
  if (fb.partiti >= 90)         triggerEvent("authoritarian_crisis");
  if (fb.popolo >= 90)          triggerEvent("general_strike");
  if (fb.mafia >= 90)           triggerEvent("judicial_assassination");
  if (fb.destraViolence >= 90)  triggerEvent("right_terror");
  if (fb.sinistraViolence >= 90) triggerEvent("armed_uprising");
}

// scenario_kmt1945: 亡命先 × カルマ の組み合わせでエンディングを決定
function resolveExileEnding(destination, karma) {
  const isPositive = karma > 0;
  const table = {
    taiwan:   { positive: "end_purge",        negative: "end_anti_communist_hero" },
    usa:      { positive: "end_useful_asset", negative: "end_rejected" },
    japan:    { positive: "end_stateless",    negative: "end_shadow_escape" },
    mainland: { positive: "end_reeducation",  negative: "end_peoples_trial" },
  };
  return table[destination]?.[isPositive ? "positive" : "negative"];
}

// scenario_dea1990
function checkAssassinationRisk(sv) {
  if (sv.exposure >= 3) {
    if (Math.random() < sv.assassinationRisk / 100) triggerEvent("assassination_attempt");
  }
}

// scenario_jp2025: 令状プロセス時間コスト
function processWarrant(op) {
  if (op.method === "legal") {
    op.days += Math.floor(Math.random() * 2) + 2;
    op.evidenceValid = true;
  }
  if (op.method === "illegal") {
    op.evidenceValid = false;
    GS.meters.exposureRate = Math.min(1.0, GS.meters.exposureRate + 0.15);
    GS.scenarioVars.illegalOpsCount++;
  }
}
```

### エンディング・実績管理（evaluation.js）

```javascript
// エンディング条件チェック（毎ターン）
// 条件を満たすと pendingEndings に積む（即終了ではなく選択肢として提示）
function checkEndingConditions(GS) {
  const scenario = loadScenario(GS.scenarioId);
  for (const ending of scenario.endings) {
    if (!GS.pendingEndings.includes(ending.id) && evaluateCondition(ending, GS)) {
      GS.pendingEndings.push(ending.id);
    }
  }
}

// 実績チェック（アクション発生時）
function checkAchievements(GS, action) {
  const scenario = loadScenario(GS.scenarioId);
  for (const ach of scenario.achievements) {
    if (!GS.unlockedAchievements.includes(ach.id) && evaluateCondition(ach, GS, action)) {
      GS.unlockedAchievements.push(ach.id);
    }
  }
}
```

---

## カスタム難易度（customDifficulty.json）

```javascript
// 難易度コードをシリアライズしてフレンド間シェア可能（例: NOC-EX-12a9-f5b）
// hiddenEndingEligible=true かつ base=EXPOSED でのみ特殊実績解放
// diagnosticMode=true では実績無効（開発・テスト用）
{
  "base": "EXPOSED",
  "modifiers": {
    "infoDisclosure": 0.2,
    "misinfoProb": 0.3,
    "leakChancePerTurn": 0.2,
    "exposureMult": 1.5,
    "pressSensitivity": 1.8,
    "fatalFlagRate": 1.2,
    "aiDirectorRescue": false,
    "aiDirectorClamp": true,
    "personnelFragility": 1.3,
    "infraFragility": 1.2,
    "techGrowthRate": 0.8,
    "factionAggression": 1.5
  },
  "flags": {
    "achievementsEnabled": true,
    "hiddenEndingEligible": true,
    "diagnosticMode": false
  }
}
```

---

## 実装優先順位

### Phase 1 — コア基盤
- [x] GS・playerKnowledge 定義（gameState.js）
- [x] ダイス・日付・予算・フラグ判定（mechanics.js）
- [x] LLMクライアント・プロバイダ切り替え・リトライ（client.js）
- [x] GMエージェント + システムプロンプト（gm.js）
- [x] 基本UI（feed / sidebar / opPanel）
- [x] difficulty.json ロード・即詰みポリシー

### Phase 2 — ワールドDB・イベント
- [ ] worldDB.js（worldEvents / intelPool / npcStates）
- [ ] actionRules.js（ルールベース行動テーブル）
- [ ] worldSim.js（毎ターンシミュレーション・LLMなし版）
- [ ] eventDB.js（EventDef・抽選パイプライン）
- [ ] intelPanel.js（入手情報表示UI）

### Phase 3 — 情報スコープ・NPCエージェント
- [ ] infoScope.js（buildInfoScope / formatScopeAsNarrative）
- [ ] NPCレジストリ（registry.js）
- [ ] 協力者・敵エージェント（informant.js / enemy.js）
- [ ] 接触方式選択UI（contactModal.js）
- [ ] 記憶管理（memory.js）

### Phase 4 — 縦の力学・法令
- [ ] 捜査員エージェント（investigator.js）
- [ ] 上司・上位組織（superior.js）
- [ ] 報告義務・承認フロー
- [ ] 法令・証拠保全（legal.js + legalPanel.js）

### Phase 5 — インフラ・派閥・シナリオ
- [ ] インフラ管理（infraDB.js + infraPanel.js）
- [ ] 派閥モデル（factionDB.js + factionPanel.js）
- [ ] AIディレクター（aiDirector.js）
- [ ] 全5シナリオJSON・シナリオ固有判定
- [ ] セーブ・ロード（persistence.js）
- [ ] カスタム難易度UI（difficultyUI.js）

---

## 開発上の注意

**アーキテクチャ原則**
- **LLMに判定ロジックを任せない** — ダイス・予算・昇進・行動確率・メーター計算はすべてJS側
- **infoScopeは必ずLLM呼び出し前に構築** — プロンプト注入で情報漏洩を防ぐ
- **worldEventsはプレイヤーに直接見せない** — intelPoolを経由して断片のみ渡す
- **NPCは「自分が知らないこと」を絶対に語らない** — buildNpcSystemPromptの制約で強制する
- **GS.scenarioVarsはアクティブシナリオのみ** — 全シナリオの変数を同居させない

**データ整合性**
- **STATEタグのパースは防御的に** — JSONパース失敗時は前の状態を維持
- **スキル・Loyalty・EnemyAlertは全て0〜100スケール**（旧0〜5は使わない）
- **メーター類（exposureRate, M_legal等）は0.0〜1.0**（%表記は使わない）
- **recentHistoryは上限10件** — 超えた分はsummarizeContactでmemoriesに移動

**実装上の制約**
- **position: fixed禁止** — モーダルはフィード内インラインパネルで実装
- **外部CDN禁止** — vanilla JSのみ
- **429対策** — 指数バックオフリトライ（3回・最大30秒待機）
- **Ollama CORS** — `OLLAMA_ORIGINS=* ollama serve`（Windows: 環境変数で設定）をREADMEに必ず記載

---

## モデル選択・パフォーマンス設定（src/llm/client.js）

GMとNPCで異なるモデルを使える2トラック構成。
プリセットはハードウェアティアで選択し、個別上書きも可能。

### 設計方針

- **GM（場面進行・ワールドシム）**: 長いsystem promptへの追従と複雑なSTATEタグ生成が重要 → 大きいモデル優先
- **NPC（協力者・敵・上司）**: 接触ごとに個別呼び出し。レスポンス速度が体感に直結 → 軽いモデルで十分
- **thinking modeは全モデルで必ずオフ** — Gemma 4のreasoning有効時はSTATEタグのJSON構造が破壊される
- **自動VRAM検出は不可** — WebGPUで概算は取れるが不確実。手動プリセット選択を採用

### ハードウェアティア × プリセット表

#### Ollama（ローカル）

| ティア | 目安VRAM | GMモデル | NPCモデル | GM品質 | 速度 |
|---|---|---|---|---|---|
| **Ultra** | 24GB〜 | `gemma4:26b` | `gemma4:12b` | ◎ | ○ |
| **High** | 16GB〜 | `gemma4:12b` | `gemma4:e4b` | ○ | ◎ |
| **Mid** | 8GB〜 | `gemma4:e4b` | `gemma4:e4b` | △ | ◎ |
| **Custom** | — | 手動入力 | 手動入力 | — | — |

> **gemma4:26b（MoE）について**: 26B総パラメータだが推論時は実効4Bのみ動作するため、VRAM消費は`gemma4:12b`と同程度（約10GB）。ただし品質は31B Dense相当。**VRAM 10GB以上あれば最優先で選ぶべき選択肢。**

> **gemma4:27b（31B Dense）について**: 20GB〜必要。品質はMoEより安定しているケースもあるが、VRAM要件の高さに見合う差は小さい。24GB以上のGPUがある場合の選択肢。

#### OpenRouter（API）

| ティア | 用途 | GMモデル | NPCモデル | 費用感 |
|---|---|---|---|---|
| **Free** | 試用・開発 | `google/gemma-3-27b-it:free` | `google/gemma-3-12b-it:free` | 無料（レート制限あり） |
| **Paid-Light** | 軽課金 | `google/gemma-4-26b-a4b-it` | `google/gemma-3-12b-it:free` | GM分のみ課金 |
| **Paid-Full** | 本番品質 | `google/gemma-4-26b-a4b-it` | `google/gemma-4-26b-a4b-it` | 両方課金 |
| **Custom** | — | 手動入力 | 手動入力 | — |

> **Gemma 4（OpenRouter）の注意**: `google/gemma-4-31b-it`はDense 31Bで最高品質だが$0.40/Mトークンと高め。MoEの`google/gemma-4-26b-a4b-it`が$0.13/$0.40と安く、品質差も小さいため**Paid運用なら26B MoEを推奨**。

### client.js 実装

```javascript
// config/modelPresets.js

const MODEL_PRESETS = {
  ollama: {
    ultra: {
      label: "Ultra（VRAM 24GB〜）",
      gm:  { model: "gemma4:26b",  thinking: false },
      npc: { model: "gemma4:12b",  thinking: false },
    },
    high: {
      label: "High（VRAM 16GB〜）",
      gm:  { model: "gemma4:12b",  thinking: false },
      npc: { model: "gemma4:e4b",  thinking: false },
    },
    mid: {
      label: "Mid（VRAM 8GB〜）",
      gm:  { model: "gemma4:e4b",  thinking: false },
      npc: { model: "gemma4:e4b",  thinking: false },
    },
    custom: {
      label: "カスタム",
      gm:  { model: "", thinking: false },
      npc: { model: "", thinking: false },
    },
  },
  openrouter: {
    free: {
      label: "Free（無料枠）",
      gm:  { model: "google/gemma-3-27b-it:free", thinking: false },
      npc: { model: "google/gemma-3-12b-it:free", thinking: false },
    },
    paid_light: {
      label: "Paid-Light（GM分のみ課金）",
      gm:  { model: "google/gemma-4-26b-a4b-it",  thinking: false },
      npc: { model: "google/gemma-3-12b-it:free",  thinking: false },
    },
    paid_full: {
      label: "Paid-Full（本番品質）",
      gm:  { model: "google/gemma-4-26b-a4b-it",  thinking: false },
      npc: { model: "google/gemma-4-26b-a4b-it",  thinking: false },
    },
    custom: {
      label: "カスタム",
      gm:  { model: "", thinking: false },
      npc: { model: "", thinking: false },
    },
  },
};

// 現在の設定（localStorage に永続化）
const CFG = {
  provider:  "ollama",          // "ollama" | "openrouter" | "anthropic"
  ollamaUrl: "http://localhost:11434",
  apiKey:    "",
  preset:    "high",            // プリセットキー
  gm:  { model: "gemma4:12b",  thinking: false },
  npc: { model: "gemma4:e4b",  thinking: false },
};
```

```javascript
// client.js — 2トラック呼び出し

// GMエージェント用
export async function callGM(systemPrompt, messages, retries = 3) {
  return _call(CFG.gm, systemPrompt, messages, retries);
}

// NPCエージェント用
export async function callNPC(systemPrompt, messages, retries = 3) {
  return _call(CFG.npc, systemPrompt, messages, retries);
}

async function _call(modelCfg, systemPrompt, messages, retries) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const body = buildBody(modelCfg, systemPrompt, messages);
      const res = await fetch(getEndpoint(), {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        if (res.status === 429 && attempt < retries - 1) {
          await sleep((attempt + 1) * 4000); // 指数バックオフ
          continue;
        }
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }

      const data = await res.json();
      return extractText(data);

    } catch (e) {
      if (attempt === retries - 1) throw e;
    }
  }
}

function buildBody(modelCfg, sys, msgs) {
  const base = {
    model:    modelCfg.model,
    messages: [{ role: "system", content: sys }, ...msgs],
    stream:   false,
  };

  if (CFG.provider === "ollama") {
    // Gemma 4: thinking無効 + 推奨サンプリング設定
    return {
      ...base,
      options: {
        temperature:    0.7,
        top_p:          0.95,
        top_k:          64,
        repeat_penalty: 1.0,
        // num_ctx はモデルとVRAMに応じてプリセットで上書き可能
      },
    };
  }

  if (CFG.provider === "openrouter") {
    return {
      ...base,
      // Gemma 4はreasoningをオフにしないとSTATEタグが壊れる
      ...(modelCfg.thinking === false ? { reasoning: { enabled: false } } : {}),
    };
  }

  // anthropic（フォールバック）
  return { model: modelCfg.model, max_tokens: 1500, system: sys, messages: msgs };
}

function getEndpoint() {
  if (CFG.provider === "ollama")     return `${CFG.ollamaUrl}/v1/chat/completions`;
  if (CFG.provider === "openrouter") return "https://openrouter.ai/api/v1/chat/completions";
  return "https://api.anthropic.com/v1/messages";
}

function buildHeaders() {
  const h = { "Content-Type": "application/json" };
  if (CFG.provider === "openrouter" && CFG.apiKey) h["Authorization"] = `Bearer ${CFG.apiKey}`;
  return h;
}

function extractText(data) {
  // Anthropic形式
  if (data.content?.[0]?.text) return data.content[0].text;
  // OpenAI互換形式（OllamaとOpenRouter共通）
  return data.choices?.[0]?.message?.content ?? "";
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
```

### 設定UIの構成（difficultyUI.js 内に統合）

```
┌─ モデル設定 ──────────────────────────────────────────┐
│                                                       │
│  プロバイダ  [Ollama ▼]                               │
│  Ollama URL  [http://localhost:11434      ]            │
│                                                       │
│  ハードウェアティア                                   │
│  ○ Ultra  VRAM 24GB〜  GM: gemma4:26b / NPC: 12b     │
│  ● High   VRAM 16GB〜  GM: gemma4:12b / NPC: e4b     │
│  ○ Mid    VRAM 8GB〜   GM: gemma4:e4b  / NPC: e4b    │
│  ○ カスタム                                           │
│                                                       │
│  ── カスタム設定（上でカスタム選択時のみ表示）──────  │
│  GMモデル   [gemma4:26b              ]                │
│  NPCモデル  [gemma4:e4b              ]                │
│                                                       │
│  ■ thinking モード   [オフ ▼]  ← 必ずオフ推奨        │
│                                                       │
│  [保存] [接続テスト]                                  │
└───────────────────────────────────────────────────────┘
```

「接続テスト」ボタンは「こんにちは」を送信してレスポンスタイムを計測し、
`GM: 1.2s / NPC: 0.8s` のように表示する。

### 運用上の注意

- **gemma4:26b と gemma4:27b の使い分け**: VRAMに余裕があれば26b（MoE）を優先。27b（31B Dense）は品質差が小さいわりにVRAM要件が高く、NOCTIVIGILの用途では過剰になりやすい
- **thinking mode**: Gemma 4系は全て `reasoning: { enabled: false }` または Ollama の `options` でデフォルトオフ。有効にするとSTATEタグ内のJSONにCoTテキストが混入してパースに失敗する
- **NPCに重いモデルを使う必要はない**: NPC会話は情報スコープで情報量が制限されているため、e4bでも十分な応答品質が出る。GMに計算資源を集中させる方が体感が良い
- **context_length**: gemma4系は最大256Kトークンだが、Ollamaのデフォルトは2048。長いゲームセッションでは `num_ctx: 8192` 以上を明示的に設定することを推奨
