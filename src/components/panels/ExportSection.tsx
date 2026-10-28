/** Export presets (scale, suffix, format) for layers and pages. */
import { useState } from 'react';
import { useStore } from '../../store';
import { setProps } from '../../actions';
import { exportCombined, exportLayers } from '../../exporter';
import type { ExportFormat, ExportSetting } from '../../types';
import { AddBtn, RemoveBtn, Section } from './controls';

export function ExportRows({ rows, onChange }: { rows: ExportSetting[]; onChange: (rows: ExportSetting[]) => void }) {
  return (
    <>
      {rows.map((r, i) => (
        <div key={i} className="export-row">
          <select value={r.scale} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, scale: +e.target.value } : x)))} disabled={r.format === 'svg'}>
            {[0.5, 0.75, 1, 1.5, 2, 3, 4].map((k) => (
              <option key={k} value={k}>
                {k}x
              </option>
            ))}
          </select>
          <input className="text-input" placeholder="Suffix" value={r.suffix} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, suffix: e.target.value } : x)))} />
          <select value={r.format} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, format: e.target.value as ExportFormat } : x)))}>
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
            <option value="svg">SVG</option>
            <option value="pdf">PDF</option>
            <option value="gif">GIF</option>
          </select>
          <RemoveBtn title="Remove export" onClick={() => onChange(rows.filter((_, j) => j !== i))} />
        </div>
      ))}
    </>
  );
}

export const DEFAULT_EXPORT: ExportSetting = { scale: 1, format: 'png', suffix: '' };

export function ExportSection({ ids, name, nodeRows }: { ids: string[]; name: string; nodeRows?: ExportSetting[] }) {
  const [localRows, setLocalRows] = useState<ExportSetting[]>([{ ...DEFAULT_EXPORT, scale: 2 }]);
  const [busy, setBusy] = useState(false);
  const rows = nodeRows ?? localRows;
  const setRows = (r: ExportSetting[]) => (nodeRows ? setProps(ids, { exports: r }) : setLocalRows(r));
  return (
    <Section title="Export" action={<AddBtn title="Add export setting" onClick={() => setRows([...rows, rows.length ? { ...rows[rows.length - 1], suffix: `@${rows.length + 1}` } : DEFAULT_EXPORT])} />}>
      <ExportRows rows={rows} onChange={setRows} />
      {rows.length > 0 && (
        <button
          className="btn wide"
          disabled={busy || !ids.length}
          onClick={async () => {
            setBusy(true);
            try {
              const doc = useStore.getState().doc;
              if (nodeRows) await exportLayers(doc, ids, rows, name);
              else for (const r of rows) await exportCombined(doc, ids, r, name + r.suffix);
            } catch (e) {
              alert('Export failed: ' + (e instanceof Error ? e.message : e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Exporting…' : `Export ${name}`}
        </button>
      )}
    </Section>
  );
}
