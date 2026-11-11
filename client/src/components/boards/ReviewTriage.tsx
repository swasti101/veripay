// Reviewer-vs-time triage board.
//
// A Bryntum *Scheduler* is the natural widget for this (one resource row per reviewer), but
// combining Scheduler and Gantt in one app requires Bryntum's "thin" bundles, which are
// licence-gated — installing @bryntum/grid-thin is refused without a licence, and loading both
// full bundles double-loads their shared Grid and breaks the second one to initialise.
// So this renders the same resource-vs-time view with the Gantt we already have on trial:
// one parent row per reviewer, one bar per assignment, spanning invitation → close of voting.
// Swap to Scheduler by installing the licensed thin packages.
import { useEffect, useRef } from 'react';
import { Gantt, TaskModel } from '@bryntum/gantt';
import '@bryntum/gantt/fontawesome/css/fontawesome.css';
import '@bryntum/gantt/fontawesome/css/solid.css';
import '@bryntum/gantt/gantt.css';
import '@bryntum/gantt/svalbard-light.css';
import './boards.css';
import { money } from '../../api';

class TriageTask extends TaskModel {
  static override get fields() {
    return [
      { name: 'kind' }, { name: 'project' }, { name: 'projectId' }, { name: 'disputed', type: 'number' },
      { name: 'fee', type: 'number' }, { name: 'evidence' }, { name: 'votes' }, { name: 'reviewStatus' },
      { name: 'assignmentStatus' }, { name: 'atRisk', type: 'boolean' }, { name: 'why' }, { name: 'expertise' },
    ];
  }
}

