# Deploying the web build

Hangyul ganada's web build is a static bundle — `apps/web/dist`, produced by
`npm run build`. There is no server component: no API, no database, no session.
Everything the learner produces stays on their device.

That makes hosting almost trivial, with **one exception that is not optional**,
and this document exists because getting it wrong produces a bug that no amount
of application code can fix.

## The one thing a host must do

The app uses clean URLs and client-side routing (`BrowserRouter`). A learner
looking at a word is at a URL like:

```
https://ganada.talkhangyul.com/words/word/word_eomma
```

Navigating there *inside the app* works, because the router resolves it in the
page. **Refreshing it, pasting it into a new tab, or opening it from a shared
link is an ordinary HTTP GET for a path that is not a file on disk.** A static
host answers that with 404, and the learner loses the page they were on.

So the host must serve `index.html` for any path that is not a real file, and
let React Router take it from there. The router already knows every route, and
`WordDetailPage` reconstructs itself from `:wordId` alone — no navigation state
is required for a page to load, which is what makes the deep link meaningful
rather than merely non-404.

Two things must be kept **out** of that fallback:

* **`/api/*`** — reserved, so that a backend added later cannot be shadowed by
  the app shell. Nothing is deployed there today.
* **`/assets/*`** — the hashed bundles. Existing files are served by the host's
  filesystem check before any rule is consulted, so the fallback never touches
  them; excluding the prefix means a bundle that is genuinely *gone* answers 404
  instead of HTML. A dynamic `import()` handed markup fails with a syntax error
  that points at nothing, which is a far worse afternoon than a 404.

Everything else — the service worker, the manifest, the favicon, the fonts, the
47 MB of audio — is a real file and is matched before the fallback.

## What ships in this repository

| File | Host |
| --- | --- |
| `vercel.json` | Vercel, project rooted at the repository |
| `apps/web/vercel.json` | Vercel, project rooted at `apps/web` |
| `apps/web/public/_redirects` | Netlify, Cloudflare Pages, and others that read the format — copied into `dist` by the build, so it travels with whatever directory is published |

Both Vercel files carry the same rule and differ only in where they expect the
build to happen. Keep whichever matches the project's **Root Directory** setting;
the other is inert.

## The same rule, for other hosts

**nginx**

```nginx
location /assets/ {
    try_files $uri =404;
}

location / {
    try_files $uri $uri/ /index.html;
}
```

**Caddy**

```
handle /assets/* {
    file_server
}

handle {
    try_files {path} /index.html
    file_server
}
```

**Apache** (`.htaccess`)

```apache
RewriteEngine On
RewriteCond %{REQUEST_URI} !^/assets/
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]
```

**S3 + CloudFront** — a custom error response mapping 403 and 404 to
`/index.html` with a 200 status. Exclude `/assets/*` with a separate cache
behaviour if you want missing bundles to stay missing.

## Shared, and not indexed

Two goals that pull in opposite directions, and both are configured here rather
than in application code — a crawler never runs React, so anything set in a
`useEffect` is invisible to it.

**A shared link must render a card.** `apps/web/index.html` carries the complete
Open Graph and Twitter set in the file: `og:type`, `og:site_name`, `og:url`,
`og:title`, `og:description`, `og:image` with its type, width, height and alt
text, and `twitter:card=summary_large_image` with its own title, description and
image. Every URL is absolute — a crawler resolves nothing relative.

The preview image is `/brand/og-hangyul-ganada.jpg`, **generated** by
`scripts/content/build_app_icons.py` from `apps/common_assets/ob/ob image4.jpg`.
The source is 3200 × 1600, exactly the 2:1 that `summary_large_image` specifies,
so the build is a straight LANCZOS resample to 1200 × 600 at quality 88 — no
crop, no letterbox, no stretch, nothing drawn over the artwork. It is
regenerated rather than referenced in place for two reasons: the source filename
contains a space, which survives a filesystem and does not reliably survive a
crawler fetching an absolute URL, and 1.4 MB is a slow fetch for a card that
renders at 600 px. The generated file is 56 kB. `npm run mobile:icons:check`
keeps it in step with its source.

**The same URL must not appear in a search result.** The product is a paid
application, not a content site. The authoritative mechanism is `noindex`, in
two places:

* `<meta name="robots">` and `<meta name="googlebot">` in `index.html`, both
  `noindex,nofollow,noarchive,nosnippet,noimageindex`.
* `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex` as a
  catch-all response header, in **both** `vercel.json` files. Two, because the
  project's Root Directory setting decides which one Vercel reads and the other
  is inert; a header in only the inert one is the same as no header. The
  header is what covers fetches that never parse HTML.

`robots.txt` **allows** crawling, and that is the part most often got backwards.
A `Disallow: /` would mean Google never fetches the page, never finds the
`noindex`, and can still list the bare URL on the strength of a link from
somewhere else — blocking the crawler is how a URL stays in the index, not how
it leaves. There is also **no sitemap**, deliberately: a sitemap is an invitation
to index.

None of the indexing directives affects the preview card. Slack, KakaoTalk,
Discord, X and Facebook run preview crawlers, not search crawlers; they do not
consult robots meta or `X-Robots-Tag`. The link is public and shareable and will
not be found in a search, which is the intended combination.

`npm run share:check` asserts all of it against the **built** `dist`: every tag
present, the origin absolute, the image actually in the build and actually the
declared 1200 × 600, both robots tags complete, both Vercel configs carrying the
header, `robots.txt` free of any `Disallow`, and no `sitemap*.xml` emitted.

### Other hosts

The `X-Robots-Tag` needs its own expression per host. On **nginx**:

```nginx
add_header X-Robots-Tag "noindex, nofollow, noarchive, nosnippet, noimageindex" always;
```

On **Netlify / Cloudflare Pages**, a `_headers` file beside `_redirects`:

```
/*
  X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex
```

Neither is shipped, because Vercel is what `vercel.json` describes and inventing
configuration for a host nobody has chosen is how a repository accumulates files
that are never true. The `noindex` meta tags in `index.html` travel with the
build regardless of host and are sufficient on their own for any crawler that
parses the page.

## Caching

One header matters: `sw.js` must not be cached for long, or a released fix is
held behind the service worker that was supposed to deliver it. The Vercel
config sets `Cache-Control: no-cache, must-revalidate` on it. Hashed files under
`/assets/` can be cached forever; `index.html` should not be.

## Verifying it

```
npm run build
npm run routing        # or routing:check, which is in verify:quick
```

`scripts/check-spa-routing.mjs` serves the built `dist/` the way a static host
serves it — filesystem first, then the rewrites **read out of `vercel.json`
itself** — and requests every route in `App.tsx`, a real file of each kind, a
bundle that does not exist, and an `/api/` path. It deliberately does not use
the Vite dev server or `vite preview`: both have SPA fallback built in, so both
would pass while production returned 404, which is exactly how this shipped
broken in the first place.
