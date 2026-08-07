import { Room, Client } from "@colyseus/core";
import { Schema, type, MapSchema } from "@colyseus/schema";

class InteractionSpot extends Schema {
  @type("string") id: string = "";
  @type("string") type: string = ""; // "door", "search"
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("string") state: string = ""; // "closed", "open", "unsearched", "explored"
  @type("string") requiredKey: string = "";
}

class Tile extends Schema {
  @type("string") id: string = "";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("string") name: string = "";
  @type("boolean") explored: boolean = true; // <-- IMPOSTATO A TRUE PER VISUALIZZARE SUBITO TUTTO
}

class Player extends Schema {
  @type("string") id: string = "";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("string") currentTile: string = "";
  @type("boolean") hasKey: boolean = false;
  @type("number") actionsLeft: number = 2;
}

class MadnessState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Tile }) tiles = new MapSchema<Tile>();
  @type({ map: InteractionSpot }) interactions = new MapSchema<InteractionSpot>();
  @type("string") gameMessage: string = "Indagine avviata nella villa.";
  @type("boolean") gameWon: boolean = false;
  @type("number") difficulty: number = 1;
  @type("string") activePlayerId: string = "";
  @type("string") currentPhase: string = "investigators";
}

export class GameRoom extends Room<any> {
  
  onCreate(options: any) {
    this.setState(new MadnessState() as any);
    
    const max = options.maxPlayers ? parseInt(options.maxPlayers, 10) : 4;
    this.maxClients = isNaN(max) ? 4 : Math.max(1, Math.min(5, max));

    const diff = options.difficulty ? parseInt(options.difficulty, 10) : 1;
    this.state.difficulty = isNaN(diff) ? 1 : Math.max(1, Math.min(5, diff));

    this.onMessage("move_to_tile", (client, data: { tileId: string }) => {
      if (!this.isPlayerTurn(client.sessionId)) return;

      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      const currentTile = this.state.tiles.get(player.currentTile);
      const targetTile = this.state.tiles.get(data.tileId);
      
      if (!currentTile || !targetTile) return;

      if (player.actionsLeft <= 0) {
        this.state.gameMessage = "Hai esaurito le azioni in questo turno! Passa il turno.";
        return;
      }

      const dx = Math.abs(targetTile.x - currentTile.x);
      const dy = Math.abs(targetTile.y - currentTile.y);
      const isAdjacent = (dx === 200 && dy === 0) || (dx === 0 && dy === 200);

      if (!isAdjacent) {
        this.state.gameMessage = "Puoi muoverti solo verso stanze adiacenti!";
        return;
      }

      let canPass = true;
      const midX = (currentTile.x + targetTile.x) / 2;
      const midY = (currentTile.y + targetTile.y) / 2;

      this.state.interactions.forEach((spot: any) => {
        if (spot.type === "door" && spot.x === midX && spot.y === midY && spot.state !== "open") {
          canPass = false;
        }
      });

      if (!canPass) {
        this.state.gameMessage = "La porta è sbarrata! Aprila prima di avanzare.";
        return;
      }

      player.x = targetTile.x - 25;
      player.y = targetTile.y;
      player.currentTile = targetTile.id;
      player.actionsLeft -= 1;
      this.state.gameMessage = `Movimento completato. Azioni rimanenti: ${player.actionsLeft}`;

      // Configura l'area di ricerca se non è la tile iniziale o finale
      if (targetTile.id !== "tile_0" && targetTile.id !== "tile_final") {
        const searchId = `search_${targetTile.id}`;
        if (!this.state.interactions.has(searchId)) {
          const searchSpot = new InteractionSpot();
          searchSpot.id = searchId;
          searchSpot.type = "search";
          searchSpot.x = targetTile.x + 35;
          searchSpot.y = targetTile.y;
          searchSpot.state = "unsearched";
          this.state.interactions.set(searchSpot.id, searchSpot);
        }
      }

      this.checkAutoEndTurn(player);
    });

    this.onMessage("interact", (client, data: { spotId: string }) => {
      if (!this.isPlayerTurn(client.sessionId)) return;

      const player = this.state.players.get(client.sessionId);
      const spot = this.state.interactions.get(data.spotId);
      if (!player || !spot) return;

      if (player.actionsLeft <= 0) {
        this.state.gameMessage = "Hai esaurito le azioni in questo turno!";
        return;
      }

      if (spot.type === "search" && spot.state === "unsearched") {
        spot.state = "explored";
        player.hasKey = true;
        player.actionsLeft -= 1;
        this.state.gameMessage = `Hai cercato nell'oggetto e trovato una chiave! (Azioni rimaste: ${player.actionsLeft})`;
      } 
      else if (spot.type === "door" && spot.state !== "open") {
        if (spot.requiredKey && !player.hasKey) {
          this.state.gameMessage = "Questa porta richiede una chiave per essere aperta.";
          return;
        }
        spot.state = "open";
        player.actionsLeft -= 1;
        this.state.gameMessage = `Porta aperta con successo! (Azioni rimaste: ${player.actionsLeft})`;
        if (spot.id === "door_final") {
          this.state.gameWon = true;
        }
      } else {
        this.state.gameMessage = "Interazione non valida o oggetto già esplorato.";
        return;
      }

      this.checkAutoEndTurn(player);
    });

    this.onMessage("end_turn", (client) => {
      if (!this.isPlayerTurn(client.sessionId)) return;
      this.nextPlayerTurn();
    });
  }

