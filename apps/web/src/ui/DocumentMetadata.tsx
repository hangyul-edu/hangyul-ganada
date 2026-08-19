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
 * `index.html` ships the English versions for crawlers and for the moment
 * before hydration; this takes over once the locale is resolved. The brand
 * itself is never translated — only the sentence around it.
 */
export function DocumentMetadata() {
  const { locale } = useLocale();
  const { t } = useTranslation('common');

  useEffect(() => {
    const name = productName(locale);
    const description = t('brand.description');
    document.title = name;
    setMeta('meta[name="description"]', `${name} — ${description}`);
    setMeta('meta[property="og:site_name"]', name);
    setMeta('meta[property="og:title"]', name);
    setMeta('meta[property="og:description"]', t('brand.tagline'));
  }, [locale, t]);

  return null;
}
