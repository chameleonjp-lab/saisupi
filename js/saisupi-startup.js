export class StartRequestGate {
  constructor() {
    this.generation = 0;
  }

  begin() {
    this.generation += 1;
    return this.generation;
  }

  invalidate() {
    this.generation += 1;
    return this.generation;
  }

  isCurrent(requestId) {
    return requestId === this.generation;
  }
}
