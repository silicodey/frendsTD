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
