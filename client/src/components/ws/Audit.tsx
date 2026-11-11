import { Section } from '../ui';
import Grid, { dateCell } from '../Grid';
import type { WsProps } from '../../pages/Workspace';

export default function Audit({ v }: WsProps) {
  const rows = [...v.audit].reverse().map((x: any) => ({ ...x, actorName: v.users[x.actor]?.name || x.actor }));
  return (
    <Section title="Activity & decision audit trail">
      <p className="mb-2 text-xs text-slate-500">Append-only record of SOW versions, approvals, clarifications, submissions, Kernel runs, QA decisions, feedback, expert selection and votes, fees, funding, allocation recommendations, approvals and PayPal confirmations. Each entry references its supporting evidence.</p>
      <Grid rows={rows} height={600} pagination cols={[
        { field: 'at', headerName: 'When', cellRenderer: dateCell, minWidth: 170, maxWidth: 190 },
        { field: 'actorType', headerName: 'Type', maxWidth: 110 },
        { field: 'actorName', headerName: 'Actor', minWidth: 160 },
        { field: 'action', minWidth: 200 },
        { field: 'details', minWidth: 420, flex: 3, wrapText: true, autoHeight: true, cellStyle: { lineHeight: '1.35', paddingTop: '6px', paddingBottom: '6px' } },
        { headerName: 'Evidence refs', valueGetter: (q: any) => q.data.refs.map((r: any) => `${r.type}:${r.id}`).join(', '), minWidth: 180 },
      ]} />
    </Section>
  );
}
