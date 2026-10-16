import { readFile, writeFile, mkdir, rm, cp, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { Marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const markdown = new Marked({ gfm: true, breaks: false });
const slug = (text) => text.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'heading';
const inside = (root, file) => {
  const resolved = path.resolve(root, file);
  if (!resolved.startsWith(root + path.sep)) throw new Error(`Path must be inside the project: ${file}`);
  return resolved;
};

export async function build({ root = projectRoot, outDir = 'dist' } = {}) {
  root = path.resolve(root);
  const output = inside(root, outDir);
  // Never allow an output folder to overwrite source directories.
  for (const source of ['src', 'content', 'public', 'scripts', 'tests', '.git', '.github', 'node_modules']) {
    const directory = path.join(root, source);
    if (output === directory || output.startsWith(directory + path.sep) || directory.startsWith(output + path.sep)) {
      throw new Error(`Unsafe output directory: ${outDir}`);
    }
  }
  const config = JSON.parse(await readFile(path.join(root, 'site.config.json'), 'utf8'));
  if (typeof config.title !== 'string' || !config.title.trim()) throw new Error('Config needs a nonempty title.');
  if (config.subtitle !== undefined && typeof config.subtitle !== 'string') throw new Error('subtitle must be text.');
  if (config.language !== undefined && (typeof config.language !== 'string' || !/^[a-z]{2,3}(?:-[a-z0-9]+)*$/i.test(config.language))) {
    throw new Error('language must be a language tag such as en or en-US.');
  }
  if (!Array.isArray(config.sections)) throw new Error('Config sections must be an array.');
  const { document } = parseHTML(await readFile(path.join(root, 'src/template.html'), 'utf8'));
  const required = (id) => {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Template is missing required element #${id}.`);
    return element;
  };
  document.documentElement.lang = config.language || 'en';
  document.title = config.title;
  required('page-title').textContent = config.title;
  required('site-subtitle').textContent = config.subtitle || '';
  const main = required('main-content');
  const defaultTarget = required('research-content');
  const navigation = required('section-navigation');
  // Only IDs present in the original template can be custom targets.
  const templateTargets = new Map([...main.querySelectorAll('[id]')].filter((element) => element.tagName === 'DIV').map((element) => [element.id, element]));
  const ids = new Set([...document.querySelectorAll('[id]')].map((element) => element.id));
  const claimId = (id) => {
    if (ids.has(id)) throw new Error(`Duplicate or reserved ID: ${id}`);
    ids.add(id);
    return id;
  };

  async function renderSections(sections, parent, level) {
    for (const section of sections) {
      if (!section || typeof section !== 'object' || Array.isArray(section)) throw new Error('Each section must be an object.');
      if (typeof section.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(section.id)) throw new Error('Section IDs must start with a lowercase letter and contain only lowercase letters, digits, or hyphens.');
      if (typeof section.title !== 'string' || !section.title.trim()) throw new Error(`Section ${section.id} needs a title.`);
      if (level > 6) throw new Error(`Section ${section.id} is nested too deeply (maximum heading level is 6).`);
      if (section.children !== undefined && !Array.isArray(section.children)) throw new Error(`children must be an array in ${section.id}.`);
      if (section.nav !== undefined && typeof section.nav !== 'boolean') throw new Error(`nav must be true or false in ${section.id}.`);
      const container = document.createElement('section');
      container.className = 'research-section';
      container.id = claimId(section.id);
      const heading = document.createElement(`h${level}`);
      heading.id = claimId(`${section.id}-title`);
      heading.textContent = section.title;
      container.setAttribute('aria-labelledby', heading.id);
      container.append(heading);
      let target = parent;
      if (section.target !== undefined) {
        if (typeof section.target !== 'string' || !templateTargets.has(section.target)) {
          throw new Error(`Unknown custom div target "${section.target}" for ${section.id}. Add that div to src/template.html inside main.`);
        }
        target = templateTargets.get(section.target);
      }
      target.append(container);
      if (section.nav ?? Boolean(section.file)) {
        const li = document.createElement('li');
        const link = document.createElement('a');
        link.href = `#${section.id}`;
        link.textContent = section.title;
        li.append(link);
        navigation.append(li);
      }
      if (section.file !== undefined) {
        if (typeof section.file !== 'string' || !section.file.endsWith('.md')) throw new Error(`file must be a .md path in ${section.id}.`);
        const file = inside(root, section.file);
        let source;
        try { source = await readFile(file, 'utf8'); }
        catch (error) { throw new Error(`Cannot read ${section.file} for ${section.id}: ${error.message}`); }
        const content = document.createElement('div');
        content.className = 'markdown';
        if (source.trim()) {
          content.innerHTML = sanitizeHtml(markdown.parse(source), {
            allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'figure', 'figcaption', 'del', 's'],
            allowedAttributes: {
              a: ['href', 'title'], img: ['src', 'alt', 'title', 'width', 'height'],
              th: ['align'], td: ['align'], code: ['class'], ol: ['start']
            },
            allowedSchemes: ['http', 'https', 'mailto', 'tel'],
            allowProtocolRelative: false
          });
          // Markdown headings are relative to their owning section: # becomes one level below it.
          for (const original of [...content.querySelectorAll('h1,h2,h3,h4,h5,h6')]) {
            const adjusted = document.createElement(`h${Math.min(6, level + Number(original.tagName.slice(1)))}`);
            adjusted.innerHTML = original.innerHTML;
            const base = `${section.id}-${slug(original.textContent)}`;
            let id = base;
            for (let count = 2; ids.has(id); count++) id = `${base}-${count}`;
            adjusted.id = claimId(id);
            original.replaceWith(adjusted);
          }
          for (const image of content.querySelectorAll('img')) { image.setAttribute('loading', 'lazy'); image.setAttribute('decoding', 'async'); }
        } else {
          const empty = document.createElement('p');
          empty.className = 'empty-state';
          empty.textContent = 'No content added yet.';
          content.append(empty);
        }
        container.append(content);
      }
      await renderSections(section.children || [], container, level + 1);
    }
  }
  await renderSections(config.sections, defaultTarget, 2);
  document.querySelector('meta[name="description"]').setAttribute('content', `${config.title} — ${config.subtitle || 'Research notebook'}`);
  const html = '<!doctype html>\n' + document.documentElement.outerHTML + '\n';
  // All content is validated and rendered before replacing the previous output.
  await rm(output, { recursive: true, force: true });
  await mkdir(path.join(output, 'assets'), { recursive: true });
  const publicPath = path.join(root, 'public');
  try { await access(publicPath); await cp(publicPath, output, { recursive: true }); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await writeFile(path.join(output, 'index.html'), html);
  await cp(path.join(root, 'src/styles.css'), path.join(output, 'assets/styles.css'));
  await writeFile(path.join(output, '.nojekyll'), '');
  return { output, html };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await build();
    console.log(`Built static HTML in ${path.relative(projectRoot, result.output)}/ (Markdown compiled with Marked).`);
  } catch (error) { console.error(`Build failed: ${error.message}`); process.exitCode = 1; }
}
