/** Inspect tab: CSS, Tailwind and React code for a layer. */
import { useState } from 'react';
import { useStore } from '../../store';
import { cssFor } from '../../exporter';
import { reactFor, tailwindFor } from '../../codegen';
import { Section } from './controls';

export function Inspect() {
  const doc = useStore((s) => s.doc);
  const selection = useStore((s) => s.selection);
  const n = selection.length === 1 ? doc.nodes[selection[0]] : null;
  const [lang, setLang] = useState<'css' | 'tailwind' | 'react' | 'react-tw'>(() => (localStorage.getItem('vellum:code-lang') as 'css') ?? 'css');
  const [copied, setCopied] = useState(false);
  if (!n) return <p className="muted pad">Select one layer to inspect its code.</p>;
  const code = lang === 'css' ? cssFor(doc, n) : lang === 'tailwind' ? tailwindFor(doc, n) : reactFor(doc, n, lang === 'react-tw' ? 'tailwind' : 'style');
  const pick = (l: typeof lang) => {
    setLang(l);
    try {
      localStorage.setItem('vellum:code-lang', l);
    } catch {
      /* ignore */
    }
  };
  return (
    <>
      <div className="section">
        <div className="seg wide-seg">
          {(
            [
              ['css', 'CSS'],
              ['tailwind', 'Tailwind'],
              ['react', 'React'],
              ['react-tw', 'React + TW'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} className={lang === k ? 'on' : ''} onClick={() => pick(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <Section
        title={lang === 'css' ? 'CSS' : lang === 'tailwind' ? 'Tailwind classes' : 'React component'}
        action={
          <button
            className="btn small"
            onClick={() => {
              navigator.clipboard.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        }
      >
        <pre className="code">{code}</pre>
      </Section>
    </>
  );
}
