import config from "@colyseus/tools";
import { GameRoom } from "./rooms/GameRoom";

export default config({
  initializeGameServer: (gameServer) => {
    console.log("⚙️ [DEBUG] Registrazione della stanza 'madness'...");
    gameServer.define('madness', GameRoom);
  },
  initializeExpress: (app) => {
    app.get("/hello", (req, res) => {
      res.send("Server Iniziato!");
    });
  },
});