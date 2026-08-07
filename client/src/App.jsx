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

  if (view === 'menu') return (
    <div style={styles.screenCenter}>
      <div style={styles.card}>
        <h1 style={styles.title}>Le Case della Follia</h1>
        <p style={styles.subtitle}>Companion App</p>
        
        <button onClick={() => setView('setup')} style={styles.primaryButton}>
          Crea Nuova Partita
        </button>

        <div style={styles.divider} />

        <div style={styles.inputGroup}>
          <span style={styles.label}>Unisciti a una stanza esistente</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input 
              placeholder="Inserisci ID Stanza" 
              value={roomIdInput} 
              onChange={(e) => setRoomIdInput(e.target.value)} 
              style={styles.input} 
            />
            <button onClick={handleJoinGame} style={styles.secondaryButton}>Entra</button>
          </div>
        </div>
      </div>
    </div>
  );

  if (view === 'setup') return (
    <div style={styles.screenCenter}>
      <div style={styles.card}>
        <h1 style={styles.setupTitle}>Configurazione Indagine</h1>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
          <label style={styles.label}>Difficoltà (1-5): <strong style={{ color: '#e74c3c' }}>{difficulty}</strong></label>
          <input 
            type="range" min="1" max="5" value={difficulty} 
            onChange={(e) => setDifficulty(parseInt(e.target.value))} 
            style={styles.rangeInput}
          />
        </div>

        <button onClick={handleCreateGame} style={{ ...styles.primaryButton, background: '#27ae60', marginTop: '10px' }}>
          Avvia Indagine
        </button>
        <button onClick={() => setView('menu')} style={styles.textButton}>
          ← Torna al Menu
        </button>
      </div>
    </div>
  );

  const currentPlayer = players[clientId] || {};
  const isMyTurn = activePlayerId === clientId && currentPhase === "investigators";

  return (
    <div style={styles.gameContainer}>
      <div style={styles.hudBar}>
        <div style={styles.hudItem}>
          Stanza: <code style={styles.codeBadge}>{room?.roomId}</code>
        </div>
        <div style={{ ...styles.hudItem, color: isMyTurn ? '#2ecc71' : '#e74c3c', fontWeight: 'bold' }}>
          {currentPhase === "monsters" ? "⚠️ TURNO DEI MOSTRI" : (isMyTurn ? "🟢 TUO TURNO" : "⏳ TURNO ALTRUI")}
        </div>
        <div style={styles.hudItem}>
          Azioni: <span style={{ color: '#3498db', fontWeight: 'bold' }}>{currentPlayer.actionsLeft || 0}</span>
        </div>
        <div style={styles.hudItem}>
          Stato: <span style={{ color: currentPlayer.hasKey ? '#f1c40f' : '#95a5a6' }}>{currentPlayer.hasKey ? "🔑 Con Chiave" : "🔒 Senza Chiave"}</span>
        </div>
      </div>

      {gameWon && (
        <div style={styles.winBanner}>
          🎉 SCENARIO COMPLETATO CON SUCCESSO!
        </div>
      )}

      <div 
        onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={() => setIsDragging(false)} onMouseLeave={() => setIsDragging(false)}
        onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={() => touchStartDist.current = null}
        onWheel={handleWheel}
        style={{ ...styles.viewport, cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
          transformOrigin: '0 0'
        }}>
          
          {Object.entries(tiles).map(([id, tile]) => {
            if (!tile.explored && currentPlayer.currentTile !== id) return null;
            const isCurrent = currentPlayer.currentTile === id;
            return (
              <div key={id} onClick={(e) => { e.stopPropagation(); room.send("move_to_tile", { tileId: id }); }}
                style={{
                  position: 'absolute',
                  left: `${tile.x}px`,
                  top: `${tile.y}px`,
                  width: `${tile.width * 200}px`,
                  height: `${tile.height * 200}px`,
                  background: isCurrent ? 'linear-gradient(135deg, #243342 0%, #1a252f 100%)' : '#1e272e',
                  border: isCurrent ? '3px solid #f1c40f' : '2px solid #3d3d3d',
                  borderRadius: '8px',
                  boxShadow: '0 8px 16px rgba(0,0,0,0.5)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', 
                  zIndex: 1,
                  transition: 'background 0.2s, border 0.2s'
                }}
              >
                <span style={styles.tileText}>{tile.name}</span>
              </div>
            );
          })}

          {Object.entries(interactions).map(([id, spot]) => {
            const isVisible = (tiles[spot.tileAId]?.explored) || (tiles[spot.tileBId]?.explored);
            if (!isVisible) return null;
            return (
              <div key={id} onClick={(e) => { e.stopPropagation(); room.send("interact", { spotId: id }); }}
                style={{
                  position: 'absolute',
                  left: `${spot.x - 16}px`,
                  top: `${spot.y - 16}px`,
                  width: '32px', height: '32px', borderRadius: '50%',
                  background: spot.type === 'door' ? (spot.state === 'open' ? '#27ae60' : '#c0392b') : '#d4ac0d',
                  border: '2px solid #fff', 
                  boxShadow: '0 4px 8px rgba(0,0,0,0.4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', 
                  fontSize: '14px', zIndex: 2
                }}
                title={`${spot.type} (${spot.state})`}
              >
                {spot.type === 'door' ? '🚪' : '🔍'}
              </div>
            );
          })}

          {Object.entries(players).map(([id, p]) => (
            <div key={id}
              style={{
                position: 'absolute',
                left: `${p.x - 18}px`,
                top: `${p.y - 18}px`,
                width: '36px', height: '36px', borderRadius: '50%',
                background: id === clientId ? '#d35400' : '#2980b9',
                border: '2px solid #fff', 
                boxShadow: '0 4px 12px rgba(0,0,0,0.6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', 
                fontSize: '11px', fontWeight: 'bold', color: '#fff',
                zIndex: 3,
                transition: 'left 0.4s ease-in-out, top 0.4s ease-in-out'
              }}
              title={`Investigatore ${id}`}
            >
              {id.substring(0, 2).toUpperCase()}
            </div>
          ))}

        </div>
      </div>
      
      <div style={styles.footerBar}>
        <div style={styles.logBox}>
          <strong style={{ color: '#d4ac0d' }}>Cronaca:</strong> {gameMessage}
        </div>
        {isMyTurn && (
          <button onClick={() => room.send("end_turn")} style={styles.endTurnButton}>
            Passa Turno
          </button>
        )}
      </div>
    </div>
  );
}

