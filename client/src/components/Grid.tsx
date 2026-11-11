import { AgGridReact } from 'ag-grid-react';
import { themeQuartz, type ColDef } from 'ag-grid-community';
import { Badge } from './ui';
import { money, dt } from '../api';

const theme = themeQuartz.withParams({ fontSize: 13, headerFontSize: 12, rowHeight: 38, headerHeight: 36, borderRadius: 8, wrapperBorderRadius: 10, accentColor: '#4f46e5' });

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
