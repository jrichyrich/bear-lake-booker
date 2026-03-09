import { SerialTaskQueue } from '../src/serial-task-queue';

describe('SerialTaskQueue', () => {
  test('runs tasks in submission order without overlap', async () => {
    const queue = new SerialTaskQueue();
    const events: string[] = [];

    const first = queue.run(async () => {
      events.push('first-start');
      await new Promise((resolve) => setTimeout(resolve, 20));
      events.push('first-end');
      return 'first';
    });

    const second = queue.run(async () => {
      events.push('second-start');
      events.push('second-end');
      return 'second';
    });

    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
    expect(events).toEqual(['first-start', 'first-end', 'second-start', 'second-end']);
    expect(queue.pendingCount).toBe(0);
  });
});
