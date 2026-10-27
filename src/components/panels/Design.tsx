/** Design tab: properties of the current selection. */
import { useStore } from '../../store';
import { align, applyTextStyle, createTextStyle, FRAME_PRESETS, insertFramePreset, useAsMask, autoLayoutSelection, booleanOp, createComponent, detachInstance, distribute, flattenSelection, goToMainComponent, insertInstance, setProps, type AlignKind, combineAsVariants } from '../../actions';
import { getPage, isFrameLike, moveDeep, setSize } from '../../doc';
import { shapePoints } from '../../geometry';
import type { AutoLayout, HConstraint, SceneNode, VConstraint } from '../../types';
import { Icons } from '../icons';
import { AddBtn, BLENDS, ColorField, FONTS, Num, RemoveBtn, Section, ShadowEditor, StylePicker, WEIGHTS } from './controls';
import { ExportSection } from './ExportSection';
import { FillSection } from './FillSection';
import { ImageSection } from './ImageSection';
import { FrameModes, VarBinding } from './VariablesUI';
import { FramePresets } from './FramePresets';
import { InstanceProps } from './InstanceProps';

export function PageDesign() {
  const page = useStore((s) => getPage(s.doc, s.pageId));
  return (
    <>
      <Section title="Page">
        <ColorField
          value={page.bg}
          onChange={(c, live) =>
            useStore.getState().update((d) => {
              getPage(d, page.id).bg = c;
            }, !live)
          }
        />
      </Section>
      <ExportSection ids={page.children} name={page.name} />
    </>
  );
}

export const ALIGNS: [AlignKind, () => JSX.Element, string][] = [
  ['left', Icons.alignLeft, 'Align left (⌥A)'],
  ['hcenter', Icons.alignHCenter, 'Align horizontal centers (⌥H)'],
  ['right', Icons.alignRight, 'Align right (⌥D)'],
  ['top', Icons.alignTop, 'Align top (⌥W)'],
  ['vcenter', Icons.alignVCenter, 'Align vertical centers (⌥V)'],
  ['bottom', Icons.alignBottom, 'Align bottom (⌥S)'],
];

