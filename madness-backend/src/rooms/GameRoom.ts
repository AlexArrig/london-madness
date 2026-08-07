import { Room, Client } from "@colyseus/core";
import { Schema, type, MapSchema } from "@colyseus/schema";

class InteractionSpot extends Schema {
  @type("string") id: string = "";
  @type("string") type: string = ""; // "door", "search"
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("string") state: string = ""; // "closed", "open", "unsearched", "explored"
  @type("string") requiredKey: string = "";
  @type("string") tileAId: string = ""; // ID della prima stanza collegata
  @type("string") tileBId: string = ""; // ID della seconda stanza collegata
}

class Tile extends Schema {
  @type("string") id: string = "";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") width: number = 1;
  @type("number") height: number = 1;
  @type("string") name: string = "";
  @type("boolean") explored: boolean = false;
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

      if (!this.areRoomsAdjacent(currentTile, targetTile)) {
        this.state.gameMessage = "Puoi muoverti solo verso stanze adiacenti!";
        return;
      }

      let canPass = true;
      this.state.interactions.forEach((spot: any) => {
        if (spot.type === "door" && Math.abs(spot.x - (currentTile.x + targetTile.x)/2) <= 150 && Math.abs(spot.y - (currentTile.y + targetTile.y)/2) <= 150 && spot.state !== "open") {
          canPass = false;
        }
      });

      if (!canPass) {
        this.state.gameMessage = "La porta è sbarrata! Aprila prima di avanzare.";
        return;
      }

      // Aggiorna posizione in modo naturale senza sovrapposizioni
      this.updatePlayerPosition(player, targetTile);
      player.actionsLeft -= 1;
      targetTile.explored = true;

      this.state.gameMessage = `Movimento completato. Azioni rimanenti: ${player.actionsLeft}`;

