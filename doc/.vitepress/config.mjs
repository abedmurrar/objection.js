import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitepress';

const repo = 'https://github.com/abedmurrar/objection.js';
const site = 'https://abedmurrar.github.io/objection.js/';
const name = '@abedmurrar/objection';
const description =
  'A fast, strictly typed SQL ORM for Node.js and TypeScript, built on knex. Models, relations, eager loading, graph inserts and upserts, transactions and JSON columns on Postgres, MySQL, MariaDB and SQLite. A maintained fork of objection.js.';
const ogImage = `${site}og.png`;

export default defineConfig({
  lang: 'en-US',
  title: name,
  titleTemplate: `:title | ${name}`,
  description,
  base: '/objection.js/',

  // Pages are served without .html (GitHub Pages resolves /guide/models to
  // guide/models.html), so the canonical URLs and the sitemap use that form.
  cleanUrls: true,
  sitemap: { hostname: site },

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/objection.js/favicon.svg' }],
    ['meta', { name: 'theme-color', content: '#e0b24d' }],
    ['meta', { name: 'author', content: 'Abed Murrar' }],
    [
      'meta',
      {
        name: 'keywords',
        content:
          'typescript orm, node.js orm, sql orm, knex orm, query builder, objection.js, objection.js fork, objection.js alternative, postgres orm, mysql orm, mariadb orm, sqlite orm, eager loading, graph upsert',
      },
    ],
    ['meta', { property: 'og:site_name', content: name }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:locale', content: 'en_US' }],
    ['meta', { property: 'og:image', content: ogImage }],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],
    ['meta', { property: 'og:image:alt', content: `${name}: the TypeScript SQL ORM for Node.js` }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:image', content: ogImage }],
  ],

  // Per page: the canonical URL, a description (from the frontmatter, or the
  // first paragraph of the page), and the Open Graph and Twitter tags.
  transformPageData(pageData, { siteConfig }) {
    if (pageData.isNotFound) {
      return;
    }

    const url = site + pageData.relativePath.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '');
    const pageDescription =
      pageData.frontmatter.description ||
      (pageData.relativePath === 'index.md' ? description : pageSummary(pageData, siteConfig));
    const title =
      pageData.frontmatter.titleTemplate === false || !pageData.title
        ? pageData.title || name
        : `${pageData.title} | ${name}`;

    pageData.description = pageDescription;
    pageData.frontmatter.head ??= [];
    pageData.frontmatter.head.push(
      ['link', { rel: 'canonical', href: url }],
      ['meta', { property: 'og:url', content: url }],
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: pageDescription }],
      ['meta', { name: 'twitter:title', content: title }],
      ['meta', { name: 'twitter:description', content: pageDescription }],
    );

    if (pageData.relativePath === 'index.md') {
      pageData.frontmatter.head.push([
        'script',
        { type: 'application/ld+json' },
        JSON.stringify(structuredData()),
      ]);
    }
  },

  // The pages are README.md files, as on GitHub.
  rewrites(id) {
    return id.replace(/(^|\/)README\.md$/, '$1index.md');
  },

  appearance: 'dark',
  // The date each page last changed, from git. Shown on the page and used as
  // <lastmod> in the sitemap.
  lastUpdated: true,

  themeConfig: {
    search: { provider: 'local' },

    socialLinks: [{ icon: 'github', link: repo }],

    editLink: {
      pattern: `${repo}/edit/main/doc/:path`,
      text: 'Edit this page on GitHub',
    },

    nav: [
      { text: 'Guide', link: '/guide/' },
      {
        text: 'API Reference',
        items: [
          { text: 'Main Module', link: '/api/objection/' },
          { text: 'Query Builder', link: '/api/query-builder/' },
          { text: 'Model', link: '/api/model/' },
          { text: 'Types', link: '/api/types/' },
        ],
      },
      { text: 'Recipe Book', link: '/recipes/' },
      // The fork's own section stands out in the nav (styled in theme/custom.css).
      {
        text: '<span class="fork-nav">Fork Additions</span><span class="fork-nav-badge">new</span>',
        link: '/fork/',
      },
      {
        text: 'Release Notes',
        items: [
          { text: 'Changelog', link: '/release-notes/changelog' },
          { text: 'Migration to 4.0', link: '/release-notes/migration' },
        ],
      },
    ],

    sidebar: {
      '/guide/': section('Guide', '/guide/', {
        installation: 'Installation',
        'getting-started': 'Getting started',
        models: 'Models',
        relations: 'Relations',
        'query-examples': 'Query examples',
        transactions: 'Transactions',
        hooks: 'Hooks',
        validation: 'Validation',
        documents: 'Documents',
        plugins: 'Plugins',
        contributing: 'Contribution guide',
      }),

      '/api/model/': section('Model API Reference', '/api/model/', {
        overview: 'Overview',
        'static-properties': 'Static Properties',
        'static-methods': 'Static Methods',
        'instance-methods': 'Instance Methods',
        'instance-properties': 'Instance Properties',
      }),

      '/api/objection/': section('Objection API Reference', '/api/objection/', {
        '': 'module objection',
      }),

      '/api/query-builder/': section('Query Builder API Reference', '/api/query-builder/', {
        'find-methods': 'Find Methods',
        'mutate-methods': 'Mutating Methods',
        'eager-methods': 'Eager Loading Methods',
        'join-methods': 'Join Methods',
        'other-methods': 'Other Methods',
        'static-methods': 'Static Methods',
      }),

      '/recipes/': section('Recipes', '/recipes/', {
        'raw-queries': 'Raw queries',
        'precedence-and-parentheses': 'Precedence and parentheses',
        subqueries: 'Subqueries',
        'relation-subqueries': 'Relation subqueries',
        joins: 'Joins',
        modifiers: 'Modifiers',
        'composite-keys': 'Composite keys',
        'polymorphic-associations': 'Polymorphic associations',
        'json-queries': 'JSON queries',
        'custom-id-column': 'Custom id column',
        'extra-properties': 'Join table extra properties',
        'custom-validation': 'Custom validation',
        'snake-case-to-camel-case-conversion': 'Snake case to camel case conversion',
        paging: 'Paging',
        'returning-tricks': 'PostgreSQL "returning" tricks',
        timestamps: 'Timestamps',
        'custom-query-builder': 'Custom query builder',
        'multitenancy-using-multiple-databases': 'Multitenancy using multiple databases',
        'default-values': 'Default values',
        'error-handling': 'Error handling',
        plugins: 'TypeScript plugins',
        'ternary-relationships': 'Ternary relationships',
        'indexing-postgresql-jsonb-columns': 'Indexing PostgreSQL JSONB columns',
      }),

      '/fork/': section('Fork Additions', '/fork/', {
        '': 'Overview',
        'breaking-changes': 'Breaking changes',
        mysql: 'MySQL',
        expressions: 'Expressions',
        joins: 'Joins and model classes',
        knex: 'knex methods',
        typescript: 'TypeScript',
        performance: 'Performance',
        dito: 'Ported from ditojs/objection',
      }),
    },

    outline: { level: [2, 3] },

    footer: {
      message: 'MIT Licensed. Built on objection.js by Sami Koskimäki and its contributors.',
      copyright: 'Copyright © 2015-present Sami Koskimäki, © 2026-present Abed Murrar',
    },
  },
});

