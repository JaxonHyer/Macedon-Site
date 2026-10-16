import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseHTML } from 'linkedom';
import { build, projectRoot } from '../scripts/build.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'research-site-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(path.join(projectRoot, 'src'), path.join(root, 'src'), { recursive: true });
  await mkdir(path.join(root, 'content'));
  const config = {
    title: 'Test notebook', subtitle: 'Test notes', language: 'en',
    sections: [{ id: 'batch', title: 'Batch', nav: false, children: [
      { id: 'notes', title: 'Notes', file: 'content/notes.md' }
    ] }]
  };
  const saveConfig = () => writeFile(path.join(root, 'site.config.json'), JSON.stringify(config));
  await saveConfig();
  await writeFile(path.join(root, 'content/notes.md'), '');
  return { root, config, saveConfig };
}

test('builds nested sections, empty states, navigation and static assets', async (t) => {
  const { root } = await fixture(t);
  const { html, output } = await build({ root });
  const { document } = parseHTML(html);
  assert.equal(document.title, 'Test notebook');
  assert.equal(document.querySelector('#batch > h2').textContent, 'Batch');
  assert.equal(document.querySelector('#batch #notes > h3').textContent, 'Notes');
  assert.equal(document.querySelector('.empty-state').textContent, 'No content added yet.');
  assert.deepEqual([...document.querySelectorAll('nav a')].map((a) => a.getAttribute('href')), ['#notes']);
  assert.equal(document.querySelectorAll('script').length, 0);
  assert.equal(document.querySelector('link').getAttribute('href'), './assets/styles.css');
  assert.ok((await readFile(path.join(output, 'assets/styles.css'), 'utf8')).length > 0);
  assert.equal(await readFile(path.join(output, '.nojekyll'), 'utf8'), '');
});

test('compiles Markdown ahead of time, shifts headings and handles duplicate anchors', async (t) => {
  const { root } = await fixture(t);
  await writeFile(path.join(root, 'content/notes.md'), '# Detail heading\n\nA **bold** sentence.\n\n# Detail heading\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n![Example](./images/example.png)');
  const { html } = await build({ root });
  const { document } = parseHTML(html);
  assert.equal(document.querySelector('h4').id, 'notes-detail-heading');
  assert.ok(document.getElementById('notes-detail-heading-2'));
  assert.equal(document.querySelector('strong').textContent, 'bold');
  assert.ok(document.querySelector('table'));
  assert.equal(document.querySelector('img').getAttribute('loading'), 'lazy');
});

test('sanitizes Markdown HTML and escapes config text', async (t) => {
  const { root, config, saveConfig } = await fixture(t);
  config.title = '<script>unsafe()</script>';
  config.sections[0].children[0].title = '<img src=x onerror=unsafe()>';
  await saveConfig();
  await writeFile(path.join(root, 'content/notes.md'), '<script>unsafe()</script>\n\n<img src="x" onerror="unsafe()">\n\n[bad](javascript:unsafe)\n\n<iframe src="https://example.com"></iframe>');
  const { html } = await build({ root });
  const { document } = parseHTML(html);
  assert.equal(document.querySelectorAll('script, iframe, [onerror]').length, 0);
  assert.equal(document.querySelectorAll('a[href^="javascript:"]').length, 0);
  assert.equal(document.querySelector('h1').textContent, '<script>unsafe()</script>');
  assert.equal(document.querySelector('#notes h3').textContent, '<img src=x onerror=unsafe()>');
});

test('supports custom template div targets and explicit navigation settings', async (t) => {
  const { root, config, saveConfig } = await fixture(t);
  const templatePath = path.join(root, 'src/template.html');
  const template = await readFile(templatePath, 'utf8');
  await writeFile(templatePath, template.replace('</main>', '<div id="custom-slot"></div></main>'));
  config.sections[0].target = 'custom-slot';
  config.sections[0].nav = true;
  config.sections[0].children[0].nav = false;
  await saveConfig();
  const { html } = await build({ root });
  const { document } = parseHTML(html);
  assert.ok(document.querySelector('#custom-slot > #batch #notes'));
  assert.equal(document.querySelector('#research-content').children.length, 0);
  assert.deepEqual([...document.querySelectorAll('nav a')].map((a) => a.getAttribute('href')), ['#batch']);
});

test('copies provided media without changing it', async (t) => {
  const { root } = await fixture(t);
  await mkdir(path.join(root, 'public/images'), { recursive: true });
  await writeFile(path.join(root, 'public/images/user-file.txt'), 'User supplied');
  const { output } = await build({ root });
  assert.equal(await readFile(path.join(output, 'images/user-file.txt'), 'utf8'), 'User supplied');
});

for (const [name, mutate, expected] of [
  ['duplicate IDs', (c) => c.sections[0].children.push({ id: 'notes', title: 'Again' }), /Duplicate or reserved ID/],
  ['reserved IDs', (c) => { c.sections[0].id = 'page-title'; }, /Duplicate or reserved ID/],
  ['missing files', (c) => { c.sections[0].children[0].file = 'content/missing.md'; }, /Cannot read/],
  ['unknown targets', (c) => { c.sections[0].target = 'unknown'; }, /Unknown custom div target/],
  ['invalid children', (c) => { c.sections[0].children = {}; }, /children must be an array/],
  ['path traversal', (c) => { c.sections[0].children[0].file = '../outside.md'; }, /Path must be inside/],
  ['excessive depth', (c) => { let s = c.sections[0]; for (let i = 0; i < 5; i++) { s.children = [{ id: `nested-${i}`, title: 'Nested' }]; s = s.children[0]; } }, /nested too deeply/]
]) {
  test(`rejects ${name} with a useful error`, async (t) => {
    const { root, config, saveConfig } = await fixture(t);
    mutate(config);
    await saveConfig();
    await assert.rejects(build({ root }), expected);
  });
}

test('build output is deterministic and safe for a project Pages subpath', async (t) => {
  const { root } = await fixture(t);
  const first = await build({ root });
  const second = await build({ root });
  assert.equal(first.html, second.html);
  const { document } = parseHTML(first.html);
  for (const element of document.querySelectorAll('[href], [src]')) {
    const url = element.getAttribute('href') ?? element.getAttribute('src');
    assert.ok(!url.startsWith('/'), `Unexpected domain-root URL: ${url}`);
  }
});

test('does not allow output to replace source directories', async (t) => {
  const { root } = await fixture(t);
  await assert.rejects(build({ root, outDir: 'src' }), /Unsafe output directory/);
});
