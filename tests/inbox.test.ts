import { describe, expect, it } from 'vitest';
import { activeInboxNotes, type InboxNote } from '../src/core/inbox';

const note = (over: Partial<InboxNote> = {}): InboxNote => ({
  id: 'n1',
  text: 'x',
  createdAt: 0,
  updatedAt: 0,
  convertedTo: null,
  ...over,
});

describe('activeInboxNotes', () => {
  it('dönüştürülmüş notları hariç tutar', () => {
    const notes = [note({ id: 'a' }), note({ id: 'b', convertedTo: { kind: 'agenda', id: 'x', targetUpdatedAtSnapshot: 0 } })];
    expect(activeInboxNotes(notes).map((n) => n.id)).toEqual(['a']);
  });

  it('en yeni önce sıralar', () => {
    const notes = [note({ id: 'old', createdAt: 1 }), note({ id: 'new', createdAt: 2 })];
    expect(activeInboxNotes(notes).map((n) => n.id)).toEqual(['new', 'old']);
  });
});
