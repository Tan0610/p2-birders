import type { Step } from '../errors';
import type { StepState } from '../fileSighting';

export type StepView = { state: StepState; note?: string; progress?: number };
export type StepsState = Record<Step, StepView>;

export const STEP_ORDER: { step: Step; label: string }[] = [
  { step: 'check', label: 'Check you can upload' },
  { step: 'photo', label: 'Store the photo' },
  { step: 'record', label: 'Store the sighting' },
  { step: 'journal', label: 'Add it to your journal' },
  { step: 'pointer', label: 'Point your journal address at the new edition' },
];

export function initialSteps(): StepsState {
  return {
    check: { state: 'waiting' },
    photo: { state: 'waiting' },
    record: { state: 'waiting' },
    journal: { state: 'waiting' },
    pointer: { state: 'waiting' },
  };
}

const STATE_WORD: Record<StepState, string> = {
  waiting: 'waiting',
  active: 'working',
  done: 'done',
  skipped: 'skipped',
  failed: 'failed',
};

export function ProgressSteps({ steps }: { steps: StepsState }) {
  return (
    <ol className="steps" aria-label="Filing progress" aria-live="polite">
      {STEP_ORDER.map(({ step, label }) => {
        const view = steps[step];
        return (
          <li key={step} className={`step step-${view.state}`}>
            <span className="step-mark" aria-hidden="true" />
            <span className="step-text">
              {label}
              <span className="visually-hidden">: {STATE_WORD[view.state]}</span>
              {view.state === 'active' && view.progress !== undefined && (
                <span className="step-progress"> {Math.round(view.progress * 100)}%</span>
              )}
              {view.note && view.state === 'done' && <span className="step-note">{shorten(view.note)}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function shorten(note: string) {
  return /^[0-9a-f]{64}$/i.test(note) ? `${note.slice(0, 10)}…${note.slice(-6)}` : note;
}
