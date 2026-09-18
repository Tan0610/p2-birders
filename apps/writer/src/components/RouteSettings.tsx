import { useEffect, useRef, useState } from 'react';
import { config } from '../config';
import type { UploadRoute } from '../swarm/routes';
import { listUsableBatches } from '../swarm/uploader.ownNode';

export function RouteSettings(props: { open: boolean; route: UploadRoute; onSave: (route: UploadRoute) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<UploadRoute['kind']>(props.route.kind);
  const [beeUrl, setBeeUrl] = useState(props.route.kind === 'own-node' ? props.route.beeUrl : config.localBeeUrl);
  const [batchId, setBatchId] = useState(props.route.kind === 'own-node' ? props.route.batchId : '');
  const [batches, setBatches] = useState<{ id: string; label: string; ttlDays: number | null }[] | null>(null);
  const [lookup, setLookup] = useState<'idle' | 'busy' | 'failed'>('idle');

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (props.open && !d.open) d.showModal();
    if (!props.open && d.open) d.close();
  }, [props.open]);

  const findBatches = async () => {
    setLookup('busy');
    try {
      const list = await listUsableBatches(beeUrl);
      setBatches(list);
      if (list[0] && !batchId) setBatchId(list[0].id);
      setLookup('idle');
    } catch {
      setBatches(null);
      setLookup('failed');
    }
  };

  const canSave = kind === 'swarm-id' || (/^https?:\/\//.test(beeUrl) && /^[0-9a-f]{64}$/i.test(batchId));

  return (
    <dialog ref={dialog} className="route-dialog" onClose={props.onClose} aria-labelledby="route-title">
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSave) return;
          props.onSave(kind === 'swarm-id' ? { kind } : { kind, beeUrl: beeUrl.replace(/\/+$/, ''), batchId: batchId.toLowerCase() });
        }}
      >
        <h2 id="route-title">Where uploads go</h2>

        <label className={`route-option ${kind === 'swarm-id' ? 'route-on' : ''}`}>
          <input type="radio" name="route" checked={kind === 'swarm-id'} onChange={() => setKind('swarm-id')} />
          <span>
            <strong>Through Swarm ID</strong>
            <span className="hint">
              Uses your Swarm ID drive if you have one. If not, the public gateway pays for the upload, free, as long as it keeps doing so.
            </span>
          </span>
        </label>

        <label className={`route-option ${kind === 'own-node' ? 'route-on' : ''}`}>
          <input type="radio" name="route" checked={kind === 'own-node'} onChange={() => setKind('own-node')} />
          <span>
            <strong>My own Bee node</strong>
            <span className="hint">
              Sightings and photos are stamped with your node's batch and pinned there. Your journal pointer is still signed by Swarm ID.
            </span>
          </span>
        </label>

        {kind === 'own-node' && (
          <div className="route-node">
            <label className="field" htmlFor="r-bee">
              <span className="label">Node address</span>
              <input id="r-bee" value={beeUrl} onChange={(e) => setBeeUrl(e.target.value)} />
            </label>
            <button type="button" className="btn btn-quiet" onClick={findBatches} disabled={lookup === 'busy'}>
              {lookup === 'busy' ? 'Asking the node…' : 'Find usable batches'}
            </button>
            {lookup === 'failed' && (
              <p className="hint" role="status">
                The node did not answer. Is Swarm Desktop running, and does the node allow this page (--cors-allowed-origins)?
              </p>
            )}
            {batches && batches.length === 0 && (
              <p className="hint" role="status">
                The node has no usable batch. Buy one in Swarm Desktop, then wait about a minute.
              </p>
            )}
            {batches && batches.length > 0 && (
              <label className="field" htmlFor="r-batch">
                <span className="label">Batch</span>
                <select id="r-batch" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label || b.id.slice(0, 10)}
                      {b.ttlDays !== null ? `, about ${b.ttlDays} days left` : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}

        <div className="route-actions">
          <button type="submit" className="btn btn-ink" disabled={!canSave}>
            Save
          </button>
          <button type="button" className="link-button" onClick={props.onClose}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}
