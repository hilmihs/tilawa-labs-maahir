'use client';

import { useState } from 'react';
import TableBrowser from './TableBrowser';
import Console from './Console';
import SchemaTree from './SchemaTree';

interface TableInfo {
  name: string;
  rows: number;
}

type Tab = 'browse' | 'schema' | 'sql';

const TABS: { key: Tab; label: string }[] = [
  { key: 'browse', label: 'Jelajah Tabel' },
  { key: 'schema', label: 'Skema' },
  { key: 'sql', label: 'SQL Console' },
];

export default function DbAdmin({ tables }: { tables: TableInfo[] }) {
  const [tab, setTab] = useState<Tab>('browse');

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`btn btn-sm ${tab === t.key ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'browse' && <TableBrowser tables={tables} />}
      {tab === 'schema' && <SchemaTree />}
      {tab === 'sql' && <Console tables={tables} />}
    </div>
  );
}
