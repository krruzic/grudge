// Sample bank: every assets/sfx/<id>.<n>.ogg (built by tools/sfx/build.py from CC0 libraries, see
// tools/sfx/manifest.py). Ids group their variants; load() decodes them all once the AudioContext exists, and
// pick() returns a random variant that isn't the one played last.
const files = import.meta.glob("../../assets/sfx/*.ogg", { query: "?url", import: "default", eager: true }) as Record<
  string,
  string
>;

const urls = new Map<string, string[]>();
for (const [path, url] of Object.entries(files)) {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const id = name.replace(/\.\d+\.ogg$/, "");
  let list = urls.get(id);
  if (!list) urls.set(id, (list = []));
  list.push(url);
}

export class Bank {
  private bufs = new Map<string, AudioBuffer[]>();
  private last = new Map<string, number>();
  private started = false;

  /** Decodes every sample (a few at a time; beds last since they are the largest). */
  load(ctx: AudioContext): void {
    if (this.started) return;
    this.started = true;
    const jobs = [...urls.entries()].sort((a, b) => Number(a[0].startsWith("bed.")) - Number(b[0].startsWith("bed.")));
    const queue = jobs.flatMap(([id, list]) => list.map((u) => [id, u] as const));
    const next = async (): Promise<void> => {
      const job = queue.shift();
      if (!job) return;
      const [id, url] = job;
      try {
        const buf = await ctx.decodeAudioData(await (await fetch(url)).arrayBuffer());
        let l = this.bufs.get(id);
        if (!l) this.bufs.set(id, (l = []));
        l.push(buf);
      } catch {
        // A missing or undecodable file just leaves that variant out.
      }
      return next();
    };
    for (let i = 0; i < 8; i++) void next();
  }

  has(id: string): boolean {
    return !!this.bufs.get(id)?.length;
  }

  pick(id: string): AudioBuffer | null {
    const l = this.bufs.get(id);
    if (!l?.length) return null;
    if (l.length === 1) return l[0];
    let k = Math.floor(Math.random() * l.length);
    if (k === this.last.get(id)) k = (k + 1) % l.length;
    this.last.set(id, k);
    return l[k];
  }
}