  private isPlayerTurn(sessionId: string): boolean {
    if (this.state.currentPhase === "monsters") {
      this.state.gameMessage = "Attendi la fine del turno dei mostri!";
      return false;
    }
    if (this.state.activePlayerId !== sessionId) {
      this.state.gameMessage = "Non è il tuo turno!";
      return false;
    }
    return true;
  }

  private checkAutoEndTurn(player: Player) {
    if (player.actionsLeft <= 0) {
      this.nextPlayerTurn();
    }
  }

  private nextPlayerTurn() {
    const playerIds = Array.from(this.state.players.keys());
    const currentIndex = playerIds.indexOf(this.state.activePlayerId);

    if (currentIndex < playerIds.length - 1 && currentIndex !== -1) {
      const nextId = playerIds[currentIndex + 1];
      this.state.activePlayerId = nextId;
      const nextPlayer = this.state.players.get(nextId);
      if (nextPlayer) nextPlayer.actionsLeft = 2;
      this.state.gameMessage = `È il turno del giocatore ${(nextId as string).substring(0, 4)} (2 azioni disponibili).`;
    } else {
      this.triggerMonsterPhase();
    }
  }

  private triggerMonsterPhase() {
    this.state.currentPhase = "monsters";
    this.state.gameMessage = "⚠️ FASE DEI MOSTRI: Le creature nell'ombra si muovono...";

    setTimeout(() => {
      const playerIds = Array.from(this.state.players.keys());
      if (playerIds.length > 0) {
        this.state.activePlayerId = playerIds[0];
        const firstPlayer = this.state.players.get(playerIds[0]);
        if (firstPlayer) firstPlayer.actionsLeft = 2;
      }
      this.state.currentPhase = "investigators";
      this.state.gameMessage = "I mostri si sono acquietati. Nuovo round degli investigatori!";
    }, 2500);
  }

  onJoin(client: Client) {
    const player = new Player();
    player.id = client.sessionId;
    player.x = -25;
    player.y = 0;
    player.currentTile = "tile_0";
    player.actionsLeft = 2;
    this.state.players.set(client.sessionId, player);

    if (!this.state.activePlayerId) {
      this.state.activePlayerId = client.sessionId;
    }

    if (this.state.tiles.size === 0) {
      this.generateMansionLayout(this.state.difficulty);
    }
  }

  onLeave(client: Client) {
    const wasActive = this.state.activePlayerId === client.sessionId;
    this.state.players.delete(client.sessionId);

    if (wasActive) {
      const playerIds = Array.from(this.state.players.keys());
      if (playerIds.length > 0) {
        this.state.activePlayerId = playerIds[0];
        const p = this.state.players.get(playerIds[0]);
        if (p) p.actionsLeft = 2;
      } else {
        this.state.activePlayerId = "";
      }
    }
  }

