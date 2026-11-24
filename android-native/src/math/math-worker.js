import { propose } from './math-geometry.mjs';
import { recognizeAutomatic } from './math-auto.mjs';
import { runMathPipeline } from './math-pipeline.mjs';

const nowMs = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

const workerState = {
  latestEpoch: -1
};

/**
 * Pure worker message handler (used by Web Worker `self.onmessage` and testable in Node.js).
 * Preserves 100% backward compatibility with V0.80 `automatic` and `propose` actions while
 * adding unified `pipeline` execution with monotonic `epoch` stale-job cancellation.
 */
export function handleWorkerMessage(data, state = workerState) {
  const payload = data || {};
  const {
    id,
    jobId = null,
    epoch,
    strokes,
    type,
    action,
    intention = 'auto',
    orientation = 'portrait',
    category = 'auto',
    interventionLevel = 'smart',
    existingObjects = [],
    profile = null,
    mlkitCandidates = [],
    symbolTokens,
    labels
  } = payload;

  try {
    if (action === 'cancel-epoch') {
      if (Number.isFinite(Number(epoch)) && Number(epoch) > state.latestEpoch) {
        state.latestEpoch = Number(epoch);
      }
      return { id, jobId, epoch: state.latestEpoch, cancelled: true, result: null, timingMs: 0 };
    }

    if (action === 'pipeline') {
      const numericEpoch = Number.isFinite(Number(epoch)) ? Number(epoch) : null;
      if (numericEpoch !== null && numericEpoch < state.latestEpoch) {
        return {
          id,
          jobId,
          epoch: numericEpoch,
          cancelled: true,
          reason: 'stale_epoch',
          result: null,
          timingMs: 0
        };
      }
      if (numericEpoch !== null && numericEpoch > state.latestEpoch) {
        state.latestEpoch = numericEpoch;
      }

      const t0 = nowMs();
      const result = runMathPipeline(strokes, {
        category,
        interventionLevel,
        intention,
        orientation,
        existingObjects,
        profile,
        mlkitCandidates,
        symbolTokens,
        labels
      });
      const timingMs = Number((nowMs() - t0).toFixed(2));
      return { id, jobId, epoch: numericEpoch, cancelled: false, result, timingMs };
    }

    // V0.80 backward-compatible actions ('automatic' and default 'propose')
    const result = action === 'automatic'
      ? recognizeAutomatic(strokes, intention, orientation)
      : propose(strokes, type);
    return { id, result };
  } catch (error) {
    return {
      id,
      ...(jobId !== null ? { jobId } : {}),
      ...(epoch !== undefined ? { epoch } : {}),
      error: error?.message || 'No se pudo analizar la figura.'
    };
  }
}

if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  self.onmessage = ({ data }) => {
    const response = handleWorkerMessage(data, workerState);
    self.postMessage(response);
  };
}
