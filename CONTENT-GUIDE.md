# Content Guide — Building a Neon Relic Case File

This guide documents how to author mission content for the Neon Relic system: every document type,
the fields that matter, and the **content policy** that separates player-facing material from
Director Agent (DA) material. Every example referenced here lives in `src/packs/` of this template;
real-world-scale examples live in
[Mission: Sangreal](https://github.com/bruceamoser/neon-relic-mission-sangreal-foundry).

Field names and types mirror the system's data models. The authoritative source is
[`src/data/item-models.mjs`](https://github.com/bruceamoser/foundry-neon-relic-system/blob/main/src/data/item-models.mjs)
and [`src/data/actor-models.mjs`](https://github.com/bruceamoser/foundry-neon-relic-system/blob/main/src/data/actor-models.mjs)
in the system repo — check them when you need a field this guide doesn't cover.

---

## 1. Anatomy of a case file

A Neon Relic mission is a **case file**: a mystery with a clock, people, places, and evidence. The
document types map onto that structure:

| Document | Type | Pack | Audience | Purpose |
| --- | --- | --- | --- | --- |
| Player dossier | `playerCaseBrief` | briefs | **Players** | The handout that opens the case: situation, objectives, contacts, constraints |
| DA case brief | `daCaseBrief` | briefs | DA only | The truth: what's really happening, containment truths, milestone schedule |
| Case board | `caseBoard` | briefs | DA runs, players see | The 14-day clock plus faction and person tracks that move off-camera |
| Information web | `informationWeb` | briefs | DA visual aid | The graph of which cards exist and how they link |
| Information cards | `informationCard` | clues | **Players** (when revealed) | Evidence, documents, and cast dossiers — the case's clue economy |
| Locations | `location` | sites | DA only | Scene kits: read-aloud facts, outcomes, what escalates here |
| Factions | `organization` | sites | DA only | Who the players are up against and what advances their agenda |
| NPCs / mobs | `npc`, `mob` | npcs | DA only | Stat blocks, secrets, social mechanics, goals |
| Relics & kit | `artifact`, `weapon`, `gear`, … | items | **Players** (item descriptions) / DA | The relic at the heart of the case and the equipment around it |
| Journals | `journalEntry` | journals | Either | Handouts (player) and run sheets / walkthroughs (DA) |
| Tables | `rollTable` | tables | DA | Complications, fractures, random flavour |
| Landing scene | `scene` | scenes | Both | The module's splash page / title card |

Scale reference (Mission: Sangreal): 61 information cards (45 evidence + 16 cast), 16 NPCs,
7 locations, 2 factions, 10 relic/equipment items, 4 journals including a day-by-day DA walkthrough,
1 landing scene.

---

## 2. Authoring mechanics

### 2.1 One pack = one YAML file

`src/packs/<pack-name>.yaml` holds an array of documents. The file name must match a pack `name` in
`static/module.json`. Adding a new pack means: new YAML file + new manifest entry (+ optionally list
it in `packFolders`).

### 2.2 Slugs become deterministic ids

Every document's `_id` is a human-readable slug (e.g. `my-ic03`, `my-npc-villain`). The build hashes
it into a stable 16-character Foundry id — **ids never change between builds**, so world content
imported once survives re-imports and updates in place.

### 2.3 Cross-references use slugs

Authoring fields ending in `Slugs` accept arrays of slugs; the build compiles them into `*Uuids`
arrays and **fails on any unknown slug** (typo protection):

| Authoring field | Compiles to | Used by |
| --- | --- | --- |
| `foundAtSlugs` | `foundAtUuids` | informationCard |
| `knownBySlugs` | `knownByUuids` | informationCard |
| `npcSlugs` | `npcUuids` | informationCard, location, organization |
| `locationSlugs` | `locationUuids` | location, others |
| `organizationSlugs` | `organizationUuids` | location, others |
| `informationCardSlugs` | `informationCardUuids` | location, caseBoard, informationWeb |
| `startingKnowledgeSlugs` / `gainedKnowledgeSlugs` | `…Uuids` | npc (Operations Board) |

On the case board, each track uses `orgSlug:` (singular) → resolved to `orgUuid`.

### 2.4 Images

Put artwork under `src/assets/` and reference it as `modules/<your-module-id>/assets/...`. The
validator checks that referenced images exist. Any directory named `references/` under
`src/assets/` is excluded from the build — keep mood boards, sources, and internal docs there.

### 2.5 What the build does with journals and tables

Journal pages and roll-table results are stored as **separate Foundry v14 entries** automatically —
you author them nested (see examples) and the compiler expands them.

---

## 3. Document recipes

### 3.1 `playerCaseBrief` — the players' opening dossier

Issue to players at the start; **everything here is player-visible and must be spoiler-free**.

| Field | Notes |
| --- | --- |
| `caseId`, `caseName`, `region`, `classification` | Header block (e.g. `EXAMPLE-65-001`, `RESTRICTED`) |
| `situationSummary` | The official version of events — what the Covenant believes, announces, or chooses to tell |
| `primaryObjective` / `secondaryObjective` | Restated from the DA brief in spoiler-free terms |
| `knownOrganizations` | Only what the players could know about the parties involved |
| `initialContacts` | Array of `{name, role, knownInfo}` — the system pads to six rows |
| `startingLeads` | Where the cell should begin |
| `timelinePressure` | The visible clock |
| `constraints` | Rules of engagement — treaty obligations, discretion requirements |

Example: `example-briefs.yaml → example-brief-player`.

### 3.2 `daCaseBrief` — the DA's master reference (VC-17)

**DA-only.** Structurally the eight sections of the VC-17 form:

| Section | Field(s) | Notes |
| --- | --- | --- |
| I — Mystery | `mysteryStatement` | The puzzle as the players will first perceive it |
| II — Truth | `realSituation` | What is actually going on |
| III — Objectives | `primaryObjective`, `secondaryObjective` | Include the hidden half |
| IV — Containment truths | `containmentTrigger`, `containmentAppetite`, `containmentQuiescence` | **Required for a relic case** — must agree with the artifact item |
| V — Actors | `keyActors` | The cast and what each one wants |
| VI — Endgame | `bestCaseResolution`, `worstCaseResolution` | The two poles |
| VII — Milestones | `relicMilestones[]` `{day, description}` | What the relic does day-by-day if uncontained |
| VIII — Notes | `daNotes` | Pacing, fail-forwards, table craft |

Plus `relicTier` (1–4) and header fields.

Example: `example-briefs.yaml → example-brief-da`.

### 3.3 `caseBoard` — the 14-day operations clock

The board is what makes a case file feel alive: factions and off-camera people act on their own
schedule, whether or not the players engage.

| Field | Notes |
| --- | --- |
| `currentDay` / `shiftsFilled` | Playtest state — the system sheet manages these |
| `relicMilestones[]` | `{day, description}` — what the relic does as the clock advances (2–6 per case) |
| `organizations[]` | Tracks. Each has `id`, `name`, `orgSlug`, `value`, `active`, `dormant`, `milestones[]` `{day, label, description}` |

Two track flavours, same structure:

- **Faction track** — `orgSlug` points at an `organization` document.
- **Person track** — `orgSlug` points at an `npc`; the person acts as a self-organization
  (movements, hand-offs, betrayals). Players learn these moves as second-hand news.

Example: `example-briefs.yaml → example-case-board`.

### 3.4 `informationWeb` — the clue graph

Lists every card slug in the case; the web view draws the links compiled into each card. One per
mission.

Example: `example-briefs.yaml → example-information-web`.

### 3.5 `informationCard` — evidence and cast dossiers

The clue economy. Fields: `cardId` (`I-1`, `CT-1`, `N-1` …), `cardType`
(`supportingIntel` | `containmentTruth`), `content` (player-facing), `foundAtSlugs`,
`knownBySlugs`, `npcSlugs`, `hqFallback` (day number for HQ fallback delivery, 0 = none),
`daNotes`.

**`content` rules depend on what the card shows:**

- **Evidence/document cards** — describe the item at a glance, or quote the document's own text
  verbatim (telex, memo, ledger page). Example: `example-clues.yaml → example-ic01`.
- **Cast cards** (a card about a person) — the card is the Covenant's **file folder** on that
  person. Write what a player would find if they opened it:

  > **Dossier — Name.** Identity, role, posting. **Description:** the person as records describe
  > them (build, dress, manner). Record and patterns: service history, habits stated as
  > intelligence, honest gaps in Covenant knowledge. **Assessment:** the file's one-line read.

  Never describe the artwork or its staging — the image is the image, and players open it with the
  Examine Photo viewer. Photo-reading belongs in `daNotes`.

**`daNotes` — house format (four parts, every card):**

```html
<p><strong>Retrieval.</strong> When and how this card enters play.</p>
<p><strong>Reading the image.</strong> What the artwork shows — DA context only.</p>
<p><strong>Clues &amp; easter eggs.</strong> Hidden details and what they mean.</p>
<p><strong>DA truth.</strong> The spoiler: what this really proves or foreshadows.</p>
```

Examples: `example-clues.yaml` (intel cards I1–I2, cast card N1).

### 3.6 `location` — scene kits (DA-only)

`locationId` (`L1`…), `caseId`, `availability` (`open` | `clue` | `contact` | `time` | `packet`),
`availabilityCondition` (when availability is conditional), `description` (running notes — access,
  dramatis personae, tone beats), `positiveResult` / `negativeResult` (how the scene ends well or
  badly), `milestoneChanges` (what track milestones change here), plus cross-link slug fields.

Example: `example-sites.yaml → example-l1`.

### 3.7 `organization` — factions (DA-only)

`organizationId` (`O1`…), `caseId`, `isActive`, `isDormant`, `description` (who they are, method,
  what escalates), plus `npcSlugs` / `locationSlugs`. Every faction on the case board should have
  a document here.

Example: `example-sites.yaml → example-org1`.

### 3.8 `npc` / `mob` — the cast (DA-only)

Actor sheets carry stats, secrets, and goals — players never open these. The player-facing version
of a person is their **cast card** plus what the narrative reveals.

**`npc` key fields:** `tier` (1–4), `description` (psychological profile / social mechanics /
  combat profile — free HTML), `attributes` (`str`, `agi`, `wit`, `emp`), `skills` (sparse — only
  skills the NPC has; valid keys: `force`, `endure`, `brawl`, `firearms`, `deftHands`, `sneak`,
  `tech`, `investigate`, `lore`, `psychoanalyze`, `manipulate`, `command`, `healMental`,
  `healPhysical`), `armorRating`, `fearRating`, `disposition` (1–5), `corruptionStage` (0–3),
  `tags`, and Operations Board fields: `secret`, `goal`, `positiveResult`, `negativeResult`,
  `startingKnowledgeSlugs`.

**`mob` key fields:** `memberCount` (1–5 drives the shared pool), `memberHP`, `bestPool`.
  `sharedPool` and `bonusDice` are derived by the system.

Examples: `example-npcs.yaml`.

### 3.9 `artifact` — the case relic

The centrepiece. Key fields: `tier` (1–3; corruption cost and encumbrance derive from it),
  `artifactDie` `{current, starting}` (usage die), `activationCondition`, `effect`,
  `fractureCondition`, `emission` (`{type, radius, trigger, corruptionAmount, isSuppressed}`),
  `containmentProfile` (`{type, isContained, truths: {triggerCondition, appetite,
  quiescenceCondition}}`).

> **Consistency rule:** the containment truths here must match the DA case brief's Section IV.
> The brief is what the DA reads; the item is what the system rolls. If they disagree, the case
> breaks at the table.

Example: `example-items.yaml → example-artifact-lantern`.

### 3.10 `weapon`, `gear`, `consumable` — equipment (and more)

- `weapon`: `damage`, `range` (`short`/`near`/…), `skill`, `targetAttribute`, `gearBonus`
  `{value, max}` (gear dice — degrades on 1s; at 0 the item is broken), `ammoDie`
  `{current, starting}`, `traits` (`reliable`, `highCapacity`, `fullAuto`, `stunned`), `cl`,
  `worn`, `encumbrance`.
- `gear`: `gearBonus`, `skillBonus` (skill key it assists), `cl`, `worn`.
- `consumable`: `consumableType`, `currentDie`/`startingDie` (resource die), `cl`.

The system also provides `armor`, `talent`, `criticalInjury`, `anchor`, `darkSecret`, `upgrade`,
  `subdivision`, and `relicSheet` (VC-16 containment sheets for catalogued relics — see Sangreal
  for full examples). Item `description` is usually player-visible when the item is handed over —
  keep it in-world.

Examples: `example-items.yaml`.

### 3.11 `journalEntry` — handouts and run sheets

Either nested `pages: [{name, type: text, text: {content}}]` or a single `system.summary` page.
Pages compile into separate entries automatically.

- **Handout journals** are player-facing; keep every page spoiler-free.
- **DA journals** (run sheets, walkthroughs) — title them obviously and never share the link.

Example: `example-journals.yaml` (both patterns).

### 3.12 `rollTable` — drama engines

`formula` (`1d6`…) and `entries: [{range: [low, high], result: '...'}]`. Ranges must tile the die
  without gaps — the validator checks ordering, not completeness, so read your table once before
  releasing.

Example: `example-tables.yaml`.

### 3.13 `scene` — the landing page

A module splash scene. Flag it so the Content Installer activates it when the world has no active
  scene:

```yaml
flags:
  <your-module-id>:
    landingPage: true
```

Example: `example-scenes.yaml`.

---

## 4. Content policy — player-facing vs DA-only

This is the part that separates a polished mission from one that spoils itself. The rules below are
distilled from building Mission: Sangreal; the template's scripts assume them.

### 4.1 Which surfaces are player-visible

**Player-visible (audit every one of these before release):**

- `informationCard` → `content`
- `playerCaseBrief` → every field
- Handout journal pages
- Item `description` on artifacts/gear/weapons that players receive
- The case board **as a physical prop** (faction names and track framing may be shown; milestone
  texts are DA material)

**DA-only (spoilers allowed):**

- `daCaseBrief` (all fields), `daNotes` on cards
- Actor sheets (`npc`, `mob`) including `description`, `secret`, `goal`
- `location` and `organization` descriptions
- DA journals / run sheets / walkthroughs
- Case-board milestone descriptions and track internals

### 4.2 The cast card rule (repeated because it is the most common mistake)

A cast card is **the Covenant's file folder on the person** — not a description of the artwork.
Players can (and should) open the image themselves with Examine Photo; describing the photograph
in prose wastes the card and spoils the hunt for details.

| ❌ Photograph description | ✅ File folder content |
| --- | --- |
| "Photographed at the teleprinter: headset around her neck, plots pinned behind her, the page already circled." | "Reads instrument traces the way other people read handwriting; has a habit of having already circled the anomaly before anyone asks her to look." |

The anti-pattern shows composition and props. The good version states the same character as
**intelligence** — something a player can act on.

### 4.3 Player content rules (all player-visible surfaces)

1. **Describe, don't hint.** No "this will matter later", no enumerated hidden details, no
   "notice the…" — discovery is the game.
2. **No cross-card references.** Never write "(see card I18)" — links exist in the data, not the
   prose.
3. **No provenance or location leaks** beyond what the players could legitimately know: no "found
   at…", no "known by…" lines on the card face.
4. **No stage directions.** Nothing addressed to the DA ("hand this to the players", "if they
   ask…"). Those belong in `daNotes`.
5. **No dev-meta.** No stat references, sheet jargon, or designer commentary in player text.
6. **Documents quote themselves.** For memos, ledgers, letters: quote the text verbatim — that IS
   the artefact. For visual evidence: describe at a glance.

### 4.4 DA notes: keep everything the players must not see

The four-part format (§3.5) exists so the DA never has to reconstruct intent: what the card
proves, what the image hides, and how to deploy it. When in doubt on a player-facing choice, move
the detail to the DA side — nothing is lost, it just moves.

---

## 5. Pre-release QA checklist

Run the automated gates, then walk the human checklist:

- [ ] `npm run build` — compiles cleanly
- [ ] `npm run validate` — schema + cross-reference checks pass
- [ ] `npm run audit` — manifest ↔ build parity, links intact
- [ ] Every player-visible surface read once **as a player**: can anything be spoiled by it?
- [ ] Cast cards checked against §4.2 (no photograph descriptions)
- [ ] DA brief Section IV containment truths match the artifact item's containment profile
- [ ] Case board: every faction has an `organization` document; every milestone day is within 1–14
- [ ] DA notes present on every card, in the house format
- [ ] The landing scene activates in a fresh world (test with the Content Installer)
- [ ] Version bumped in `package.json` **and** `static/module.json`
- [ ] `manifest`/`download` URLs still point at `releases/latest/download/`
