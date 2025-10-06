const express = require("express");
const path = require("path");
const WhatsAppService = require("./services/whatsappService");
const logger = require("./logger");
const { MessageMedia } = require("whatsapp-web.js");

const app = express();
const PORT = process.env.PORT || 5005;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// WhatsApp Service
const waService = new WhatsAppService();

app.get("/", (req, res) => {
  if (waService.isAuthenticated()) {
    res.render("index", { loggedIn: true });
  } else {
    res.render("login", { qr: waService.qrCode, loggedIn: false });
  }
});

app.get("/logout", async (req, res) => {
  await waService.logout();
  res.redirect("/");
});

// API to get QR code (for AJAX polling)
app.get("/qr", async (req, res) => {
  try {
    const waState = await waService.isConnected();
    res.json({ qr: waService.qrCode, waState });
  } catch (error) {
    logger.error(error, "Error getting QR code");
    res.json({ qr: waService.qrCode, waState: false });
  }
});

// Status endpoint
app.get("/status", async (req, res) => {
  try {
    const connected = await waService.isConnected();
    const clientReady = waService.clientReady;
    res.json({ 
      connected, 
      clientReady,
      authenticated: waService.isAuthenticated()
    });
  } catch (error) {
    logger.error(error, "Error getting status");
    res.json({ connected: false, clientReady: false, authenticated: false });
  }
});

app.post("/send-file", async (req, res) => {
  try {
    if (!waService.clientReady) {
      return res.status(400).json({ 
        status: "error", 
        message: "WhatsApp client is not ready" 
      });
    }

    const { fileUrl, chatId, fileName } = req.body;
    const file = await MessageMedia.fromUrl(fileUrl, {
      mime: "application/pdf",
      filename: `${fileName}.pdf`,
    });
    await waService.client.sendMessage(chatId, file);
    res.status(200).json({ status: "send file success" });
  } catch (error) {
    logger.error(error, "Send message file error");
    res.status(500).json({ status: "error", message: error.message });
  }
});

app.get("/conversations", async (req, res) => {
  try {
    if (!waService.clientReady) {
      return res.status(400).json({ 
        status: "error", 
        message: "WhatsApp client is not ready" 
      });
    }

    const { phone } = req.query;
    const chat = await waService.client.getChats();
    const conversation = await chat[0].fetchMessages({ limit: 20 });

    return res.status(200).json({
      status: "success",
      conversation: conversation.reverse(),
    });
  } catch (error) {
    logger.error(error, "Error getting conversations");
    return res.status(500).json({ status: "error", message: error.message });
  }
});

app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
});
