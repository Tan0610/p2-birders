import { toDwcCsv } from '@deccan-birders/format';
import { useState } from 'react';
import type { LoadedJournal, SightingResult } from '../journal';

/**
 * "Take these records elsewhere": the journal as a Darwin Core CSV (for GBIF, a spreadsheet,
 * a museum) or as the original JSON documents. The file is made in the browser; nothing is sent.
 */
export function TakeAway(props: { gateway: string; loaded: LoadedJournal; results: Record<string, SightingResult>; done: boolean }) {
  const { journal, journalRef } = props.loaded;
  const [packed, setPacked] = useState('');

  // Journal order (newest first), only the records that were read and validated.
  const read = journal.entries.flatMap((e) => {
    const r = props.results[e.ref];
    return r?.ok ? [{ ref: e.ref, record: r.record }] : [];
  });
  const left = journal.entries.length - read.length;
  const stem = `deccan-birders-0x${journal.owner.replace(/^0x/i, '').slice(0, 8)}-edition-${journal.sequence}`;

  const saveCsv = () => {
    const csv = toDwcCsv(read, { gateway: props.gateway, journalOwner: journal.owner });
    save(`${stem}.dwc.csv`, csv, 'text/csv;charset=utf-8');
    setPacked(`Packed ${count(read.length)} into ${stem}.dwc.csv.`);
  };
  const saveJson = () => {
    const json = JSON.stringify({ gateway: props.gateway, journalRef, journal, records: read }, null, 2);
    save(`${stem}.json`, `${json}\n`, 'application/json;charset=utf-8');
    setPacked(`Packed ${count(read.length)} into ${stem}.json.`);
  };

  return (
    <section className="takeaway" aria-labelledby="takeaway-title">
      <h2 id="takeaway-title">Take these records elsewhere</h2>
      <p>
        Pack this journal for GBIF, iNaturalist, a museum or a spreadsheet. The Darwin Core file uses the standard biodiversity column
        names; the JSON file holds the records exactly as they are stored on Swarm. Both are made here, in your browser, and sent nowhere.
      </p>
      <div className="takeaway-actions">
        <button type="button" className="button button-bright" onClick={saveCsv} disabled={!props.done || read.length === 0}>
          Download Darwin Core CSV
        </button>
        <button type="button" className="button button-quiet" onClick={saveJson} disabled={!props.done || read.length === 0}>
          Download the original JSON
        </button>
      </div>
      <p className="takeaway-note" role="status" aria-live="polite">
        {!props.done
          ? 'Still fetching sightings; the parcel is ready once every one has been read.'
          : packed ||
            `${read.length === 1 ? 'One sighting goes' : `${read.length} sightings go`} in the parcel${left ? `; ${left} that could not be read ${left === 1 ? 'is' : 'are'} left out` : ''}.`}
      </p>
    </section>
  );
}

const count = (n: number) => (n === 1 ? 'one sighting' : `${n} sightings`);

function save(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
