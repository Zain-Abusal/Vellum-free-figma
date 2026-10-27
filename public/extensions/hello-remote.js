// Example third-party Vellum extension. Install it from Extensions → "Install from URL".
// It runs in a sandboxed iframe: every api call is async (await it).
export default {
  id: 'hello-remote',
  name: 'Hello (remote)',
  description: 'Example sandboxed extension loaded from a URL: adds a greeting card.',
  icon: '👋',
  inputs: [{ key: 'text', label: 'Greeting', type: 'text', default: 'Hello from a sandbox!' }],
  async run(api, values) {
    const c = await api.viewportCenter();
    const card = await api.create('frame', {
      name: 'Greeting',
      x: c.x - 160,
      y: c.y - 50,
      fill: '#ffffff',
      radius: 16,
      shadow: { x: 0, y: 8, blur: 24, color: '#0f172a', opacity: 0.12 },
      autoLayout: { direction: 'vertical', gap: 0, padding: 24, align: 'start' },
    });
    await api.create('text', { text: String(values.text), fontSize: 24, fontWeight: 600 }, card);
    await api.select([card]);
    return 'Greeting added';
  },
};