export default function ReviewTriage({ board }: { board: any }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.current || !board.assignments.length) return;

    const tasks = board.reviewers.map((r: any) => {
      const mine = board.assignments.filter((a: any) => a.expertId === r.id);
      const risky = mine.filter((a: any) => a.quorumAtRisk || a.stalled || a.unanswered).length;
      return {
        id: r.id, kind: 'reviewer', expanded: true, manuallyScheduled: true,
        name: `${r.name.replace(' (SIMULATED expert)', '')}${r.simulated ? ' [SIM]' : ''}`,
        expertise: r.expertise.join(', '),
        atRisk: risky > 0,
        votes: `${mine.length} assigned${risky ? ` · ${risky} at risk` : ''}`,
        children: mine.map((a: any, i: number) => {
          const start = new Date(a.startDate);
          const end = new Date(a.closesAt);
          return {
            id: `${r.id}-${i}`, kind: 'assignment', manuallyScheduled: true,
            name: `${a.milestoneId} · ${a.requirementIds.join(', ')}`,
            startDate: start, endDate: end > start ? end : new Date(start.getTime() + 36e5),
            project: a.project, projectId: a.projectId,
            disputed: a.disputedAmount, fee: a.fee, evidence: a.evidenceReady,
            votes: `${a.votesIn}/${a.quorum}`, reviewStatus: a.status, assignmentStatus: a.assignmentStatus,
            percentDone: a.assignmentStatus === 'SUBMITTED' ? 100 : a.assignmentStatus === 'ACCEPTED' ? 50 : 0,
            atRisk: a.quorumAtRisk || a.stalled || a.unanswered,
            // "A deadline with no time allocated to handle it", in our domain.
            why: a.quorumAtRisk
              ? `Closes in ${a.hoursLeft}h with ${a.votesIn}/${a.quorum} votes — short of quorum the panel is INCONCLUSIVE and ${money(a.disputedAmount)} stays frozen`
              : a.unanswered ? 'Invited but never answered'
                : a.stalled ? `Accepted but no vote, ${a.hoursLeft}h left`
                  : a.evidenceThin ? `Evidence for only ${a.evidenceReady} requirements — expect INSUFFICIENT_EVIDENCE` : '',
          };
        }),
      };
    }).filter((r: any) => r.children.length);

    const gantt = new Gantt({
      appendTo: host.current,
      readOnly: true,
      project: { taskModelClass: TriageTask, tasks } as any,
      subGridConfigs: { locked: { width: 680 } },
      columns: [
        {
          type: 'name', text: 'Reviewer / assignment', width: 250,
          renderer: ({ record, value }: any) => record.get('kind') === 'reviewer'
            ? `<div><div style="font-weight:600">${value}</div><div style="font-size:10px;color:#64748b">${record.get('expertise')}</div></div>`
            : `<div>${value}<div style="font-size:10px;color:#64748b">${record.get('project')}</div></div>`,
        },
        { text: 'Disputed', field: 'disputed', width: 95, renderer: ({ value }: any) => (value ? money(value) : '') },
        { text: 'Deadline', type: 'enddate', width: 110 },
        { text: 'Evidence', field: 'evidence', width: 85 },
        { text: 'Votes', field: 'votes', width: 130 },
      ] as any,
      taskRenderer: ({ taskRecord, renderData }: any) => {
        const kind = taskRecord.get('kind');
        const cls = [kind === 'reviewer' ? 'b-kind-project' : taskRecord.get('assignmentStatus') === 'SUBMITTED' ? 'b-state-done' : 'b-state-active'];
        if (taskRecord.get('atRisk')) cls.push('b-blocked');
        renderData.cls = `${renderData.cls || ''} ${cls.join(' ')}`;
        if (kind === 'reviewer') return taskRecord.name;
        const why = taskRecord.get('why');
        return why ? `⚠ ${taskRecord.name} — <span class="b-note">${why}</span>` : taskRecord.name;
      },
      taskTooltipFeature: {
        template: ({ taskRecord: t }: any) => t.get('kind') === 'reviewer' ? `<b>${t.name}</b><br>${t.get('expertise')}<br>${t.get('votes')}` : `
          <div style="max-width:320px">
            <b>${t.get('project')}</b><br>${t.name}<br>
            Review: ${t.get('reviewStatus')} · this reviewer: ${t.get('assignmentStatus')}<br>
            Disputed amount: ${money(t.get('disputed'))}<br>
            Evidence ready: ${t.get('evidence')} requirements<br>
            Votes in: ${t.get('votes')} (quorum)<br>
            Fixed fee: ${money(t.get('fee'))} — paid for a valid review regardless of vote<br>
            Voting closes: ${new Date(t.endDate).toLocaleString()}
            ${t.get('why') ? `<br><span style="color:#b91c1c"><b>At risk:</b> ${t.get('why')}</span>` : ''}
          </div>`,
      },
      viewPreset: 'dayAndWeek',
      barMargin: 6,
      rowHeight: 40,
    } as any);
    // Assignments span days; fit the axis to them so the deadline is readable.
    gantt.project.commitAsync().then(() => gantt.zoomToFit({ leftMargin: 30, rightMargin: 30 }));

    gantt.on('taskClick', ({ taskRecord }: any) => {
      const pid = taskRecord.get('projectId');
      if (pid) window.location.assign(`/projects/${pid}/experts`);
    });

    return () => gantt.destroy();
  }, [board]);

  const risky = board.assignments.filter((a: any) => a.quorumAtRisk || a.stalled || a.unanswered);
  return (
    <>
      <div ref={host} style={{ height: 420 }} className="overflow-hidden rounded-lg border border-slate-200" />
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-5 rounded bg-[#2a78d6]" />Voting open</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-5 rounded bg-[#1baf7a]" />Vote submitted</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-5 rounded b-legend-blocked" />Deadline with no progress</span>
        <span>Click a bar to open that project's expert review.</span>
      </div>
      {risky.length > 0 && (
        <p className="mt-2 text-xs text-rose-700">
          {risky.length} assignment(s) have a deadline but no progress — these are what strand money as INCONCLUSIVE.
        </p>
      )}
    </>
  );
}
