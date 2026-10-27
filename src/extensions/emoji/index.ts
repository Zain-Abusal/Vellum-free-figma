import { defineExtension } from '../types';

const EMOJI = '😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😎 🤩 🥳 🤔 🤗 🤫 😴 🤯 😱 🥶 🥵 🤠 😈 👻 👽 🤖 💩 👍 👎 👏 🙌 🙏 💪 👀 🧠 ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 ✨ ⭐ 🌟 🔥 💥 🎉 🎊 🎁 🏆 🥇 🚀 ✈️ 🚗 🏠 🌍 🌈 ☀️ 🌙 ⚡ ☁️ ❄️ 🌸 🌻 🌲 🍀 🍎 🍕 🍔 🍩 ☕ 🍺 🎵 🎧 🎮 📱 💻 ⌨️ 🖱️ 📷 💡 📌 📎 ✏️ 📝 📅 📈 📊 🔒 🔑 ⚙️ 🛠️ ✅ ❌ ⚠️ ❓ 💬 📣 🔔 💰 🛒 🎯'.split(' ');

/** Insert emoji as text layers (scale them like any text). */
export default defineExtension({
  id: 'emoji',
  name: 'Emoji',
  description: 'Search and insert emoji as text layers.',
  icon: '😀',
  inputs: [{ key: 'size', label: 'Size', type: 'number', default: 64, min: 8 }],
  picker: {
    placeholder: 'Pick an emoji',
    async search(q) {
      return EMOJI.filter((e) => !q || e.includes(q)).map((e) => ({ label: e, preview: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><text x="50%" y="55%" font-size="24" text-anchor="middle" dominant-baseline="middle">${e}</text></svg>`)}`, value: e }));
    },
  },
  run(api, v) {
    const c = api.viewportCenter();
    const size = Number(v.size) || 64;
    const id = api.create('text', { text: String(v.picked), fontSize: size, x: c.x - size / 2, y: c.y - size / 2, name: `Emoji ${v.picked}` });
    api.select([id]);
  },
});
