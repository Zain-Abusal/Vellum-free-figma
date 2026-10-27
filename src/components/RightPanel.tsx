import { useState } from 'react';
import { Design } from './panels/Design';
import { Prototype } from './panels/Prototype';
import { Inspect } from './panels/Inspect';

export default function RightPanel() {
  const [tab, setTab] = useState<'design' | 'prototype' | 'inspect'>('design');
  return (
    <aside className="panel right">
      <div className="tabs">
        {(['design', 'prototype', 'inspect'] as const).map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <div className="panel-scroll" key={tab}>{tab === 'design' ? <Design /> : tab === 'prototype' ? <Prototype /> : <Inspect />}</div>
    </aside>
  );
}
