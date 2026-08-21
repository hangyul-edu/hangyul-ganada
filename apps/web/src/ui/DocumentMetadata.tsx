import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { productName } from '../config/product';
import { useLocale } from '../i18n';

function setMeta(selector: string, content: string) {
  const el = document.head.querySelector<HTMLMetaElement>(selector);
  if (el) el.content = content;
}

/**
 * Keeps the document's title and description in the active language.
 *
 * ## This is for the person in the tab, not for the card in the chat
 *
 * A social crawler — Slack, KakaoTalk, Discord, X, Facebook — fetches
 * `index.html`, reads the tags and leaves. It does not run React, so nothing
 * here is ever seen by one. `index.html` carries the English sharing metadata
 * for exactly that reason, and this runs afterwards for the learner's own
 * window: the tab title, the bookmark, and what a screen reader announces as
 * the page name.
 *
 * The two must not be allowed to drift into saying *different things*, which is
 * why the shape is the same in both — brand, an em dash, then a sentence. What
 * differs is that the static copy is a fixed English pitch aimed at somebody who
 * has not opened the app, and this one is the learner's own language.
 *
 * ## Why the title is not just the brand
 *
 * It was, and a tab reading `Hangyul ganada` among twenty other tabs says
 * nothing about which one this is. It is now the wordmark and the tagline, which
 * is the same information the sharing card leads with and is short enough not to
 * be truncated to the brand alone in a narrow tab.
 *
 * The brand itself is never translated — only the sentence around it. See
 * `config/product`.
 *
 * ## What is deliberately not touched
 *
 * `og:image`, `og:url`, `og:type`, the canonical link and both `robots` tags.
 * They are correct in the file, identical for every locale, and a crawler has
 * already read them by the time this runs. Rewriting them here would be four
 * more things to keep in step for no reader.
 */
export function DocumentMetadata() {
  const { locale } = useLocale();
  const { t } = useTranslation('common');

  useEffect(() => {
    const name = productName(locale);
    const tagline = t('brand.tagline');
    const description = t('brand.description');

    document.title = `${name} — ${tagline}`;
    setMeta('meta[name="description"]', description);
    setMeta('meta[property="og:site_name"]', name);
    setMeta('meta[property="og:title"]', `${name} — ${tagline}`);
    setMeta('meta[property="og:description"]', description);
    setMeta('meta[name="twitter:title"]', `${name} — ${tagline}`);
    setMeta('meta[name="twitter:description"]', description);
  }, [locale, t]);

  return null;
}