  private generateMansionLayout(difficulty: number) {
    const TILE_SIZE = 200;
    const occupiedCoords = new Map<string, string>();

    // 1. Stanza Iniziale
    const t0 = new Tile();
    t0.id = "tile_0";
    t0.name = "Hall d'Ingresso";
    t0.x = 0; 
    t0.y = 0; 
    t0.explored = true;
    this.state.tiles.set(t0.id, t0);
    occupiedCoords.set("0,0", "tile_0");

    const roomsList = [{ id: "tile_0", x: 0, y: 0 }];
    const totalRooms = difficulty * 2 + 3; // Es: Difficoltà 1 = 5 stanze + cripta
    const directions = [
      { dx: TILE_SIZE, dy: 0 },
      { dx: -TILE_SIZE, dy: 0 },
      { dx: 0, dy: TILE_SIZE },
      { dx: 0, dy: -TILE_SIZE }
    ];

    let createdCount = 1;

    // 2. Generazione delle stanze intermedie garantita e validata
    while (createdCount < totalRooms && roomsList.length > 0) {
      const parent = roomsList[roomsList.length - 1];

      // Validazione: filtra solo direzioni che non collidono con altre stanze
      const validDirs = directions.filter(dir => {
        const nx = parent.x + dir.dx;
        const ny = parent.y + dir.dy;
        return !occupiedCoords.has(`${nx},${ny}`);
      });

      if (validDirs.length === 0) {
        roomsList.pop(); // Torna indietro se vicolo cieco
        continue;
      }

      const dir = validDirs[Math.floor(Math.random() * validDirs.length)];
      const nx = parent.x + dir.dx;
      const ny = parent.y + dir.dy;

      const tileId = `tile_${createdCount}`;
      const tile = new Tile();
      tile.id = tileId;
      tile.name = `Stanza ${createdCount}`;
      tile.x = nx;
      tile.y = ny;
      tile.explored = true; // Visibile subito per test
      this.state.tiles.set(tile.id, tile);
      occupiedCoords.set(`${nx},${ny}`, tile.id);

      // Crea la porta validata a metà strada
      const door = new InteractionSpot();
      door.id = `door_${parent.x}_${parent.y}_${nx}_${ny}`;
      door.type = "door";
      door.x = parent.x + (dir.dx / 2);
      door.y = parent.y + (dir.dy / 2);
      door.state = "open"; // Aperte per testare subito il movimento
      this.state.interactions.set(door.id, door);

      roomsList.push({ id: tileId, x: nx, y: ny });
      createdCount++;
    }

    // 3. Posizionamento Cripta Finale validata
    const lastRoom = roomsList[roomsList.length - 1] || { x: 0, y: 0 };
    let finalPlaced = false;

    for (const dir of directions) {
      const fnx = lastRoom.x + dir.dx;
      const fny = lastRoom.y + dir.dy;
      if (!occupiedCoords.has(`${fnx},${fny}`)) {
        const finalTile = new Tile();
        finalTile.id = "tile_final";
        finalTile.name = "Cripta Finale";
        finalTile.x = fnx;
        finalTile.y = fny;
        finalTile.explored = true;
        this.state.tiles.set(finalTile.id, finalTile);

        const finalDoor = new InteractionSpot();
        finalDoor.id = "door_final";
        finalDoor.type = "door";
        finalDoor.x = lastRoom.x + (dir.dx / 2);
        finalDoor.y = lastRoom.y + (dir.dy / 2);
        finalDoor.state = "closed";
        finalDoor.requiredKey = "key";
        this.state.interactions.set(finalDoor.id, finalDoor);

        finalPlaced = true;
        break;
      }
    }

    if (!finalPlaced) {
      const fallbackTile = new Tile();
      fallbackTile.id = "tile_final";
      fallbackTile.name = "Cripta Finale";
      fallbackTile.x = lastRoom.x + TILE_SIZE;
      fallbackTile.y = lastRoom.y;
      fallbackTile.explored = true;
      this.state.tiles.set(fallbackTile.id, fallbackTile);

      const fallbackDoor = new InteractionSpot();
      fallbackDoor.id = "door_final";
      fallbackDoor.type = "door";
      fallbackDoor.x = lastRoom.x + (TILE_SIZE / 2);
      fallbackDoor.y = lastRoom.y;
      fallbackDoor.state = "closed";
      fallbackDoor.requiredKey = "key";
      this.state.interactions.set(fallbackDoor.id, fallbackDoor);
    }

    console.log(`[GENERATORE] Mappa creata con ${this.state.tiles.size} tessere visibili e ${this.state.interactions.size} punti di interazione.`);
  }
}