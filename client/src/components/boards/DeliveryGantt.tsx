import { useEffect, useRef } from 'react';
import { Gantt, TaskModel } from '@bryntum/gantt';
import '@bryntum/gantt/fontawesome/css/fontawesome.css';
import '@bryntum/gantt/fontawesome/css/solid.css';
import '@bryntum/gantt/gantt.css';
import '@bryntum/gantt/svalbard-light.css';
import './boards.css';
import { money } from '../../api';

class BoardTask extends TaskModel {
  static override get fields() {
    return [
      { name: 'amount', type: 'number' }, { name: 'kind' }, { name: 'work' }, { name: 'funding' },
      { name: 'gap', type: 'number' }, { name: 'blocked', type: 'boolean' }, { name: 'note' },
    ];
  }
}

const PCT: Record<string, number> = { NOT_STARTED: 0, IN_PROGRESS: 40, REVISION_REQUESTED: 55, SUBMITTED: 75, QA_COMPLETE: 85, IN_EXPERT_REVIEW: 90, ACCEPTED: 100, CLOSED: 100 };
const shift = (iso: string, days: number) => new Date(Date.parse(iso) + days * 864e5).toISOString().slice(0, 10);

export default function DeliveryGantt({ board }: { board: any }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const tasks: any[] = [];
    const dependencies: any[] = [];

    for (const p of board.projects) {
      if (!p.milestones.length) continue;
      const children: any[] = [];
      const firstStart = p.milestones[0].startDate;

      // The advance is itself a funding tranche that gates every milestone.
      if (p.advance.amount > 0) {
        children.push({
          id: `${p.id}-ADV`, name: `Advance ${money(p.advance.amount)}`, startDate: shift(firstStart, -3), duration: 3,
          manuallyScheduled: true, kind: 'tranche', funding: p.advance.status, amount: p.advance.amount,
          blocked: p.advance.blocking, gap: p.advance.blocking ? p.advance.amount - p.advance.paid : 0,
          percentDone: p.advance.blocking ? 0 : 100,
          note: p.advance.blocking ? 'Unpaid — no milestone can start' : 'Settled',
        });
      }

      for (const m of p.milestones) {
        // One tranche task per milestone, ending where the work begins, so the arrow reads
        // "this money must land before this phase starts".
        const trancheId = `${p.id}-${m.id}-pay`;
        children.push({
          id: trancheId, name: `Tranche ${m.id} · ${money(m.amount)}`, startDate: shift(m.startDate, -3), duration: 3,
          manuallyScheduled: true, kind: 'tranche', funding: m.fundingStatus, amount: m.amount,
          gap: m.fundingGap, blocked: m.blockedByFunding,
          percentDone: m.amount > 0 ? Math.round((m.funded / m.amount) * 100) : 0,
          note: m.fundingGap > 0 ? `${money(m.fundingGap)} outstanding` : 'Funded',
        });
        children.push({
          id: `${p.id}-${m.id}`, name: `${m.id} ${m.title}`, startDate: m.startDate, endDate: m.dueDate,
          manuallyScheduled: true, kind: 'work', work: m.workStatus, funding: m.fundingStatus,
          amount: m.amount, gap: m.fundingGap, blocked: m.blockedByFunding,
          percentDone: PCT[m.workStatus] ?? 0,
          note: m.blockedByFunding ? 'Blocked: milestone not funded' : m.authExpiresBeforeDue ? `Authorization lapses ${m.authorizationExpires?.slice(0, 10)}` : m.overdue ? 'Past due' : '',
        });
        // Funding → work. This is the dependency the product rule actually implies.
        dependencies.push({ id: `${trancheId}-dep`, fromTask: trancheId, toTask: `${p.id}-${m.id}` });
        if (p.advance.amount > 0) dependencies.push({ id: `${p.id}-adv-${m.id}`, fromTask: `${p.id}-ADV`, toTask: trancheId });
        // Phase → phase, as agreed in the SOW.
        for (const dep of m.dependsOn) dependencies.push({ id: `${p.id}-${dep}-${m.id}`, fromTask: `${p.id}-${dep}`, toTask: `${p.id}-${m.id}` });
      }

      tasks.push({
        id: p.id, name: `${p.title}  ·  ${p.counterpart}`, expanded: true, manuallyScheduled: true,
        kind: 'project', children,
        amount: p.milestones.reduce((s: number, m: any) => s + m.amount, 0),
      });
    }

    const gantt = new Gantt({
      appendTo: host.current,
      readOnly: true,
      project: { taskModelClass: BoardTask, tasks, dependencies } as any,
      subGridConfigs: { locked: { width: 650 } },
      columns: [
        { type: 'name', width: 270 },
        { type: 'enddate', text: 'Due', width: 100 },
        { text: 'Amount', field: 'amount', width: 90, renderer: ({ value }: any) => (value ? money(value) : '') },
        { text: 'Status', field: 'funding', width: 180, renderer: ({ record }: any) => ((record.get('kind') === 'work' ? record.get('work') : record.get('funding')) || '').replace(/_/g, ' ') },
      ] as any,
      // Colour by what the row is and whether money is blocking it.
      taskRenderer: ({ taskRecord, renderData }: any) => {
        const kind = taskRecord.get('kind');
        const classes = [`b-kind-${kind}`];
        if (taskRecord.get('blocked')) classes.push('b-blocked');
        else if (kind === 'tranche') classes.push('b-funded');
        renderData.cls = `${renderData.cls || ''} ${classes.join(' ')}`;
        const note = taskRecord.get('note');
        return note ? `${taskRecord.name} — <span class="b-note">${note}</span>` : taskRecord.name;
      },
      viewPreset: 'weekAndDayLetter',
      barMargin: 5,
      rowHeight: 34,
    } as any);
    // Without this the axis opens weeks before the first tranche and every bar sits off-screen.
    gantt.project.commitAsync().then(() => gantt.zoomToFit({ leftMargin: 30, rightMargin: 30 }));
    return () => gantt.destroy();
  }, [board]);

  return (
    <>
      <div ref={host} style={{ height: 560 }} className="overflow-hidden rounded-lg border border-slate-200" />
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-5 rounded bg-[#2a78d6]" />Work phase</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-5 rounded bg-[#1baf7a]" />Funded tranche</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-5 rounded b-legend-blocked" />Blocked on funding</span>
        <span>Arrows: a tranche must land before the phase it pays for can start.</span>
      </div>
    </>
  );
}
