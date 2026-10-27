import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Editor from './components/Editor';
import Home from './components/Home';
import { CURSOR } from './cursors';
import { initTheme } from './theme';
import './styles.css';

document.documentElement.style.setProperty('--cursor', CURSOR.default);
initTheme();

function App() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const f = () => setHash(location.hash);
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  const file = hash.match(/^#\/file\/(.+)$/);
  if (file) return <Editor key={file[1]} fileId={file[1]} />;
  // #/room/<id>        → view link
  // #/room/<id>/<token> → edit link
  const room = hash.match(/^#\/room\/([A-Za-z0-9]+)(?:\/([A-Za-z0-9]+))?$/);
  if (room) return <Editor key={room[0]} fileId={'room:' + room[1]} room={{ id: room[1], token: room[2] }} />;
  return <Home />;
}

createRoot(document.getElementById('root')!).render(<App />);