const styles = {
  screenCenter: {
    background: '#0d0d0f',
    color: '#f5f5f7',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    padding: '20px',
    boxSizing: 'border-box'
  },
  card: {
    background: '#16161a',
    border: '1px solid #2a2a35',
    borderRadius: '12px',
    padding: '35px',
    width: '100%',
    maxWidth: '380px',
    boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    boxSizing: 'border-box'
  },
  title: {
    color: '#c0392b',
    fontSize: '24px',
    fontWeight: '800',
    textAlign: 'center',
    margin: '0',
    letterSpacing: '0.5px'
  },
  setupTitle: {
    color: '#f5f5f7',
    fontSize: '20px',
    fontWeight: '700',
    textAlign: 'center',
    margin: '0 0 10px 0'
  },
  subtitle: {
    color: '#8e8e93',
    fontSize: '13px',
    textAlign: 'center',
    marginTop: '-15px',
    marginBottom: '10px',
    textTransform: 'uppercase',
    letterSpacing: '2px'
  },
  primaryButton: {
    background: '#8b0000',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '14px',
    fontSize: '15px',
    fontWeight: 'bold',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(139, 0, 0, 0.4)',
    transition: 'background 0.2s'
  },
  secondaryButton: {
    background: '#2980b9',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '12px 18px',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer'
  },
  textButton: {
    background: 'transparent',
    color: '#8e8e93',
    border: 'none',
    cursor: 'pointer',
    fontSize: '13px',
    marginTop: '5px'
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  label: {
    fontSize: '13px',
    color: '#aeaeb2'
  },
  input: {
    background: '#0d0d0f',
    color: '#fff',
    border: '1px solid #3a3a3c',
    borderRadius: '8px',
    padding: '12px',
    fontSize: '14px',
    flex: 1,
    outline: 'none'
  },
  rangeInput: {
    accentColor: '#c0392b',
    cursor: 'pointer',
    width: '100%',
    height: '6px'
  },
  divider: {
    borderTop: '1px solid #2a2a35',
    margin: '5px 0'
  },
  gameContainer: {
    background: '#0a0a0c',
    color: '#f5f5f7',
    height: '100vh',
    width: '100vw',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  },
  hudBar: {
    background: '#16161a',
    borderBottom: '1px solid #2a2a35',
    padding: '12px 20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '13px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    zIndex: 10
  },
  hudItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  },
  codeBadge: {
    background: '#0d0d0f',
    color: '#f1c40f',
    padding: '2px 6px',
    borderRadius: '4px',
    border: '1px solid #2a2a35',
    fontSize: '12px'
  },
  winBanner: {
    background: '#27ae60',
    color: '#fff',
    padding: '10px',
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: '14px',
    boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.2)'
  },
  viewport: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    background: '#111115',
    touchAction: 'none'
  },
  tileText: {
    fontSize: '13px',
    color: '#d1d1d6',
    fontWeight: 'bold',
    textAlign: 'center',
    padding: '8px',
    textShadow: '0 2px 4px rgba(0,0,0,0.8)'
  },
  footerBar: {
    background: '#16161a',
    borderTop: '1px solid #2a2a35',
    padding: '12px 20px',
    display: 'flex',
    gap: '15px',
    alignItems: 'center',
    boxSizing: 'border-box',
    zIndex: 10
  },
  logBox: {
    flex: 1,
    background: '#0d0d0f',
    border: '1px solid #2a2a35',
    borderRadius: '8px',
    padding: '10px 14px',
    fontSize: '13px',
    color: '#d1d1d6',
    maxHeight: '50px',
    overflowY: 'auto'
  },
  endTurnButton: {
    background: '#d35400',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '12px 20px',
    fontWeight: 'bold',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(211, 84, 0, 0.4)',
    whiteSpace: 'nowrap'
  }
};