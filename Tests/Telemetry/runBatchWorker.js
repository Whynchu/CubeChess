import { parentPort, workerData } from "node:worker_threads";
import { runBatch } from "./runBatchSelfPlay.js";

runBatch(workerData)
  .then(() => parentPort?.postMessage({ ok: true, shardId: workerData?.shardId ?? 0 }))
  .catch((error) => {
    parentPort?.postMessage({ ok: false, shardId: workerData?.shardId ?? 0, error: error?.message ?? String(error) });
  });