export function Design() {
  const doc = useStore((s) => s.doc);
  const selection = useStore((s) => s.selection);
  const readOnly = useStore((s) => s.readOnly);
  const nodes = selection.map((id) => doc.nodes[id]).filter(Boolean);
  const tool = useStore((s) => s.tool);
  if (!nodes.length) return tool === 'frame' ? <FramePresets /> : <PageDesign />;

  const n = nodes[0];
  const ids = nodes.map((m) => m.id);
  const single = nodes.length === 1;
  const num = (k: keyof SceneNode): number | null => {
    const v = n[k];
    return typeof v === 'number' && nodes.every((m) => m[k] === v) ? v : null;
  };
  const set = (patch: Partial<SceneNode>, live = false) => setProps(ids, patch, !live);
  const update = useStore.getState().update;
  const allType = (...t: SceneNode['type'][]) => nodes.every((m) => t.includes(m.type));
  const hasFill = !allType('group', 'instance', 'image');
  const hasRadius = allType('rect', 'frame', 'component', 'image');
  const al = single && isFrameLike(n) ? n.autoLayout : undefined;
  const setAL = (p: Partial<AutoLayout>, live = false) => set({ autoLayout: { ...al!, ...p } }, live);
  const master = n.type === 'instance' ? doc.nodes[n.componentId ?? ''] : null;
  const parent = n.parentId ? doc.nodes[n.parentId] : null;
  const showConstraints = single && parent && isFrameLike(parent) && !parent.autoLayout;
  const con = n.constraints ?? { h: 'left', v: 'top' };
  const isShape = single && n.type === 'path' && !!n.polySides;
  const hz = al?.direction === 'horizontal';
  const hugW = !!al && (hz ? al.hugMain !== false : al.hugCross !== false);
  const hugH = !!al && (hz ? al.hugCross !== false : al.hugMain !== false);
  const setHug = (axis: 'w' | 'h', hug: boolean) => setAL((axis === 'w') === hz ? { hugMain: hug } : { hugCross: hug });
  const inAL = !!parent?.autoLayout;

  return (
    <fieldset className="design" disabled={readOnly}>
      <div className="section header-section">
        <span className={`type-badge${n.type === 'component' || n.type === 'instance' ? ' comp' : ''}`}>{single ? (n.section ? 'Section' : n.type === 'rect' ? 'Rectangle' : n.type === 'path' ? 'Vector' : n.type[0].toUpperCase() + n.type.slice(1)) : `${nodes.length} layers`}</span>
        {single && n.type === 'instance' && (
          <div className="stack">
            <p className="muted">Instance of {master?.name ?? 'missing component'}</p>
            <div className="row">
              {master && (
                <button className="btn" onClick={() => goToMainComponent(n.id)}>
                  Go to main
                </button>
              )}
              <button className="btn" onClick={detachInstance}>
                Detach
              </button>
            </div>
          </div>
        )}
        {single && n.type === 'component' && (
          <button className="btn wide" onClick={() => insertInstance(n.id)}>
            ❖ Insert instance
          </button>
        )}
        {single && (n.type === 'frame' || n.type === 'group') && (
          <button className="btn wide" onClick={createComponent}>
            Create component
          </button>
        )}
        {nodes.length > 1 && nodes.every((m) => m.type === 'component') && (
          <button className="btn wide" onClick={combineAsVariants}>
            ❖ Combine as variants
          </button>
        )}
        {single && n.componentSet && <p className="muted">Component set: name variants like “Size=Small, State=Hover”. Instances get a dropdown per property.</p>}
        {single && n.booleanOp && (
          <div className="seg wide-seg" title="Boolean operation (live)">
            {(['union', 'subtract', 'intersect', 'exclude'] as const).map((op) => (
              <button key={op} className={n.booleanOp === op ? 'on' : ''} onClick={() => booleanOp(op)}>
                {op[0].toUpperCase() + op.slice(1)}
              </button>
            ))}
          </div>
        )}
        {nodes.length > 1 && (
          <div className="bool-row">
            {(['union', 'subtract', 'intersect', 'exclude'] as const).map((op) => (
              <button key={op} className="btn small" onClick={() => booleanOp(op)} title={`${op[0].toUpperCase() + op.slice(1)} selection`}>
                {op[0].toUpperCase() + op.slice(1)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="section align-row">
        {ALIGNS.map(([k, Icon, t]) => (
          <button key={k} className="icon-btn" title={t} onClick={() => align(k)}>
            <Icon />
          </button>
        ))}
        {nodes.length > 2 && (
          <>
            <button className="icon-btn" title="Distribute horizontal spacing" onClick={() => distribute('h')}>
              <Icons.distH />
            </button>
            <button className="icon-btn" title="Distribute vertical spacing" onClick={() => distribute('v')}>
              <Icons.distV />
            </button>
          </>
        )}
      </div>

      <Section title={isFrameLike(n) ? 'Frame' : 'Layout'}>
        <div className="grid2">
          <Num label="X" value={num('x')} onChange={(v, live) => update((d) => ids.forEach((id) => moveDeep(d, id, v - d.nodes[id].x, 0)), !live)} />
          <Num label="Y" value={num('y')} onChange={(v, live) => update((d) => ids.forEach((id) => moveDeep(d, id, 0, v - d.nodes[id].y)), !live)} />
          <Num label="W" value={num('w')} min={0} disabled={(allType('text') && n.textAutoResize !== 'height') || hugW} title={hugW ? 'Hug contents (auto layout)' : undefined} onChange={(v, live) => update((d) => ids.forEach((id) => setSize(d, id, v, d.nodes[id].h)), !live)} />
          <Num label="H" value={num('h')} min={0} disabled={allType('text') || hugH} title={hugH ? 'Hug contents (auto layout)' : undefined} onChange={(v, live) => update((d) => ids.forEach((id) => setSize(d, id, d.nodes[id].w, v)), !live)} />
          <Num icon={<Icons.rotate />} title="Rotation" value={num('rotation')} onChange={(v, live) => set({ rotation: ((v % 360) + 360) % 360 }, live)} />
          {hasRadius && !n.radii && (
            <div className="num-with-btn">
              <Num icon={<Icons.radius />} title="Corner radius" value={num('radius')} min={0} onChange={(v, live) => set({ radius: v }, live)} />
              <button className="icon-btn" title="Independent corners" onClick={() => set({ radii: [n.radius, n.radius, n.radius, n.radius] })}>
                <Icons.corners />
              </button>
            </div>
          )}
        </div>
        {hasRadius && !n.radii && <VarBinding nodes={nodes} prop="radius" type="number" />}
        {hasRadius && n.radii && (
          <div className="corner-grid">
            {(['↖', '↗', '↘', '↙'] as const).map((lbl, i) => (
              <Num key={i} label={lbl} title={['Top left', 'Top right', 'Bottom right', 'Bottom left'][i] + ' radius'} value={n.radii![i]} min={0} onChange={(v, live) => set({ radii: n.radii!.map((r, j) => (j === i ? v : r)) as [number, number, number, number] }, live)} />
            ))}
            <button className="icon-btn on" title="Same radius on all corners" onClick={() => set({ radius: Math.max(...n.radii!), radii: null })}>
              <Icons.corners />
            </button>
          </div>
        )}
        {al && (
          <div className="grid2">
            <select value={hugW ? 'hug' : 'fixed'} onChange={(e) => setHug('w', e.target.value === 'hug')} title="Width sizing">
              <option value="hug">W: Hug</option>
              <option value="fixed">W: Fixed</option>
            </select>
            <select value={hugH ? 'hug' : 'fixed'} onChange={(e) => setHug('h', e.target.value === 'hug')} title="Height sizing">
              <option value="hug">H: Hug</option>
              <option value="fixed">H: Fixed</option>
            </select>
          </div>
        )}
        {single && isFrameLike(n) && !n.section && (
          <select
            className="wide"
            value=""
            onChange={(e) => {
              const [name, w, h] = e.target.value.split('|');
              if (name) insertFramePreset(name, +w, +h);
            }}
          >
            <option value="">Resize to preset…</option>
            {FRAME_PRESETS.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.items.map(([name, w, h]) => (
                  <option key={name} value={`${name}|${w}|${h}`}>
                    {name} ({w}×{h})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
        {single && isFrameLike(n) && (
          <label className="check-row">
            <input type="checkbox" checked={!!n.clip} onChange={(e) => set({ clip: e.target.checked })} /> Clip content
          </label>
        )}
      </Section>

      {isShape && (
        <Section title={n.starRatio ? 'Star' : 'Polygon'}>
          <div className="grid2">
            <Num label="Count" value={n.polySides!} min={3} max={60} onChange={(v, live) => set({ polySides: Math.round(v), points: shapePoints(Math.round(v), n.starRatio) }, live)} />
            {n.starRatio !== undefined && <Num label="Ratio" value={Math.round(n.starRatio * 100)} min={5} max={100} onChange={(v, live) => set({ starRatio: v / 100, points: shapePoints(n.polySides!, v / 100) }, live)} />}
          </div>
        </Section>
      )}

      {showConstraints && (
        <Section title="Constraints">
          <div className="grid2">
            <select value={con.h} onChange={(e) => set({ constraints: { ...con, h: e.target.value as HConstraint } })}>
              <option value="left">Left</option>
              <option value="right">Right</option>
              <option value="leftright">Left & right</option>
              <option value="center">Center</option>
              <option value="scale">Scale</option>
            </select>
            <select value={con.v} onChange={(e) => set({ constraints: { ...con, v: e.target.value as VConstraint } })}>
              <option value="top">Top</option>
              <option value="bottom">Bottom</option>
              <option value="topbottom">Top & bottom</option>
              <option value="center">Center</option>
              <option value="scale">Scale</option>
            </select>
          </div>
        </Section>
      )}

      {single && isFrameLike(n) && (
        <Section title="Auto layout" action={al ? <RemoveBtn title="Remove auto layout" onClick={() => set({ autoLayout: null })} /> : <AddBtn title="Add auto layout (⇧A)" onClick={autoLayoutSelection} />}>
          {al && (
            <>
              <div className="row">
                <div className="seg">
                  <button className={al.direction === 'vertical' ? 'on' : ''} title="Vertical" onClick={() => setAL({ direction: 'vertical' })}>
                    <Icons.arrowDown />
                  </button>
                  <button className={al.direction === 'horizontal' ? 'on' : ''} title="Horizontal" onClick={() => setAL({ direction: 'horizontal' })}>
                    <Icons.arrowRight />
                  </button>
                </div>
                <select value={al.align} onChange={(e) => setAL({ align: e.target.value as AutoLayout['align'] })}>
                  <option value="start">Align start</option>
                  <option value="center">Align center</option>
                  <option value="end">Align end</option>
                </select>
              </div>
              <select className="wide" value={al.justify ?? 'start'} onChange={(e) => setAL({ justify: e.target.value as AutoLayout['justify'], ...(e.target.value !== 'start' ? { hugMain: false } : {}) })} title="Distribution along the main axis">
                <option value="start">Packed: start</option>
                <option value="center">Packed: center</option>
                <option value="end">Packed: end</option>
                <option value="between">Space between</option>
              </select>
              <div className="grid2">
                <Num label="Gap" value={al.gap} min={0} onChange={(v, live) => setAL({ gap: v }, live)} />
                <Num label="Pad" value={al.padding} min={0} onChange={(v, live) => setAL({ padding: v }, live)} />
              </div>
              <VarBinding nodes={nodes} prop="gap" type="number" />
            </>
          )}
        </Section>
      )}

      {inAL && (
        <Section title="Auto layout child">
          <label className="check-row">
            <input type="checkbox" checked={!!n.layoutFill} onChange={(e) => set({ layoutFill: e.target.checked })} /> Fill container ({parent!.autoLayout!.direction === 'horizontal' ? 'width' : 'height'})
          </label>
          <label className="check-row">
            <input type="checkbox" checked={!!n.layoutStretch} onChange={(e) => set({ layoutStretch: e.target.checked })} /> Stretch ({parent!.autoLayout!.direction === 'horizontal' ? 'height' : 'width'})
          </label>
          {n.layoutFill && parent!.autoLayout!.hugMain !== false && <p className="muted">Set the parent to a fixed size for “fill” to take effect.</p>}
        </Section>
      )}

      {single && n.type === 'instance' && master && <InstanceProps n={n} master={master} />}

      {single && isFrameLike(n) && (
        <Section
          title="Layout grid"
          action={
            n.layoutGrid ? (
              <RemoveBtn title="Remove layout grid" onClick={() => set({ layoutGrid: null })} />
            ) : (
              <AddBtn title="Add layout grid" onClick={() => set({ layoutGrid: { type: 'columns', count: 12, size: 8, gutter: 20, margin: 24, color: '#ff4d6d', visible: true } })} />
            )
          }
        >
          {n.layoutGrid && (
            <>
              <div className="row">
                <select value={n.layoutGrid.type} onChange={(e) => set({ layoutGrid: { ...n.layoutGrid!, type: e.target.value as 'columns' } })}>
                  <option value="columns">Columns</option>
                  <option value="rows">Rows</option>
                  <option value="grid">Grid</option>
                </select>
                <button className={`icon-btn${n.layoutGrid.visible ? '' : ' on'}`} title="Show / hide (⌃⇧4 toggles all)" onClick={() => set({ layoutGrid: { ...n.layoutGrid!, visible: !n.layoutGrid!.visible } })}>
                  {n.layoutGrid.visible ? <Icons.eye /> : <Icons.eyeOff />}
                </button>
              </div>
              <div className="grid2">
                {n.layoutGrid.type === 'grid' ? (
                  <Num label="Size" value={n.layoutGrid.size} min={1} onChange={(v, live) => set({ layoutGrid: { ...n.layoutGrid!, size: v } }, live)} />
                ) : (
                  <>
                    <Num label="Count" value={n.layoutGrid.count} min={1} max={48} onChange={(v, live) => set({ layoutGrid: { ...n.layoutGrid!, count: Math.round(v) } }, live)} />
                    <Num label="Gutter" value={n.layoutGrid.gutter} min={0} onChange={(v, live) => set({ layoutGrid: { ...n.layoutGrid!, gutter: v } }, live)} />
                    <Num label="Margin" value={n.layoutGrid.margin} min={0} onChange={(v, live) => set({ layoutGrid: { ...n.layoutGrid!, margin: v } }, live)} />
                  </>
                )}
              </div>
              <ColorField value={n.layoutGrid.color} onChange={(c, live) => set({ layoutGrid: { ...n.layoutGrid!, color: c } }, live)} />
            </>
          )}
        </Section>
      )}

      <Section title="Layer">
        <div className="grid2">
          <select value={n.blendMode ?? 'normal'} onChange={(e) => set({ blendMode: e.target.value })} title="Blend mode">
            {BLENDS.map((b) => (
              <option key={b} value={b}>
                {b === 'normal' ? 'Pass through' : b.replace('-', ' ')}
              </option>
            ))}
          </select>
          <Num label="%" title="Opacity" value={num('opacity') === null ? null : Math.round(n.opacity * 100)} min={0} max={100} onChange={(v, live) => set({ opacity: v / 100 }, live)} />
        </div>
        {single && isFrameLike(n) && <FrameModes n={n} />}
      </Section>

      {allType('text') && (
        <Section
          title="Text"
          action={
            <div className="seg mini">
              <button className={(n.textAutoResize ?? 'width') === 'width' ? 'on' : ''} title="Auto width" onClick={() => set({ textAutoResize: 'width' })}>
                <Icons.textWidth />
              </button>
              <button className={n.textAutoResize === 'height' ? 'on' : ''} title="Auto height (fixed width, wraps)" onClick={() => set({ textAutoResize: 'height' })}>
                <Icons.textHeight />
              </button>
            </div>
          }
        >
          <StylePicker
            kind="texts"
            current={single ? n.textStyleId : undefined}
            onApply={(id) => applyTextStyle(ids, id)}
            onCreate={() => {
              const name = prompt('Text style name', `${n.fontSize}/${Math.round((n.lineHeight ?? 1.2) * 100)} ${n.fontFamily}`);
              if (name) createTextStyle(name, n.id);
            }}
            onDetach={() => set({ textStyleId: undefined })}
          />
          <select className="wide" value={n.fontFamily} onChange={(e) => set({ fontFamily: e.target.value, textStyleId: undefined })}>
            {FONTS.map((f) => (
              <option key={f} value={f} style={{ fontFamily: f }}>
                {f}
              </option>
            ))}
          </select>
          <div className="grid2">
            <select value={n.fontWeight} onChange={(e) => set({ fontWeight: +e.target.value, textStyleId: undefined })}>
              {WEIGHTS.map(([w, l]) => (
                <option key={w} value={w}>
                  {l}
                </option>
              ))}
            </select>
            <Num label="Size" value={num('fontSize')} min={1} onChange={(v, live) => set({ fontSize: v, textStyleId: undefined }, live)} />
            <Num label="LH" title="Line height %" value={num('lineHeight') === null ? null : Math.round((n.lineHeight ?? 1.2) * 100)} min={50} onChange={(v, live) => set({ lineHeight: v / 100, textStyleId: undefined }, live)} />
            <Num label="LS" title="Letter spacing (px)" value={n.letterSpacing ?? 0} step={0.1} onChange={(v, live) => set({ letterSpacing: v, textStyleId: undefined }, live)} />
            <div className="seg">
              {(['left', 'center', 'right'] as const).map((a) => (
                <button key={a} className={n.textAlign === a ? 'on' : ''} title={`Align ${a}`} onClick={() => set({ textAlign: a })}>
                  {a === 'left' ? <Icons.alignLeft /> : a === 'center' ? <Icons.alignHCenter /> : <Icons.alignRight />}
                </button>
              ))}
            </div>
            <div className="seg">
              {(['none', 'underline', 'line-through'] as const).map((t) => (
                <button key={t} className={(n.textDecoration ?? 'none') === t ? 'on' : ''} title={t === 'none' ? 'No decoration' : t} onClick={() => set({ textDecoration: t })} style={{ textDecoration: t }}>
                  {t === 'none' ? '—' : 'U'}
                </button>
              ))}
            </div>
          </div>
        </Section>
      )}

      {single && n.type === 'image' && <ImageSection n={n} set={set} />}

      {hasFill && <FillSection nodes={nodes} set={set} />}

      {!allType('group', 'instance') && (
        <Section title="Stroke" action={n.stroke === null ? <AddBtn title="Add stroke" onClick={() => set({ stroke: '#1e1e1e', strokeWidth: n.strokeWidth || 1 })} /> : <RemoveBtn title="Remove stroke" onClick={() => set({ stroke: null, arrowEnd: false })} />}>
          {n.stroke !== null && (
            <>
              <ColorField value={n.stroke} onChange={(c, live) => set({ stroke: c }, live)} />
              <VarBinding nodes={nodes} prop="stroke" type="color" />
              <div className="grid2">
                <Num label="W" title="Stroke width" value={num('strokeWidth')} min={0} step={0.5} onChange={(v, live) => set({ strokeWidth: v }, live)} />
                <Num label="Dash" title="Dash length (0 = solid)" value={n.strokeDash ?? 0} min={0} onChange={(v, live) => set({ strokeDash: v }, live)} />
                {n.type === 'path' && !n.closed && (
                  <label className="check-row">
                    <input type="checkbox" checked={!!n.arrowEnd} onChange={(e) => set({ arrowEnd: e.target.checked })} /> Arrow
                  </label>
                )}
              </div>
            </>
          )}
        </Section>
      )}

      <Section title="Effects">
        <div className="effect-row">
          <span>Drop shadow</span>
          {n.shadow ? <RemoveBtn title="Remove shadow" onClick={() => set({ shadow: null })} /> : <AddBtn title="Add drop shadow" onClick={() => set({ shadow: { x: 0, y: 4, blur: 12, color: '#000000', opacity: 0.25 } })} />}
        </div>
        {n.shadow && <ShadowEditor value={n.shadow} onChange={(v, live) => set({ shadow: v }, live)} />}
        <div className="effect-row">
          <span>Inner shadow</span>
          {n.innerShadow ? <RemoveBtn title="Remove inner shadow" onClick={() => set({ innerShadow: null })} /> : <AddBtn title="Add inner shadow" onClick={() => set({ innerShadow: { x: 0, y: 2, blur: 6, color: '#000000', opacity: 0.25 } })} />}
        </div>
        {n.innerShadow && <ShadowEditor value={n.innerShadow} onChange={(v, live) => set({ innerShadow: v }, live)} />}
        <div className="effect-row">
          <span>Layer blur</span>
          {n.blur ? <RemoveBtn title="Remove blur" onClick={() => set({ blur: 0 })} /> : <AddBtn title="Add layer blur" onClick={() => set({ blur: 4 })} />}
        </div>
        {!!n.blur && (
          <div className="grid2">
            <Num label="Blur" value={n.blur} min={0} onChange={(v, live) => set({ blur: v }, live)} />
          </div>
        )}
      </Section>

      {single && n.type === 'path' && (
        <div className="section">
          <button className="btn wide" onClick={() => useStore.getState().set({ vectorEditId: n.id })}>
            Edit points (Enter)
          </button>
        </div>
      )}
      {single && (n.type === 'rect' || n.type === 'ellipse') && (
        <div className="section">
          <button className="btn wide" onClick={flattenSelection}>
            Flatten to vector (⌘E)
          </button>
        </div>
      )}

      {nodes.length > 1 && (
        <div className="section">
          <button className="btn wide" onClick={useAsMask} title="Use as mask (⌃⌘M)">
            <Icons.mask /> Use bottom layer as mask
          </button>
        </div>
      )}
      {single && n.isMask && (
        <div className="section">
          <button className="btn wide" onClick={useAsMask}>
            <Icons.mask /> Release mask
          </button>
        </div>
      )}

      <ExportSection ids={ids} name={single ? n.name : `${nodes.length} layers`} nodeRows={n.exports ?? []} />
    </fieldset>
  );
}
