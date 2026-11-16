import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOWERS } from '../src/data/towers';
import { FAMILY_INFO } from '../src/data/types';
import { ENEMIES } from '../src/data/enemies';
import { LEVELS, THEMES } from '../src/data/levels';
import { SIGNATURES } from '../src/pvp/signatures';
import { ARENAS, usageTier } from '../src/pvp/economy';
import { SOUNDTRACKS } from '../src/audio/score';

/** Names a store listing must not show: other companies' products and trademarks. */
const BANNED = /\b(gemini|claude|codex|grok|sonnet|opus|haiku|openai|anthropic|google|deepmind|xai|tesla|spacex|raptor|colossus|unhinged|veo|nano banana|deep think|computer use|claude code|mcp|chatgpt|gpt|copilot|cursor|llama|mistral)\b/i;

test('no player-visible text names a real company or product', () => {
  const texts: string[] = [];
  for (const t of TOWERS) texts.push(t.name, t.role, t.desc);
  for (const f of Object.values(FAMILY_INFO)) texts.push(f.name, f.tagline);
  for (const e of ENEMIES) texts.push(e.name, e.desc);
  for (const l of LEVELS) texts.push(l.name, l.blurb);
  for (const th of THEMES) texts.push(th.name);
  for (const s of SIGNATURES) {
    texts.push(s.ability.name, s.ability.text(1));
    for (const pair of s.talents) for (const t of pair) texts.push(t.name, t.desc);
  }
  for (const a of ARENAS) texts.push(a.name, a.blurb);
  for (let lv = 1; lv < 30; lv++) texts.push(usageTier(lv));
  for (const s of SOUNDTRACKS) texts.push(s.name, s.mood);
  const bad = texts.filter((x) => BANNED.test(x));
  assert.deepEqual(bad, []);
});

test('classes are London, California, Prishtina and Tokyo', () => {
  assert.deepEqual(Object.values(FAMILY_INFO).map((f) => f.name), ['London', 'California', 'Prishtina', 'Tokyo']);
});

test('every class fields Damage and Support units in duels, and signatures are Damage or Support by design', async () => {
  const { PVP_UNITS } = await import('../src/pvp/roster');
  const { dutyOf, subroleOf } = await import('../src/data/towers');
  for (const f of Object.keys(FAMILY_INFO)) {
    const units = PVP_UNITS.filter((t) => t.family === f);
    assert.equal(units.length, 6, f);
    assert.ok(units.some((t) => dutyOf(t) === 'support'), `${f} has a support`);
    assert.ok(units.filter((t) => dutyOf(t) === 'damage').length >= 4, `${f} is mostly damage`);
  }
  for (const t of TOWERS) assert.ok(subroleOf(t).length > 0);
});

test('every Damage unit can crit at the account crit damage; Support units never crit', async () => {
  const { PVP_UNITS } = await import('../src/pvp/roster');
  const { dutyOf } = await import('../src/data/towers');
  const { buildSpec, CRIT_DMG_START } = await import('../src/pvp/match');
  const { startLevel } = await import('../src/pvp/economy');
  for (const t of PVP_UNITS) {
    const s = buildSpec({ id: t.id, level: startLevel(t.id), talents: [-1, -1, -1, -1] }, { critDmg: 1.8 });
    if (dutyOf(t) === 'damage') {
      assert.ok(s.def.crit && s.def.crit[0] >= 0.08, `${t.id} crits`);
      assert.ok(s.def.crit![1] >= 1.8, `${t.id} uses the account crit damage`);
    } else assert.equal(s.def.crit, undefined, `${t.id} is support`);
  }
  const d = buildSpec({ id: 'cl_sonnet', level: 1, talents: [] });
  assert.equal(d.def.crit![1], CRIT_DMG_START);
});

test('account crit damage grows with card level-ups', async () => {
  const { newProfile, critDamageOf } = await import('../src/pvp/profile');
  const p = newProfile(0);
  const base = critDamageOf(p);
  p.cards.gem_flash.level += 3;
  assert.ok(Math.abs(critDamageOf(p) - base - 0.06) < 1e-9);
});
