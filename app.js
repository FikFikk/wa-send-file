const express = require("express");
const path = require("path");
const WhatsAppService = require("./services/whatsappService");
const logger = require("./logger");
const { MessageMedia } = require("whatsapp-web.js");

const app = express();
const PORT = process.env.PORT || 4000;

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
  res.json({ qr: waService.qrCode, waState: await waService.isConnected() });
});

app.post("/send-file", async (req, res) => {
  try {
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
    const { phone } = req.query;
    const chat = await waService.client.getChats();
    const conversation = await chat[0].fetchMessages({ limit: 20 });

    return res.status(200).json({
      status: "success",
      conversation: conversation.reverse(),
    });
  } catch (error) {
    return res.status(500).json({ status: "error", message: error.message });
  }
});

app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
});
