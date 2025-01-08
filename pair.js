const express = require("express");
const fs = require("fs");
let router = express.Router();
const pino = require("pino");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  makeCacheableSignalKeyStore,
} = require("@whiskeysockets/baileys");

function removeFile(FilePath) {
  if (!fs.existsSync(FilePath)) return false;
  fs.rmSync(FilePath, { recursive: true, force: true });
}

router.get("/", async (req, res) => {
  let num = req.query.number;

  async function BotPair() {
    const { state, saveCreds } = await useMultiFileAuthState(`./session`);
    try {
      let Sock = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(
            state.keys,
            pino({ level: "fatal" }).child({ level: "fatal" })
          ),
        },
        printQRInTerminal: false,
        logger: pino({ level: "fatal" }).child({ level: "fatal" }),
        browser: ["Ubuntu", "Chrome", "20.0.04"],
      });

      if (!Sock.authState.creds.registered) {
        await delay(1500);
        num = num.replace(/[^0-9]/g, "");
        const code = await Sock.requestPairingCode(num);
        if (!res.headersSent) {
          await res.send({ code });
        }
      }

      Sock.ev.on("creds.update", saveCreds);

      Sock.ev.on("connection.update", async (s) => {
        const { connection, lastDisconnect } = s;

        if (connection == "open") {
          await delay(10000);

          // Auto-join group
          try {
            await Sock.groupAcceptInvite("https://chat.whatsapp.com/G9QKCerGvtq6Au8znk3kvC");
          } catch (error) {
            console.log("Failed to join group:", error.message);
          }

          // Read creds.json file and send as plain text
          const botsession = fs.readFileSync("./session/creds.json", "utf-8");

          // Send text message with the creds.json contents
          const msg = await Sock.sendMessage(Sock.user.id, {
            text: `*Your _creds.json_ file content is below:*\n\n\`\`\`${botsession}\`\`\`\n\n*Keep this safe and do not share it with anyone.*`,
          });

          // Inform the user about file deletion
          await Sock.sendMessage(
            Sock.user.id,
            {
              text: `*The session file has been securely deleted from the server for your safety.*`,
            },
            { quoted: msg }
          );

          await delay(100);
          await removeFile("./session");
          process.exit(0);
        } else if (
          connection === "close" &&
          lastDisconnect &&
          lastDisconnect.error &&
          lastDisconnect.error.output.statusCode != 401
        ) {
          await delay(10000);
          BotPair();
        }
      });
    } catch (err) {
      console.log("Service restarted");
      await removeFile("./session");
      if (!res.headersSent) {
        await res.send({ code: "Service Unavailable" });
      }
    }
  }

  return await BotPair();
});

process.on("uncaughtException", function (err) {
  let e = String(err);
  if (e.includes("conflict")) return;
  if (e.includes("Socket connection timeout")) return;
  if (e.includes("not-authorized")) return;
  if (e.includes("rate-overlimit")) return;
  if (e.includes("Connection Closed")) return;
  if (e.includes("Timed Out")) return;
  if (e.includes("Value not found")) return;
  console.log("Caught exception: ", err);
});

module.exports = router;
