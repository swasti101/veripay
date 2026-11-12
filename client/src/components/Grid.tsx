import { useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { themeQuartz, type ColDef } from 'ag-grid-community';
import { Badge } from './ui';
import { money, dt } from '../api';

// Grids are ledgers here: square shoulders, hairline rules, tabular figures.
const theme = themeQuartz.withParams({
  fontFamily: 'IBM Plex Sans, system-ui, sans-serif',
  fontSize: 13,
  headerFontSize: 12,
  headerFontWeight: 500,
  rowHeight: 38,
  headerHeight: 34,
  borderRadius: 2,
  wrapperBorderRadius: 2,
  accentColor: '#8c2f39',
  backgroundColor: '#ffffff',
  foregroundColor: '#1a1f2e',
  headerBackgroundColor: '#f6f7f9',
  headerTextColor: '#6b7489',
  borderColor: '#dfe3ea',
  oddRowBackgroundColor: '#ffffff',
  rowHoverColor: '#f6f7f9',
  selectedRowBackgroundColor: '#f8eef0',
});

export const badgeCell = (p: any) => (p.value ? <Badge>{String(p.value)}</Badge> : '—');
export const moneyCell = (p: any) => (p.value === undefined || p.value === null ? '—' : money(p.value));
export const dateCell = (p: any) => dt(p.value);

export default function Grid<T>({
  rows,
  cols,
  height = 340,
  onRowClicked,
  pagination,
}: {
  rows: T[];
  cols: ColDef<T>[];
  height?: number;
  onRowClicked?: (r: T) => void;
  pagination?: boolean;
}) {
  const [inspected, setInspected] = useState<T | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyVal = (key: string, val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  return (
    <div className="relative">
      <div style={{ height }}>
        <AgGridReact<T>
          theme={theme}
          rowData={rows}
          columnDefs={cols}
          defaultColDef={{
            sortable: true,
            filter: true,
            resizable: true,
            flex: 1,
            minWidth: 120,
            tooltipValueGetter: (p: any) => {
              if (p.valueFormatted) return String(p.valueFormatted);
              if (p.value !== undefined && p.value !== null) {
                return typeof p.value === 'object' ? JSON.stringify(p.value, null, 2) : String(p.value);
              }
              if (typeof p.colDef?.valueGetter === 'function') {
                const v = p.colDef.valueGetter(p);
                return typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v ?? '');
              }
              return '';
            },
          }}
          enableCellTextSelection={true}
          ensureDomOrder={true}
          onRowClicked={(e) => {
            if (onRowClicked) {
              onRowClicked(e.data as T);
            } else if (e.data) {
              setInspected(e.data as T);
            }
          }}
          onCellDoubleClicked={(e) => {
            if (e.data) setInspected(e.data as T);
          }}
          rowStyle={{ cursor: 'pointer' }}
          pagination={pagination}
          paginationPageSize={10}
          paginationPageSizeSelector={[10, 25, 50]}
          overlayNoRowsTemplate="<span style='color:#64748b'>No rows yet</span>"
        />
      </div>

      <div className="mt-1 flex items-center justify-between text-[11px] text-ink-3">
        <span>💡 Tip: Click any row to view full details · Hover for preview tooltips</span>
      </div>

      {inspected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          onClick={() => setInspected(null)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-rule-strong bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-rule bg-surface-2 px-5 py-3">
              <div>
                <h3 className="text-sm font-semibold text-ink">Record Full Details</h3>
                <p className="text-[11px] text-ink-3">Full un-truncated content and values for this row</p>
              </div>
              <button
                type="button"
                className="btn-ghost !p-1 text-base text-ink-3 hover:text-ink"
                onClick={() => setInspected(null)}
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 overflow-y-auto p-5">
              {cols
                .filter((c) => c.field || c.headerName)
                .map((col, idx) => {
                  const field = col.field as string;
                  const label = col.headerName || field || `Field ${idx + 1}`;
                  let val = field ? (inspected as any)[field] : undefined;
                  if (val === undefined && typeof col.valueGetter === 'function') {
                    val = col.valueGetter({ data: inspected } as any);
                  }
                  if (val === undefined && typeof (inspected as any)[label] !== 'undefined') {
                    val = (inspected as any)[label];
                  }
                  const displayVal =
                    val === null || val === undefined
                      ? '—'
                      : typeof val === 'object'
                        ? JSON.stringify(val, null, 2)
                        : String(val);

                  return (
                    <div key={idx} className="rounded border border-rule bg-surface p-3">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">{label}</span>
                        {displayVal !== '—' && (
                          <button
                            type="button"
                            className="text-xs font-medium text-seal hover:underline"
                            onClick={() => copyVal(label, displayVal)}
                          >
                            {copiedKey === label ? '✓ Copied' : 'Copy'}
                          </button>
                        )}
                      </div>
                      <div className="max-h-48 overflow-y-auto font-mono text-xs text-ink whitespace-pre-wrap break-words select-all">
                        {displayVal}
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="flex justify-end border-t border-rule bg-surface-2 px-5 py-2.5">
              <button type="button" className="btn-secondary text-xs" onClick={() => setInspected(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
