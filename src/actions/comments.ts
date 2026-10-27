/** Comment threads stored in the file. */
import { getPage, uid } from '../doc';
import type { Pt } from '../types';
import { S } from './shared';

export function addComment(at: Pt, text: string, author: string) {
  const s = S();
  const id = uid();
  s.update((d) => {
    const p = getPage(d, s.pageId);
    p.comments = [...(p.comments ?? []), { id, x: at.x, y: at.y, resolved: false, thread: [{ id: uid(), author, text, date: Date.now() }] }];
  });
  s.set({ activeComment: id, showComments: true });
}

export function replyComment(commentId: string, text: string, author: string) {
  S().update((d) => {
    for (const p of d.pages) {
      const c = p.comments?.find((x) => x.id === commentId);
      if (c) c.thread.push({ id: uid(), author, text, date: Date.now() });
    }
  });
}

export function setCommentResolved(commentId: string, resolved: boolean) {
  S().update((d) => {
    for (const p of d.pages) {
      const c = p.comments?.find((x) => x.id === commentId);
      if (c) c.resolved = resolved;
    }
  });
}

export function deleteComment(commentId: string) {
  S().update((d) => {
    for (const p of d.pages) if (p.comments) p.comments = p.comments.filter((x) => x.id !== commentId);
  });
  S().set({ activeComment: null });
}
