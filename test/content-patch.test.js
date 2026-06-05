const assert = require('node:assert/strict');
const test = require('node:test');
const { applyContentPatch } = require('../src/merge/content-patch');

const DOC = [
  '---',
  'name: swift-reviewer',
  'model: sonnet',
  '---',
  '',
  'Review Swift. MUST BE USED for Swift projects.',
  '',
].join('\n');

test('frontmatter override replaces an existing scalar key', () => {
  const { content } = applyContentPatch(DOC, { frontmatter: { model: 'opus' } });
  assert.match(content, /^model: opus$/m);
  assert.doesNotMatch(content, /model: sonnet/);
  assert.match(content, /^name: swift-reviewer$/m); // untouched
});

test('frontmatter override appends a new key', () => {
  const { content } = applyContentPatch(DOC, { frontmatter: { priority: 5 } });
  assert.match(content, /^priority: 5$/m);
});

test('frontmatter values with YAML-significant chars are quoted', () => {
  const { content } = applyContentPatch(DOC, { frontmatter: { description: 'Use: when reviewing' } });
  assert.match(content, /^description: "Use: when reviewing"$/m);
});

test('replace rewrites body text and leaves frontmatter alone', () => {
  const { content } = applyContentPatch(DOC, {
    replace: [{ find: 'MUST BE USED for Swift projects', with: 'Use for Swift projects' }],
  });
  assert.match(content, /Use for Swift projects/);
  assert.doesNotMatch(content, /MUST BE USED/);
});

test('replace with a missing target warns and leaves content unchanged', () => {
  const { content, warnings } = applyContentPatch(DOC, { replace: [{ find: 'nonexistent', with: 'x' }] });
  assert.equal(content, DOC);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /not found/);
});

test('append and prepend wrap the body', () => {
  const { content } = applyContentPatch(DOC, { prepend: 'TOP\n', append: '\nBOTTOM' });
  const body = content.split('---\n')[2];
  assert.ok(body.startsWith('TOP\n'));
  assert.ok(content.endsWith('\nBOTTOM'));
});

test('frontmatter patch on a doc without frontmatter creates one', () => {
  const { content } = applyContentPatch('# Just a body\n', { frontmatter: { model: 'opus' } });
  assert.match(content, /^---\nmodel: opus\n---\n# Just a body/);
});

test('CRLF frontmatter is parsed, not duplicated, by a frontmatter patch', () => {
  const crlf = '---\r\nname: x\r\nmodel: sonnet\r\n---\r\nBody line\r\n';
  const { content } = applyContentPatch(crlf, { frontmatter: { model: 'opus' } });
  // Exactly one frontmatter block, and the model was overridden in place.
  assert.equal((content.match(/^---$/gm) || []).length, 2, 'should have a single --- ... --- block');
  assert.match(content, /^model: opus$/m);
  assert.doesNotMatch(content, /model: sonnet/);
});

test('empty or absent patch returns content unchanged', () => {
  assert.equal(applyContentPatch(DOC, {}).content, DOC);
  assert.equal(applyContentPatch(DOC, null).content, DOC);
});

test('ops compose in order: frontmatter, replace, append', () => {
  const { content } = applyContentPatch(DOC, {
    frontmatter: { model: 'opus' },
    replace: [{ find: 'MUST BE USED for Swift projects', with: 'Use for Swift' }],
    append: '\n## Note\nx',
  });
  assert.match(content, /^model: opus$/m);
  assert.match(content, /Use for Swift/);
  assert.match(content, /## Note\nx$/);
});
