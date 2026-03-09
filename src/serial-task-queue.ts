export class SerialTaskQueue {
  private tail: Promise<void> = Promise.resolve();

  private depth = 0;

  get pendingCount(): number {
    return this.depth;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });

    this.depth += 1;
    this.tail = previous.then(() => next, () => next);

    await previous;
    try {
      return await task();
    } finally {
      this.depth -= 1;
      release();
    }
  }
}
