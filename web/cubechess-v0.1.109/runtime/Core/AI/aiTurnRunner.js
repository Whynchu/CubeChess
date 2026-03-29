export async function runAITurn({ requestMove, fallbackMove, budgetMs = 10_000 }) {
  const controller = new AbortController();
  let timeoutId;

  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      resolve({ move: fallbackMove, timedOut: true });
    }, budgetMs);
  });

  const requestPromise = Promise.resolve()
    .then(() => requestMove({ budgetMs, signal: controller.signal }))
    .then((move) => ({ move: move ?? fallbackMove, timedOut: false }))
    .catch(() => ({ move: fallbackMove, timedOut: false }));

  const result = await Promise.race([requestPromise, timeoutPromise]);
  clearTimeout(timeoutId);
  return result;
}
