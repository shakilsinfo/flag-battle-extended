import type { EventBus } from '../events';
import type { EliminationEntry } from '../types';

/** Right-hand elimination feed; newest on top, capped at maxRows. */
export class EliminationFeed {
  private root: HTMLElement;
  private list: HTMLElement;
  private maxRows: number;

  constructor(events: EventBus, maxRows: number) {
    this.root = document.getElementById('feed')!;
    this.list = document.getElementById('feed-list')!;
    this.maxRows = maxRows;

    events.on('phaseChanged', ({ phase }) => {
      if (phase === 'battle') this.root.classList.remove('hidden');
      if (phase === 'boot' || phase === 'intro') this.clear();
    });
    events.on('eliminations', ({ entries }) => {
      // Oldest first so the newest ends up on top.
      for (let i = entries.length - 1; i >= 0; i--) {
        this.push(entries[i], entries.length);
      }
    });
  }

  private push(entry: EliminationEntry, batchSize: number): void {
    const row = document.createElement('div');
    row.className = 'feed-row';
    if (batchSize >= 5) row.classList.add('feed-row-mass');

    const img = document.createElement('img');
    img.className = 'feed-flag';
    img.src = `flags/${entry.code}.png`;
    img.alt = '';
    img.loading = 'lazy';
    img.draggable = false;

    const name = document.createElement('span');
    name.className = 'feed-name';
    name.textContent = entry.name;

    const place = document.createElement('span');
    place.className = 'feed-place';
    place.textContent = `#${entry.place}`;

    row.append(img, name, place);
    this.list.prepend(row);

    while (this.list.children.length > this.maxRows) {
      this.list.lastChild?.remove();
    }
  }

  clear(): void {
    this.list.replaceChildren();
  }
}
