'use strict';
/**
 * Kandela Kulture - Systemwide Translation Helper
 * 
 * Usage:
 *   node scripts/translate.js                     # Kiswahili translation for home
 *   node scripts/translate.js sw gatherings.html  # Kiswahili for gatherings
 *   node scripts/translate.js fr about.html       # French for about
 *   node scripts/translate.js --all [lang]        # Generate URLs for all pages
 *   node scripts/translate.js --langs [page]      # Generate URLs for top languages
 */

const fs = require('node:fs');
const path = require('node:path');

const PUB = path.join(__dirname, '..', 'public');
const CANONICAL = 'https://kandelakulture.example';

const TOP_LANGUAGES = {
  sw: 'Kiswahili (Swahili - Nairobi)',
  fr: 'Français (French)',
  es: 'Español (Spanish)',
  ar: 'العربية (Arabic)',
  de: 'Deutsch (German)',
  pt: 'Português (Portuguese)',
  'zh-CN': '中文 (Chinese Simplified)',
  ja: '日本語 (Japanese)'
};

function getPages() {
  return fs.readdirSync(PUB).filter(f => f.endsWith('.html')).sort();
}

function buildTranslateUrl(lang, page) {
  const normPage = page.replace(/^\//, '');
  const pageUrl = CANONICAL + '/' + (normPage === 'index.html' ? '' : normPage);
  return 'https://translate.google.com/translate?sl=auto&tl=' + encodeURIComponent(lang) + '&u=' + encodeURIComponent(pageUrl);
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--all') || args.includes('-a')) {
    const lang = args.find(a => !a.startsWith('-')) || 'sw';
    console.log(`Generating Google Translate URLs for ALL pages [Language: ${lang}]:\n`);
    for (const p of getPages()) {
      console.log(`${p.padEnd(22)} -> ${buildTranslateUrl(lang, p)}`);
    }
    return;
  }

  if (args.includes('--langs') || args.includes('-l')) {
    const page = args.find(a => !a.startsWith('-')) || 'index.html';
    console.log(`Generating Google Translate URLs for page [${page}] in top languages:\n`);
    for (const [code, name] of Object.entries(TOP_LANGUAGES)) {
      console.log(`${code.padEnd(6)} (${name}):`);
      console.log(`  ${buildTranslateUrl(code, page)}\n`);
    }
    return;
  }

  const lang = args[0] || 'sw';
  const page = args[1] || 'index.html';

  console.log(`Kandela Kulture Translation Link:`);
  console.log(`Page:      ${page}`);
  console.log(`Language:  ${lang} (${TOP_LANGUAGES[lang] || 'Custom code'})`);
  console.log(`Target:    ${CANONICAL}/${page === 'index.html' ? '' : page}`);
  console.log(`Translate: ${buildTranslateUrl(lang, page)}`);
}

if (require.main === module) {
  main();
}

module.exports = { buildTranslateUrl, TOP_LANGUAGES };
