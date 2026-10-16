# Ancient Macedonia — research site framework

A dark, single-page research notebook. **All research content is supplied by you.** This repository provides only the publishing framework and section headings.

Markdown is compiled **at build time** using [Marked](https://github.com/markedjs/marked) (MIT license). [sanitize-html](https://github.com/apostrophecms/sanitize-html) sanitizes its output, and [LinkeDOM](https://github.com/WebReflection/linkedom) inserts it into the HTML template. Dependencies are installed from npm and locked in `package-lock.json`; nothing is loaded from a CDN. The published page needs **no JavaScript**, runtime Markdown compiler, or content-fetching requests.

## Write your research on GitHub

1. Open `content/timeline-update.md`, click the pencil, and write your short update.
2. Open `content/army-reforms.md` and write your text. Its `# Formations` heading is already provided; write beneath it, or add introductory text above it.
3. Commit your edits. Once this framework is merged into `main` and Pages is enabled, successful builds publish automatically.

Do **not** repeat “Timeline update” or “Army Reforms” as Markdown titles. The config creates those headings for you. Empty Markdown files display “No content added yet.” No research text is included.

## Initial structure

```text
Ancient Macedonia                    ← site title, h1
└── Research batch 4                  ← config group, h2
    ├── Timeline update              ← Markdown section, h3
    └── Army Reforms                 ← Markdown section, h3
        └── Formations               ← # heading inside the Markdown, h4
```

## Configure sections and hierarchy

Edit `site.config.json`. It references a local `site.schema.json` for editor hints.

Each entry in `sections` or `children` supports:

| Field | Purpose |
| --- | --- |
| `id` | Required unique HTML anchor. Lowercase letters, digits and hyphens; starts with a letter. |
| `title` | Required visible heading and navigation label. |
| `file` | Optional `.md` path relative to the repository root. Omit for a grouping heading. |
| `children` | Optional array of nested entries using the same format. This is the hierarchy setting. |
| `nav` | Optional boolean. By default, file-backed sections appear in top navigation; groups do not. |
| `target` | Optional ID of a custom div in `src/template.html`. Defaults to the containing section, or `research-content` for top-level entries. |

Array order controls section order and navigation order. Reordering entries or renaming files requires updating the config; filenames alone do not create sections. Top navigation is a flat set of section links, not dropdowns. Ordinary headings inside Markdown are not added to navigation.

### Add another section or batch

Create a Markdown file through **Add file → Create new file**, then add an entry to the appropriate `children` array. For example, this is a generic grouping entry—not research content:

```json
{
  "id": "another-batch",
  "title": "Another batch",
  "nav": false,
  "children": [
    {
      "id": "new-section",
      "title": "New section",
      "file": "content/new-section.md"
    }
  ]
}
```

Put that object in the top-level `sections` array to add a sibling batch. Nesting begins at h2; config levels deeper than h6 fail the build with an error. Markdown heading levels are relative to their containing section: a `#` becomes the next heading level, `##` the level after that, capped at h6.

Markdown headings receive predictable anchors prefixed with the section ID. For example, `# Formations` inside `army-reforms` becomes `#army-reforms-formations`. Duplicate heading anchors get numeric suffixes (`-2`, `-3`, etc.). Section titles and IDs should be defined in config rather than raw HTML.

### Custom div slots

For a custom placement, add a div **inside `<main>`** in `src/template.html`:

```html
<div id="custom-research-slot"></div>
```

Then set `"target": "custom-research-slot"` on an entry. The entire rendered section, including its children, is inserted there during the build. Other entries can still render automatically. A child with its own target is placed in that target instead of its parent; its heading level still follows the config hierarchy. Missing targets, missing Markdown files, duplicate IDs and invalid hierarchy fail the build rather than silently losing content.

## Markdown, links and media

Standard headings, paragraphs, bold/italic, lists, quotes, links, fenced code blocks and GitHub-style tables are supported. Raw HTML is sanitized: scripts, event handlers, iframes and unsafe URLs are removed. This is for content, not executable widgets. Advanced extensions such as footnote syntax and automatic bibliographies are not enabled; use ordinary source links and lists if needed.

Put any **user-supplied** images or documents under `public/`. A file at `public/images/example.png` can be referenced as:

```md
![Your descriptive alt text](./images/example.png)
```

Use relative asset paths such as `./images/...`, not `/images/...`, so they work under the repository’s GitHub Pages URL. Link to other sections using `#section-id`; links to `.md` files are not rewritten into pages because this is a single-page site. Captions and credits can be written as ordinary Markdown beneath images. The contents of `public/` are copied to the published root; do not put secrets in that folder. The build owns `index.html`, `.nojekyll` and `assets/styles.css`.

## Deploy to GitHub Pages

1. Merge this framework into `main`.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **GitHub Actions**.
4. Push an edit to `main`, or open **Actions → Deploy research site to GitHub Pages → Run workflow** and choose `main`.
5. Wait for the build and deploy jobs to finish. The deployment job exposes the published URL.

The workflow uses Node 22, `npm ci`, tests, a static build and GitHub’s official Pages deployment actions. No token or third-party deploy service is needed. GitHub may require an administrator to enable Pages or adjust environment permissions. No repository settings have been changed by this framework.

Pull requests and pushes to `arena/**` run validation without deploying. Automatic production deployment is intentionally limited to `main`; it can also be manually dispatched. Relative stylesheet/media URLs work both at a repository subpath and on a custom domain.

## Optional local development

Requires Node.js 22 or later.

```sh
npm ci
npm run dev
```

Open `http://localhost:5173`. After editing Markdown, config, template or CSS, **refresh the browser** to rebuild. There is no hot-reload script. The preview listens on `0.0.0.0` and accepts hosted preview domains. Keep it for trusted local development; do not expose it as a production server.

```sh
npm test          # compiler, hierarchy, targets, safety and asset tests
npm run build    # generates dist/index.html and static assets
npm run preview  # serves the already-built dist directory
```

Set `PORT` to change the preview port. Only `dist/` is deployed. Generated output and `node_modules/` are ignored by Git. For visual changes edit `src/styles.css`; for structural changes edit `src/template.html` (keep its required element IDs).

The repository license is in `LICENSE`. Third-party packages retain their own licenses; their source repositories are linked above.
