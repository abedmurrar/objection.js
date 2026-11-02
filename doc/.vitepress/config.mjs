import { defineConfig } from 'vitepress';

const repo = 'https://github.com/abedmurrar/objection.js';

export default defineConfig({
  title: 'Objection.js',
  description: 'An SQL friendly ORM for node.js',
  base: '/objection.js/',

  // The pages are README.md files, as on GitHub.
  rewrites(id) {
    return id.replace(/(^|\/)README\.md$/, '$1index.md');
  },

  appearance: 'dark',
  lastUpdated: false,

  themeConfig: {
    search: { provider: 'local' },

    socialLinks: [{ icon: 'github', link: repo }],

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
      { text: 'Fork Additions', link: '/fork/' },
      {
        text: 'Release Notes',
        items: [
          { text: 'Changelog', link: '/release-notes/changelog' },
          { text: 'Migration to 4.0', link: '/release-notes/migration' },
          {
            text: 'v2.x documentation',
            link: 'https://github.com/Vincit/objection.js/tree/v2/doc',
          },
          {
            text: 'v1.x documentation',
            link: 'https://github.com/Vincit/objection.js/tree/v1/doc',
          },
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
      }),
    },

    outline: { level: [2, 3] },

    footer: {
      message: 'MIT Licensed',
      copyright: 'Copyright © 2015-present Sami Koskimäki',
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