function section(text, base, pages) {
  return [
    {
      text,
      items: Object.entries(pages).map(([page, title]) => ({
        text: title,
        link: base + page,
      })),
    },
  ];
}

// The first paragraph of the page. When it's short, as on the API reference
// pages, which start with a method's one-line summary, it's prefixed with the
// page title and what the package is.
function pageSummary(pageData, siteConfig) {
  const paragraph = firstParagraph(path.join(siteConfig.srcDir, pageData.filePath));

  if (paragraph && paragraph.length >= 80) {
    return paragraph;
  }

  const intro = `${pageData.title} in ${name}, the TypeScript SQL ORM for Node.js built on knex.`;
  return paragraph ? `${intro} ${paragraph}` : intro;
}

// The first paragraph of a Markdown page, as plain text of at most 160
// characters, for the meta description.
function firstParagraph(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }

  const body = text
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^:::[\s\S]*?^:::/gm, '');
  const paragraph = body
    .split(/\n\s*\n/)
    .map((it) => it.trim())
    .find((it) => it && !/^(#|\||<|-|\*|\d+\.|>|!\[)/.test(it));

  if (!paragraph) {
    return null;
  }

  const plain = paragraph
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_]/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (plain.length <= 160) {
    return plain;
  }

  return `${plain.slice(0, 157).replace(/\s+\S*$/, '')}...`;
}

// schema.org data for the home page, so search engines know this is a
// software library and where its code and package are.
function structuredData() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        name,
        url: site,
        description,
      },
      {
        '@type': 'SoftwareSourceCode',
        name,
        alternateName: ['objection', 'abedmurrar objection'],
        description,
        url: site,
        codeRepository: repo,
        programmingLanguage: ['TypeScript', 'JavaScript', 'SQL'],
        runtimePlatform: 'Node.js',
        license: 'https://opensource.org/licenses/MIT',
        author: { '@type': 'Person', name: 'Abed Murrar', url: 'https://github.com/abedmurrar' },
        sameAs: [repo, 'https://www.npmjs.com/package/@abedmurrar/objection'],
        keywords:
          'ORM, SQL, TypeScript, Node.js, knex, query builder, PostgreSQL, MySQL, MariaDB, SQLite',
      },
    ],
  };
}
