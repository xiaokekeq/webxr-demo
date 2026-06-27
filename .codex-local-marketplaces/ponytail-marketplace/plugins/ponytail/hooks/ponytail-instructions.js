#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
  DEFAULT_MODE,
  normalizeMode,
  normalizePersistedMode
} = require('./ponytail-config');

const INDEPENDENT_MODES = new Set(['review']);
const SKILL_PATH = path.join(__dirname, '..', 'skills', 'ponytail', 'SKILL.md');

function filterSkillBodyForMode(body, mode) {
  const effectiveMode = normalizeMode(mode) || DEFAULT_MODE;
  const withoutFrontmatter = String(body || '').replace(/^---[\s\S]*?---\s*/, '');

  return withoutFrontmatter
    .split(/\r?\n/)
    .filter((line) => {
      const tableLabel = line.match(/^\|\s*\*\*(.+?)\*\*\s*\|/);
      if (tableLabel) {
        const labelMode = normalizeMode(tableLabel[1].trim());
        if (labelMode) return labelMode === effectiveMode;
      }

      const exampleLabel = line.match(/^-\s*([^:]+):\s*/);
      if (exampleLabel) {
        const labelMode = normalizeMode(exampleLabel[1].trim());
        if (labelMode) return labelMode === effectiveMode;
      }

      return true;
    })
    .join('\n');
}

function getFallbackInstructions(mode) {
  return [
    `PONYTAIL MODE ACTIVE - level: ${mode}`,
    '',
    'You are a lazy senior developer. Lazy means efficient, not careless.',
    '',
    'Follow this ladder after you understand the real code path:',
    '1. Do we need to build this at all?',
    '2. Does it already exist in the codebase?',
    '3. Can the standard library solve it?',
    '4. Can the platform solve it natively?',
    '5. Can an installed dependency solve it?',
    '6. Can this be one line?',
    '7. Only then: write the minimum code that works.',
    '',
    'Rules: no unrequested abstractions, no avoidable dependencies, deletion over addition, and leave one runnable check behind for non-trivial logic.'
  ].join('\n');
}

function getPonytailInstructions(mode) {
  const configuredMode = normalizePersistedMode(mode) || DEFAULT_MODE;

  if (INDEPENDENT_MODES.has(configuredMode)) {
    return `PONYTAIL MODE ACTIVE - level: ${configuredMode}.\nBehavior defined by /ponytail-${configuredMode} skill.`;
  }

  const effectiveMode = normalizeMode(configuredMode) || DEFAULT_MODE;
  try {
    return (
      `PONYTAIL MODE ACTIVE - level: ${effectiveMode}\n\n` +
      filterSkillBodyForMode(fs.readFileSync(SKILL_PATH, 'utf8'), effectiveMode)
    );
  } catch {
    return getFallbackInstructions(effectiveMode);
  }
}

module.exports = {
  filterSkillBodyForMode,
  getFallbackInstructions,
  getPonytailInstructions
};