      if (targetTile.id !== "tile_0" && targetTile.id !== "tile_final") {
        const searchId = `search_${targetTile.id}`;
        if (!this.state.interactions.has(searchId)) {
          const searchSpot = new InteractionSpot();
          searchSpot.id = searchId;
          searchSpot.type = "search";
          searchSpot.x = targetTile.x + (targetTile.width * 100);
          searchSpot.y = targetTile.y + (targetTile.height * 100);
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
      else if (spot.type === "door") {
        if (spot.state !== "open") {
          if (spot.requiredKey && !player.hasKey) {
            this.state.gameMessage = "Questa porta richiede una chiave per essere aperta.";
            return;
          }
          spot.state = "open";
        }

        const targetTileId = (spot.tileAId === player.currentTile) ? spot.tileBId : spot.tileAId;
        const targetTile = this.state.tiles.get(targetTileId);

        if (!targetTile) {
          this.state.gameMessage = "Impossibile trovare la stanza collegata.";
          return;
        }

        // Posizionamento naturale e non sovrapposto nella nuova stanza
        this.updatePlayerPosition(player, targetTile);
        player.actionsLeft -= 1;
        targetTile.explored = true;

        this.state.gameMessage = `Porta aperta! Sei entrato in ${targetTile.name}. (Azioni rimaste: ${player.actionsLeft})`;

        if (spot.id === "door_final") {
          this.state.gameWon = true;
        }

        if (targetTile.id !== "tile_0" && targetTile.id !== "tile_final") {
          const searchId = `search_${targetTile.id}`;
          if (!this.state.interactions.has(searchId)) {
            const searchSpot = new InteractionSpot();
            searchSpot.id = searchId;
            searchSpot.type = "search";
            searchSpot.x = targetTile.x + (targetTile.width * 100);
            searchSpot.y = targetTile.y + (targetTile.height * 100);
            searchSpot.state = "unsearched";
            this.state.interactions.set(searchSpot.id, searchSpot);
          }
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

  // Metodo per calcolare posizioni naturali e prive di sovrapposizioni all'interno della tessera
  private updatePlayerPosition(player: Player, tile: Tile) {
    const TILE_SIZE = 200;
    const centerX = tile.x + (tile.width * TILE_SIZE) / 2;
    const centerY = tile.y + (tile.height * TILE_SIZE) / 2;

    // Conta quanti altri giocatori si trovano nella stessa tessera usando forEach
    let peerIndex = 0;
    this.state.players.forEach((p: Player) => {
      if (p.currentTile === tile.id && p.id !== player.id) {
        peerIndex++;
      }
    });
    const index = peerIndex;

    // Offset di disposizione a raggiera attorno al centro della tessera
    const naturalOffsets = [
      { x: 0, y: 0 },
      { x: -35, y: -25 },
      { x: 35, y: 25 },
      { x: -35, y: 25 },
      { x: 35, y: -25 }
    ];

    const offset = naturalOffsets[index % naturalOffsets.length];
    player.x = centerX + offset.x;
    player.y = centerY + offset.y;
    player.currentTile = tile.id;
  }

  private areRoomsAdjacent(t1: Tile, t2: Tile): boolean {
    const t1MinX = t1.x;
    const t1MaxX = t1.x + t1.width * 200;
    const t1MinY = t1.y;
    const t1MaxY = t1.y + t1.height * 200;

    const t2MinX = t2.x;
    const t2MaxX = t2.x + t2.width * 200;
    const t2MinY = t2.y;
    const t2MaxY = t2.y + t2.height * 200;

    const touchX = (t1MaxX === t2MinX || t2MaxX === t1MinX) && (Math.max(t1MinY, t2MinY) < Math.min(t1MaxY, t2MaxY));
    const touchY = (t1MaxY === t2MinY || t2MaxY === t1MinY) && (Math.max(t1MinX, t2MinX) < Math.min(t1MaxX, t2MaxX));

    return touchX || touchY;
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
    if (this.state.tiles.size === 0) {
      this.generateMansionLayout(this.state.difficulty);
    }

    const player = new Player();
    player.id = client.sessionId;
    player.currentTile = "tile_0";
    player.actionsLeft = 2;

    const t0 = this.state.tiles.get("tile_0");
    if (t0) {
      this.updatePlayerPosition(player, t0);
    } else {
      player.x = 0;
      player.y = 0;
    }

    this.state.players.set(client.sessionId, player);

    if (!this.state.activePlayerId) {
      this.state.activePlayerId = client.sessionId;
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
    const occupiedCells = new Set<string>();

    const canPlaceRoom = (x: number, y: number, w: number, h: number) => {
      for (let i = 0; i < w; i++) {
        for (let j = 0; j < h; j++) {
          const cx = x + i * TILE_SIZE;
          const cy = y + j * TILE_SIZE;
          if (occupiedCells.has(`${cx},${cy}`)) return false;
        }
      }
      return true;
    };

    const occupyRoomCells = (x: number, y: number, w: number, h: number) => {
      for (let i = 0; i < w; i++) {
        for (let j = 0; j < h; j++) {
          const cx = x + i * TILE_SIZE;
          const cy = y + j * TILE_SIZE;
          occupiedCells.add(`${cx},${cy}`);
        }
      }
    };

    // 1. Stanza Iniziale
    const t0 = new Tile();
    t0.id = "tile_0";
    t0.name = "Hall d'Ingresso";
    t0.x = 0; 
    t0.y = 0; 
    t0.width = 1;
    t0.height = 1;
    t0.explored = true;
    this.state.tiles.set(t0.id, t0);
    occupyRoomCells(0, 0, 1, 1);

    const roomsList = [{ id: "tile_0", x: 0, y: 0, width: 1, height: 1 }];
    const totalRooms = difficulty * 3 + 5;
    
    const possibleSizes = [
      { w: 1, h: 1 },
      { w: 1, h: 2 },
      { w: 2, h: 1 },
      { w: 2, h: 2 }
    ];

    const directions = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 }
    ];

    let createdCount = 1;
    let attempts = 0;

    while (createdCount < totalRooms && roomsList.length > 0 && attempts < 300) {
      attempts++;
      
      const parentIndex = difficulty > 1 && Math.random() < (difficulty * 0.2)
        ? Math.floor(Math.random() * roomsList.length)
        : roomsList.length - 1;
      const parent = roomsList[parentIndex];

      const size = possibleSizes[Math.floor(Math.random() * possibleSizes.length)];
      const dir = directions[Math.floor(Math.random() * directions.length)];

      let nx = parent.x;
      let ny = parent.y;

      if (dir.dx === 1) {
        nx = parent.x + parent.width * TILE_SIZE;
        ny = parent.y + (Math.floor(Math.random() * parent.height) - Math.floor(Math.random() * size.h)) * TILE_SIZE;
      } else if (dir.dx === -1) {
        nx = parent.x - size.w * TILE_SIZE;
        ny = parent.y + (Math.floor(Math.random() * parent.height) - Math.floor(Math.random() * size.h)) * TILE_SIZE;
      } else if (dir.dy === 1) {
        ny = parent.y + parent.height * TILE_SIZE;
        nx = parent.x + (Math.floor(Math.random() * parent.width) - Math.floor(Math.random() * size.w)) * TILE_SIZE;
      } else if (dir.dy === -1) {
        ny = parent.y - size.h * TILE_SIZE;
        nx = parent.x + (Math.floor(Math.random() * parent.width) - Math.floor(Math.random() * size.w)) * TILE_SIZE;
      }

      if (canPlaceRoom(nx, ny, size.w, size.h)) {
        const tileId = `tile_${createdCount}`;
        const tile = new Tile();
        tile.id = tileId;
        tile.name = `Stanza ${createdCount}`;
        tile.x = nx;
        tile.y = ny;
        tile.width = size.w;
        tile.height = size.h;
        tile.explored = false;
        this.state.tiles.set(tile.id, tile);
        occupyRoomCells(nx, ny, size.w, size.h);

        const door = new InteractionSpot();
        door.id = `door_${parent.id}_${tileId}`;
        door.type = "door";
        door.x = (nx + parent.x + (size.w * TILE_SIZE)/2) / 2;
        door.y = (ny + parent.y + (size.h * TILE_SIZE)/2) / 2;
        door.state = "closed"; 
        door.tileAId = parent.id;
        door.tileBId = tileId;
        this.state.interactions.set(door.id, door);

        roomsList.push({ id: tileId, x: nx, y: ny, width: size.w, height: size.h });
        createdCount++;
      }
    }

    // 3. Posizionamento Cripta Finale
    const lastRoom = roomsList[roomsList.length - 1];
    let finalPlaced = false;

    for (const dir of directions) {
      let fnx = lastRoom.x;
      let fny = lastRoom.y;
      if (dir.dx === 1) fnx = lastRoom.x + lastRoom.width * TILE_SIZE;
      if (dir.dx === -1) fnx = lastRoom.x - TILE_SIZE;
      if (dir.dy === 1) fny = lastRoom.y + lastRoom.height * TILE_SIZE;
      if (dir.dy === -1) fny = lastRoom.y - TILE_SIZE;

      if (canPlaceRoom(fnx, fny, 1, 1)) {
        const finalTile = new Tile();
        finalTile.id = "tile_final";
        finalTile.name = "Cripta Finale";
        finalTile.x = fnx;
        finalTile.y = fny;
        finalTile.width = 1;
        finalTile.height = 1;
        finalTile.explored = false;
        this.state.tiles.set(finalTile.id, finalTile);
        occupyRoomCells(fnx, fny, 1, 1);

        const finalDoor = new InteractionSpot();
        finalDoor.id = "door_final";
        finalDoor.type = "door";
        finalDoor.x = (fnx + lastRoom.x) / 2 + 100;
        finalDoor.y = (fny + lastRoom.y) / 2 + 100;
        finalDoor.state = "closed";
        finalDoor.requiredKey = "key";
        finalDoor.tileAId = lastRoom.id;
        finalDoor.tileBId = "tile_final";
        this.state.interactions.set(finalDoor.id, finalDoor);

        finalPlaced = true;
        break;
      }
    }

    if (!finalPlaced) {
      const fallbackTile = new Tile();
      fallbackTile.id = "tile_final";
      fallbackTile.name = "Cripta Finale";
      fallbackTile.x = lastRoom.x + lastRoom.width * TILE_SIZE;
      fallbackTile.y = lastRoom.y;
      fallbackTile.width = 1;
      fallbackTile.height = 1;
      fallbackTile.explored = false;
      this.state.tiles.set(fallbackTile.id, fallbackTile);

      const fallbackDoor = new InteractionSpot();
      fallbackDoor.id = "door_final";
      fallbackDoor.type = "door";
      fallbackDoor.x = lastRoom.x + lastRoom.width * TILE_SIZE;
      fallbackDoor.y = lastRoom.y + 100;
      fallbackDoor.state = "closed";
      fallbackDoor.requiredKey = "key";
      fallbackDoor.tileAId = lastRoom.id;
      fallbackDoor.tileBId = "tile_final";
      this.state.interactions.set(fallbackDoor.id, fallbackDoor);
    }
  }
}