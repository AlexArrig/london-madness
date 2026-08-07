import { useState, useRef, useEffect } from 'react';
import * as Colyseus from "@colyseus/sdk";

const SERVER_URL = window.location.hostname === 'localhost' 
  ? "ws://localhost:2567" 
  : "wss://london-madness.onrender.com";

export default function App() {
  const [view, setView] = useState('menu');
  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState({});
  const [tiles, setTiles] = useState({});
  const [interactions, setInteractions] = useState({});
  const [gameMessage, setGameMessage] = useState("");
  const [gameWon, setGameWon] = useState(false);
  const [difficulty, setDifficulty] = useState(1);
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [clientId, setClientId] = useState("");
  const [roomIdInput, setRoomIdInput] = useState("");
  const [activePlayerId, setActivePlayerId] = useState("");
  const [currentPhase, setCurrentPhase] = useState("investigators");

  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const touchStartDist = useRef(null);
  const initialZoom = useRef(1);

  const handleCreateGame = async () => {
    try {
      const client = new Colyseus.Client(SERVER_URL);
      const r = await client.create("madness", { difficulty, maxPlayers });
      setupRoom(r);
    } catch (e) {
      alert("Impossibile creare la stanza.");
    }
  };

  const handleJoinGame = async () => {
    if (!roomIdInput.trim()) return;
    try {
      const client = new Colyseus.Client(SERVER_URL);
      const r = await client.joinById(roomIdInput.trim());
      setupRoom(r);
    } catch (e) {
      alert("ID Stanza non valido.");
    }
  };

  const setupRoom = (r) => {
    setRoom(r);
    setClientId(r.sessionId);
    setView('game');

    r.onStateChange((state) => {
      const newPlayers = {};
      state.players.forEach((p, key) => {
        newPlayers[key] = { x: p.x, y: p.y, id: p.id, hasKey: p.hasKey, actionsLeft: p.actionsLeft, currentTile: p.currentTile };
      });
      setPlayers(newPlayers);

      const newTiles = {};
      state.tiles.forEach((t, key) => {
        newTiles[key] = { id: t.id, name: t.name, x: t.x, y: t.y, width: t.width, height: t.height, explored: t.explored };
      });
      setTiles(newTiles);

      const newInteractions = {};
      state.interactions.forEach((item, key) => {
        newInteractions[key] = { id: item.id, type: item.type, x: item.x, y: item.y, state: item.state, requiredKey: item.requiredKey, tileAId: item.tileAId, tileBId: item.tileBId };
      });
      setInteractions(newInteractions);

      setGameMessage(state.gameMessage);
      setGameWon(state.gameWon);
      setActivePlayerId(state.activePlayerId);
      setCurrentPhase(state.currentPhase);
    });
  };

  // --- Gestione Input (Touch/Mouse) ---
  const handleTouchStart = (e) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({ x: e.touches[0].clientX - camera.x, y: e.touches[0].clientY - camera.y });
    } else if (e.touches.length === 2) {
      touchStartDist.current = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      initialZoom.current = camera.zoom;
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 1 && isDragging) {
      setCamera(prev => ({ ...prev, x: e.touches[0].clientX - dragStart.x, y: e.touches[0].clientY - dragStart.y }));
    } else if (e.touches.length === 2 && touchStartDist.current !== null) {
      const currentDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      setCamera(prev => ({ ...prev, zoom: Math.min(Math.max(initialZoom.current * (currentDist / touchStartDist.current), 0.4), 2.5) }));
    }
  };

  const handleMouseDown = (e) => { setIsDragging(true); setDragStart({ x: e.clientX - camera.x, y: e.clientY - camera.y }); };
  const handleMouseMove = (e) => { if (isDragging) setCamera(prev => ({ ...prev, x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })); };
  const handleWheel = (e) => setCamera(prev => ({ ...prev, zoom: Math.min(Math.max(prev.zoom - e.deltaY * 0.001, 0.4), 2.5) }));

  // --- Render ---
  if (view === 'menu') return (
    <div style={{ background: '#121212', color: '#fff', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <h1>Le Case della Follia</h1>
      <button onClick={() => setView('setup')} style={{ padding: '15px 30px', background: '#c0392b', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>Crea Partita</button>
      <div style={{ marginTop: '20px' }}>
        <input placeholder="ID Stanza" value={roomIdInput} onChange={(e) => setRoomIdInput(e.target.value)} style={{ padding: '10px' }} />
        <button onClick={handleJoinGame} style={{ padding: '10px', marginLeft: '5px' }}>Entra</button>
      </div>
    </div>
  );

  if (view === 'setup') return (
    <div style={{ background: '#121212', color: '#fff', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <h1>Configurazione</h1>
      <label>Difficoltà: {difficulty}</label>
      <input type="range" min="1" max="5" value={difficulty} onChange={(e) => setDifficulty(parseInt(e.target.value))} />
      <button onClick={handleCreateGame} style={{ marginTop: '20px', padding: '15px' }}>Crea Stanza</button>
    </div>
  );

  const currentPlayer = players[clientId] || {};
  const isMyTurn = activePlayerId === clientId && currentPhase === "investigators";

  return (
    <div style={{ background: '#121212', height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      
      {/* HUD */}
      <div style={{ padding: '10px', background: '#1a1a1a', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between' }}>
        <div>ID: {room?.roomId} | Azioni: {currentPlayer.actionsLeft || 0}</div>
        <div style={{ color: isMyTurn ? '#2ecc71' : '#e74c3c' }}>{currentPhase === "monsters" ? "⚠️ TURNO MOSTRI" : (isMyTurn ? "🟢 TUO TURNO" : "⏳ TURNO ALTRUI")}</div>
      </div>

      {/* Mappa */}
      <div 
        onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={() => setIsDragging(false)} onMouseLeave={() => setIsDragging(false)}
        onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={() => touchStartDist.current = null}
        onWheel={handleWheel}
        style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
      >
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
          transformOrigin: '0 0'
        }}>
          
          {/* Tessere */}
          {Object.entries(tiles).map(([id, tile]) => {
            if (!tile.explored && currentPlayer.currentTile !== id) return null;
            return (
              <div key={id} onClick={() => room.send("move_to_tile", { tileId: id })}
                style={{
                  position: 'absolute',
                  left: `${tile.x}px`,
                  top: `${tile.y}px`,
                  width: `${tile.width * 200}px`,
                  height: `${tile.height * 200}px`,
                  background: '#2c3e50',
                  border: currentPlayer.currentTile === id ? '3px solid #f1c40f' : '1px solid #444',
                  borderRadius: '4px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1
                }}
              >{tile.name}</div>
            );
          })}

          {/* Interazioni */}
          {Object.entries(interactions).map(([id, spot]) => {
            // Logica visibilità: mostra solo se la stanza è esplorata
            const isVisible = (tiles[spot.tileAId]?.explored) || (tiles[spot.tileBId]?.explored);
            if (!isVisible) return null;
            return (
              <div key={id} onClick={() => room.send("interact", { spotId: id })}
                style={{
                  position: 'absolute',
                  left: `${spot.x - 15}px`,
                  top: `${spot.y - 15}px`,
                  width: '30px', height: '30px', borderRadius: '50%',
                  background: spot.type === 'door' ? (spot.state === 'open' ? '#27ae60' : '#c0392b') : '#f1c40f',
                  border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2
                }}
              >{spot.type === 'door' ? '🚪' : '🔍'}</div>
            );
          })}

          {/* Giocatori */}
          {Object.entries(players).map(([id, p]) => (
            <div key={id}
              style={{
                position: 'absolute',
                left: `${p.x - 18}px`,
                top: `${p.y - 18}px`,
                width: '36px', height: '36px', borderRadius: '50%',
                background: id === clientId ? '#d35400' : '#2980b9',
                border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3,
                transition: 'left 0.4s ease-in-out, top 0.4s ease-in-out'
              }}
            >{id.substring(0, 2).toUpperCase()}</div>
          ))}

        </div>
      </div>
      
      {/* Log */}
      <div style={{ padding: '10px', background: '#000', fontSize: '12px' }}>
        Log: {gameMessage}
        {isMyTurn && <button onClick={() => room.send("end_turn")} style={{ marginLeft: '10px' }}>Passa Turno</button>}
      </div>
    </div>
  );
}