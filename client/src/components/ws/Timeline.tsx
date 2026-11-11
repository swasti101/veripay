import { useEffect, useRef } from 'react';
import { Gantt, TaskModel } from '@bryntum/gantt';
import '@bryntum/gantt/fontawesome/css/fontawesome.css';
import '@bryntum/gantt/fontawesome/css/solid.css';
import '@bryntum/gantt/gantt.css';
import '@bryntum/gantt/svalbard-light.css';
import { money } from '../../api';
import { Section, Badge } from '../ui';
import type { WsProps } from '../../pages/Workspace';

class VeriPayTask extends TaskModel {
  static override get fields() {
    return [{ name: 'amount', type: 'number' }, { name: 'funding' }, { name: 'work' }, { name: 'qa' }, { name: 'owner' }, { name: 'submission' }];
  }
}

const PCT: Record<string, number> = { NOT_STARTED: 0, IN_PROGRESS: 40, REVISION_REQUESTED: 60, SUBMITTED: 75, QA_COMPLETE: 85, IN_EXPERT_REVIEW: 90, ACCEPTED: 100, CLOSED: 100 };

export default function Timeline({ v }: WsProps) {
  const host = useRef<HTMLDivElement>(null);
  const ag = v.activeAgreement || v.draftAgreement;
  useEffect(() => {
    if (!host.current || !ag) return;
    const p = v.project;
    const today = new Date().toISOString().slice(0, 10);
    const tasks = ag.milestones.map((m: any, i: number) => {
      const st = p.milestoneStates.find((s: any) => s.milestoneId === m.id);
      const qa = v.qaRuns.filter((q: any) => q.milestoneId === m.id && q.status === 'COMPLETE').at(-1);
      const sub = v.submissions.filter((s: any) => s.milestoneId === m.id).at(-1);
      const start = m.startDate || ag.milestones[i - 1]?.dueDate || today;
      const end = m.dueDate || start;
      const reqs = ag.requirements.filter((r: any) => r.milestoneId === m.id);
      return {
        id: m.id, name: `${m.id} ${m.title}`, startDate: start, endDate: end, manuallyScheduled: true, expanded: true,
        percentDone: PCT[st?.workStatus || 'NOT_STARTED'] ?? 0, amount: m.amount, funding: st?.fundingStatus || 'DRAFT', work: st?.workStatus || 'DRAFT',
        qa: qa?.overall || '—', owner: 'Freelancer', submission: sub ? `rev ${sub.revision}` : '—',
        children: [
          ...reqs.map((r: any) => ({ id: `${m.id}-${r.id}`, name: `${r.id} ${r.title}`, startDate: start, endDate: end, manuallyScheduled: true, percentDone: r.status === 'PASS' ? 100 : 0, qa: r.status, owner: 'Freelancer', amount: r.amount ?? undefined, funding: '', work: '', submission: '' })),
          { id: `${m.id}-pay`, name: `💳 Payment checkpoint ${m.id} (${money(m.amount)})`, startDate: end, duration: 0, manuallyScheduled: true, owner: 'Client approves', amount: m.amount, funding: st?.fundingStatus || '', work: st?.workStatus === 'ACCEPTED' ? 'RELEASED' : 'PENDING', qa: '', submission: '' },
        ],
      };
    });
    if (ag.advanceAmount > 0) tasks.unshift({ id: 'ADV', name: `💳 Advance (${money(ag.advanceAmount)})`, startDate: ag.milestones[0]?.startDate || today, duration: 0, manuallyScheduled: true, owner: 'Client funds', amount: ag.advanceAmount, funding: p.advance.status, work: '', qa: '', submission: '', percentDone: p.advance.paid >= ag.advanceAmount ? 100 : 0 } as any);
    const dependencies = ag.milestones.flatMap((m: any) => (m.dependsOn || []).map((dep: string) => ({ fromTask: dep, toTask: m.id })));
    const g = new Gantt({
      appendTo: host.current,
      readOnly: true,
      project: { taskModelClass: VeriPayTask, tasks, dependencies } as any,
      columns: [
        { type: 'name', width: 250 },
        { type: 'enddate', text: 'Due', width: 100 },
        { text: 'Responsible', field: 'owner', width: 110, hidden: true },
        { text: 'Payment', field: 'amount', width: 90, renderer: ({ value }: any) => (value ? money(value) : '') },
        { text: 'Funding', field: 'funding', width: 120 },
        { text: 'Work', field: 'work', width: 120, renderer: ({ record }: any) => [record.get('work'), record.get('submission')].filter((x: string) => x && x !== '—').join(' · ') },
        { text: 'QA / approval', field: 'qa', width: 120 },
      ] as any,
      subGridConfigs: { locked: { width: 640 } },
      viewPreset: 'weekAndDayLetter',
      barMargin: 6,
    } as any);
    return () => g.destroy();
  }, [ag?.id, v.project.updatedAt]);

  if (!ag) return <Section title="Timeline"><p className="muted">No milestones yet.</p></Section>;
  return (
    <Section title="Milestones & payment timeline" actions={<span className="flex items-center gap-2 text-xs text-slate-500">Powered by <b>Bryntum Gantt</b> (trial package) <Badge tone="blue">{v.activeAgreement ? `agreement v${v.activeAgreement.version}` : 'DRAFT'}</Badge></span>}>
      <p className="mb-2 text-xs text-slate-500">Milestones, their requirements, dependencies, funding/work/QA status and the payment checkpoint at each due date. The structure comes from the agreement both parties approved — edit it via a new agreement version.</p>
      <div ref={host} style={{ height: 520 }} className="overflow-hidden rounded-lg border border-slate-200" />
    </Section>
  );
}
