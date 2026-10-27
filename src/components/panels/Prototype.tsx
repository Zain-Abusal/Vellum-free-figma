/** Prototype tab: interactions and presentation. */
import { useStore } from '../../store';
import { setProps, startPresent, topFrames } from '../../actions';
import type { Transition } from '../../types';
import { Icons } from '../icons';
import { Section } from './controls';

export function Prototype() {
  const doc = useStore((s) => s.doc);
  const pageId = useStore((s) => s.pageId);
  const selection = useStore((s) => s.selection);
  const n = selection.length === 1 ? doc.nodes[selection[0]] : null;
  const frames = topFrames(doc, pageId);
  return (
    <>
      <Section title="Interactions">
        {!n ? (
          <p className="muted">Select a layer to add a click interaction.</p>
        ) : (
          <>
            <p className="muted">On click</p>
            <select className="wide" value={n.linkAction ?? 'navigate'} onChange={(e) => setProps([n.id], { linkAction: e.target.value as 'navigate' | 'overlay' })}>
              <option value="navigate">Navigate to</option>
              <option value="overlay">Open overlay</option>
            </select>
            <select className="wide" value={n.link ?? ''} onChange={(e) => setProps([n.id], { link: e.target.value || null })}>
              <option value="">None</option>
              <option value="__back">← Back</option>
              {frames
                .filter((f) => f.id !== n.id)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
            </select>
            {n.link && (
              <>
                <p className="muted">Animation</p>
                <select className="wide" value={n.linkTransition ?? 'dissolve'} onChange={(e) => setProps([n.id], { linkTransition: e.target.value as Transition })}>
                  <option value="instant">Instant</option>
                  <option value="dissolve">Dissolve</option>
                  <option value="smart">Smart animate (matching layer names)</option>
                  <option value="slide-left">Slide in from right</option>
                  <option value="slide-right">Slide in from left</option>
                  <option value="slide-up">Slide up</option>
                  <option value="slide-down">Slide down</option>
                </select>
              </>
            )}
          </>
        )}
      </Section>
      <Section title="Presentation">
        <button className="btn primary wide" onClick={startPresent}>
          <Icons.play /> Present
        </button>
        <p className="muted">Click linked layers to navigate. Clicking elsewhere flashes the hotspots. ← → switch frames, Backspace goes back, Esc exits.</p>
      </Section>
    </>
  );
}
