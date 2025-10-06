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

app.get("/debug", (req, res) => {
  res.render("login-debug", { qr: waService.qrCode, loggedIn: false });
});

app.get("/logout", async (req, res) => {
  await waService.logout();
  res.redirect("/");
});

// API to get QR code (for AJAX polling)
app.get("/qr", async (req, res) => {
  res.json({ qr: waService.qrCode, waState: await waService.isConnected() });
});

// Status endpoint for monitoring
app.get("/status", async (req, res) => {
  try {
    const status = {
      authenticated: waService.isAuthenticated(),
      clientReady: waService.isClientReady(),
      connected: await waService.isConnected(),
      restarting: waService.restarting,
      hasQR: !!waService.qrCode,
      qrLength: waService.qrCode ? waService.qrCode.length : 0,
      environment: process.platform,
      timestamp: new Date().toISOString()
    };
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoints
app.post("/debug/clear-session", async (req, res) => {
  try {
    logger.info("Manual session clear requested");
    await waService.removeSession();
    res.json({ status: "Session cleared successfully" });
  } catch (error) {
    logger.error(error, "Error clearing session");
    res.status(500).json({ error: error.message });
  }
});

app.post("/debug/force-restart", async (req, res) => {
  try {
    logger.info("Manual restart requested");
    await waService.restart();
    res.json({ status: "Restart initiated" });
  } catch (error) {
    logger.error(error, "Error restarting service");
    res.status(500).json({ error: error.message });
  }
});

app.get("/debug/qr-raw", async (req, res) => {
  try {
    const qrData = {
      hasQR: !!waService.qrCode,
      qrLength: waService.qrCode ? waService.qrCode.length : 0,
      qrPreview: waService.qrCode ? waService.qrCode.substring(0, 100) + "..." : null,
      clientReady: waService.clientReady,
      restarting: waService.restarting
    };
    res.json(qrData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/send-file", async (req, res) => {
  try {
    // Check if client is ready before sending
    if (!waService.isClientReady()) {
      return res.status(400).json({ 
        status: "error", 
        message: "WhatsApp client is not ready. Please wait or reconnect." 
      });
    }

    const { fileUrl, chatId, fileName } = req.body;
    
    if (!fileUrl || !chatId || !fileName) {
      return res.status(400).json({ 
        status: "error", 
        message: "Missing required parameters: fileUrl, chatId, or fileName" 
      });
    }

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
    if (!waService.isClientReady()) {
      return res.status(400).json({ 
        status: "error", 
        message: "WhatsApp client is not ready" 
      });
    }

    const { phone } = req.query;
    const chat = await waService.client.getChats();
    
    if (!chat || chat.length === 0) {
      return res.status(200).json({
        status: "success",
        conversation: [],
      });
    }

    const conversation = await chat[0].fetchMessages({ limit: 20 });

    return res.status(200).json({
      status: "success",
      conversation: conversation.reverse(),
    });
  } catch (error) {
    logger.error(error, "Get conversations error");
    return res.status(500).json({ status: "error", message: error.message });
  }
});

app.listen(PORT, () => {
  logger.info(`Server running on http://13.212.75.243:${PORT}`);
});
