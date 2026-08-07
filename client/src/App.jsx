import { useState } from 'react';
import * as Colyseus from "@colyseus/sdk";

// Configurazione automatica dell'endpoint:
// Se siamo su localhost usa il server locale, altrimenti punta a Render (wss://)
const SERVER_URL = window.location.hostname === 'localhost' 
  ? "ws://localhost:2567" 
  : "wss://london-madness.onrender.com";

export default function App() {
  const [view, setView] = useState('menu'); // 'menu', 'setup', 'game'
  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState({});
  const [tiles, setTiles] = useState({});
  const [interactions, setInteractions] = useState({});
  const [gameMessage, setGameMessage] = useState("");
  const [gameWon, setGameWon] = useState(false);
  
  // Parametri di creazione
  const [difficulty, setDifficulty] = useState(1);
  const [maxPlayers, setMaxPlayers] = useState(4);
  
  const [clientId, setClientId] = useState("");
  const [roomIdInput, setRoomIdInput] = useState("");
  const [activePlayerId, setActivePlayerId] = useState("");
  const [currentPhase, setCurrentPhase] = useState("investigators");

  // Telecamera Pan & Zoom
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Crea la stanza con Difficoltà e Max Giocatori
  const handleCreateGame = async () => {
    try {
      const client = new Colyseus.Client(SERVER_URL);
      const r = await client.create("madness", { difficulty, maxPlayers });
      setupRoom(r);
    } catch (e) {
      console.error("Errore nella creazione:", e);
      alert("Impossibile creare la stanza.");
    }
  };

  // Unisciti tramite ID Stanza
  const handleJoinGame = async () => {
    if (!roomIdInput.trim()) return;
    try {
      const client = new Colyseus.Client(SERVER_URL);
      const r = await client.joinById(roomIdInput.trim());
      setupRoom(r);
    } catch (e) {
      alert("ID Stanza non valido o stanza piena.");
    }
  };

  const setupRoom = (r) => {
    setRoom(r);
    setClientId(r.sessionId);
    setView('game');

    r.onStateChange((state) => {
      const newPlayers = {};
      state.players.forEach((p, key) => {
        newPlayers[key] = { 
          x: p.x, 
          y: p.y, 
          id: p.id, 
          hasKey: p.hasKey, 
          actionsLeft: p.actionsLeft 
        };
      });
      setPlayers(newPlayers);

      const newTiles = {};
      state.tiles.forEach((t, key) => {
        newTiles[key] = { id: t.id, name: t.name, x: t.x, y: t.y };
      });
      setTiles(newTiles);

      const newInteractions = {};
      state.interactions.forEach((item, key) => {
        newInteractions[key] = { id: item.id, type: item.type, x: item.x, y: item.y, state: item.state };
      });
      setInteractions(newInteractions);

      setGameMessage(state.gameMessage);
      setGameWon(state.gameWon);
      setActivePlayerId(state.activePlayerId);
      setCurrentPhase(state.currentPhase);
    });
  };

  // Pan & Zoom handlers
  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - camera.x, y: e.clientY - camera.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setCamera(prev => ({
      ...prev,
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    }));
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e) => {
    e.preventDefault();
    const zoomIntensity = 0.1;
    setCamera(prev => {
      let newZoom = prev.zoom - Math.sign(e.deltaY) * zoomIntensity;
      if (newZoom < 0.5) newZoom = 0.5;
      if (newZoom > 2) newZoom = 2;
      return { ...prev, zoom: newZoom };
    });
  };

  // --- MENU PRINCIPALE ---
  if (view === 'menu') {
    return (
      <div style={{ background: '#121212', color: '#fff', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
        <h1 style={{ color: '#e74c3c', marginBottom: '5px' }}>Le Case della Follia</h1>
        <p style={{ color: '#888', marginBottom: '35px' }}>App Companion</p>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '320px', background: '#1a1a1a', padding: '30px', borderRadius: '8px', border: '1px solid #333' }}>
          
          <button 
            onClick={() => setView('setup')} 
            style={{ padding: '12px', background: '#c0392b', color: '#fff', border: 'none', borderRadius: '5px', fontSize: '15px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Crea Nuova Partita
          </button>

          <div style={{ borderTop: '1px solid #333', margin: '5px 0' }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '13px', color: '#aaa' }}>Unisciti con ID Stanza:</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input 
                type="text" 
                placeholder="Inserisci ID Stanza" 
                value={roomIdInput} 
                onChange={(e) => setRoomIdInput(e.target.value)} 
                style={{ padding: '10px', background: '#111', color: '#fff', border: '1px solid #444', borderRadius: '5px', flex: 1 }} 
              />
              <button 
                onClick={handleJoinGame} 
                style={{ padding: '10px 14px', background: '#2980b9', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Entra
              </button>
            </div>
          </div>

        </div>
      </div>
    );
  }

  // --- SCHERMATA CONFIGURAZIONE PARTITA ---
  if (view === 'setup') {
    return (
      <div style={{ background: '#121212', color: '#fff', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
        <h1 style={{ color: '#e74c3c', marginBottom: '15px' }}>Configurazione Indagine</h1>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '340px', background: '#1a1a1a', padding: '30px', borderRadius: '8px', border: '1px solid #333' }}>
          
          {/* Difficoltà */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '13px', color: '#aaa' }}>Difficoltà (1-5): <strong>{difficulty}</strong></label>
            <input 
              type="range" min="1" max="5" value={difficulty} 
              onChange={(e) => setDifficulty(parseInt(e.target.value))}
              style={{ accentColor: '#e74c3c', cursor: 'pointer' }}
            />
          </div>

          {/* Max Giocatori */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '13px', color: '#aaa' }}>Max Giocatori (1-5): <strong>{maxPlayers}</strong></label>
            <input 
              type="range" min="1" max="5" value={maxPlayers} 
              onChange={(e) => setMaxPlayers(parseInt(e.target.value))}
              style={{ accentColor: '#2980b9', cursor: 'pointer' }}
            />
          </div>

          <button 
            onClick={handleCreateGame} 
            style={{ padding: '12px', background: '#27ae60', color: '#fff', border: 'none', borderRadius: '5px', fontSize: '15px', cursor: 'pointer', fontWeight: 'bold', marginTop: '10px' }}
          >
            Crea e Ottieni ID
          </button>

          <button 
            onClick={() => setView('menu')} 
            style={{ padding: '8px', background: 'transparent', color: '#aaa', border: 'none', cursor: 'pointer', fontSize: '13px' }}
          >
            ← Indietro
          </button>

        </div>
      </div>
    );
  }

  // --- SCHERMATA DI GIOCO ---
  const currentPlayer = players[clientId] || {};
  const isMyTurn = activePlayerId === clientId && currentPhase === "investigators";

  return (
    <div style={{ background: '#121212', color: '#fff', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', overflow: 'hidden' }}>
      
      {/* Barra superiore informazioni */}
      <div style={{ marginBottom: '10px', display: 'flex', gap: '20px', alignItems: 'center', fontSize: '14px', background: '#1a1a1a', padding: '8px 15px', borderRadius: '6px', border: '1px solid #333' }}>
        <div>Stanza ID: <code style={{ color: '#f1c40f', background: '#222', padding: '2px 6px', borderRadius: '4px', userSelect: 'all' }}>{room?.roomId}</code></div>
        <div>Diff: {difficulty} | Max: {maxPlayers}</div>
        <div style={{ color: isMyTurn ? '#2ecc71' : '#e74c3c', fontWeight: 'bold' }}>
          {currentPhase === "monsters" ? "⚠️ TURNO DEI MOSTRI" : (isMyTurn ? "🟢 È IL TUO TURNO" : "⏳ TURNO ALTRUI")}
        </div>
        {isMyTurn && <div style={{ color: '#3498db' }}>Azioni rimaste: <strong>{currentPlayer.actionsLeft}</strong></div>}
        <div style={{ color: '#f1c40f' }}>{currentPlayer.hasKey ? "🔑 Chiave" : "🔒 No Chiave"}</div>
      </div>

      {gameWon && (
        <div style={{ background: '#27ae60', color: '#fff', padding: '10px 20px', borderRadius: '5px', marginBottom: '10px', fontWeight: 'bold', fontSize: '16px' }}>
          🎉 SCENARIO COMPLETATO CON SUCCESSO!
        </div>
      )}

      {/* Viewport mappa */}
      <div 
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{ 
          width: '800px', 
          height: '560px', 
          border: '2px solid #333', 
          borderRadius: '8px', 
          background: '#141414', 
          position: 'relative', 
          overflow: 'hidden',
          cursor: isDragging ? 'grabbing' : 'grab'
        }}
      >
        <div style={{
          position: 'absolute',
          top: '280px',
          left: '400px',
          transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
          transformOrigin: '0 0',
          width: '0px',
          height: '0px'
        }}>
          
          {/* Tessere */}
          {Object.entries(tiles).map(([id, tile]) => (
            <div
              key={id}
              onClick={(e) => {
                e.stopPropagation();
                if (room && isMyTurn) room.send("move_to_tile", { tileId: tile.id });
              }}
              style={{
                position: 'absolute',
                left: `${tile.x - 75}px`,
                top: `${tile.y - 75}px`,
                width: '150px',
                height: '150px',
                background: '#2c3e50',
                border: currentPlayer.currentTile === tile.id ? '3px solid #f1c40f' : '3px solid #e74c3c',
                borderRadius: '6px',
                cursor: isMyTurn ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 8px rgba(0,0,0,0.4)',
                zIndex: 1
              }}
            >
              <span style={{ fontSize: '12px', color: '#ecf0f1', fontWeight: 'bold', textAlign: 'center', padding: '4px' }}>
                {tile.name}
              </span>
            </div>
          ))}

          {/* Oggetti e Porte */}
          {Object.entries(interactions).map(([id, spot]) => (
            <div
              key={id}
              onClick={(e) => {
                e.stopPropagation();
                if (room && isMyTurn) room.send("interact", { spotId: id });
              }}
              style={{
                position: 'absolute',
                left: `${spot.x - 15}px`,
                top: `${spot.y - 15}px`,
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                background: spot.type === 'door' ? (spot.state === 'open' ? '#27ae60' : '#c0392b') : (spot.state === 'explored' ? '#7f8c8d' : '#f1c40f'),
                border: '2px solid #fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                cursor: isMyTurn ? 'pointer' : 'default',
                zIndex: 2
              }}
              title={`${spot.type} (${spot.state})`}
            >
              {spot.type === 'door' ? '🚪' : '🔍'}
            </div>
          ))}

          {/* Giocatori */}
          {Object.entries(players).map(([id, p]) => (
            <div
              key={id}
              style={{
                position: 'absolute',
                left: `${p.x - 18}px`,
                top: `${p.y - 18}px`,
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: id === clientId ? '#d35400' : '#2980b9',
                border: '2px solid #ffffff',
                boxShadow: '0 2px 6px rgba(0,0,0,0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: 'bold',
                color: '#fff',
                zIndex: 3
              }}
              title={`Giocatore ${id}`}
            >
              {id.substring(0, 2).toUpperCase()}
            </div>
          ))}

        </div>
      </div>

      {/* Pannello inferiore con Log e Passa Turno */}
      <div style={{ width: '800px', marginTop: '10px', display: 'flex', gap: '10px', alignItems: 'center' }}>
        <div style={{ flex: 1, padding: '10px 15px', background: '#1a1a1a', border: '1px solid #333', borderRadius: '5px', fontSize: '13px', color: '#ddd' }}>
          <strong>Log:</strong> {gameMessage}
        </div>
        {isMyTurn && (
          <button 
            onClick={() => room.send("end_turn")}
            style={{ padding: '12px 20px', background: '#e67e22', color: '#fff', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            Passa Turno
          </button>
        )}
      </div>

    </div>
  );
}