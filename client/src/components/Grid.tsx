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
  rowHeight: 36,
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

export default function Grid<T>({ rows, cols, height = 320, onRowClicked, pagination }: { rows: T[]; cols: ColDef<T>[]; height?: number; onRowClicked?: (r: T) => void; pagination?: boolean }) {
  return (
    <div style={{ height }}>
      <AgGridReact<T>
        theme={theme}
        rowData={rows}
        columnDefs={cols}
        defaultColDef={{ sortable: true, filter: true, resizable: true, flex: 1, minWidth: 100 }}
        onRowClicked={onRowClicked ? (e) => e.data && onRowClicked(e.data) : undefined}
        rowStyle={onRowClicked ? { cursor: 'pointer' } : undefined}
        pagination={pagination}
        paginationPageSize={10}
        paginationPageSizeSelector={[10, 25, 50]}
        overlayNoRowsTemplate="<span style='color:#64748b'>No rows yet</span>"
      />
    </div>
  );
}
