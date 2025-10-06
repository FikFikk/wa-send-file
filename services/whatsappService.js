const { Client, LocalAuth } = require("whatsapp-web.js");

const qrcode = require("qrcode");
const fsp = require("fs/promises");
const logger = require("./../logger");

class WhatsAppService {
  constructor() {
    this.qrCode = null;
    this.sessionKey = "default";
    this.restarting = false;
    this.backoff = 2000;

    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: this.sessionKey,
        // dataPath: "C:\\wwebjs_session",
      }),
      webVersionCache: {
        type: "local",
      },
      puppeteer: {
        headless: true,
        executablePath:
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
      },
      takeoverOnConflict: true,
      takeoverTimeoutMs: 5000,
      restartOnAuthFail: true,
    });
    this._init();
  }

  _init() {
    try {
      this.client.on("qr", (qr) => {
        logger.info("QR code refreshed");
        qrcode.toDataURL(qr, (err, url) => {
          this.qrCode = url;
        });
      });
      this.client.on("ready", () => {
        logger.info("WhatsApp is ready!");
        this.qrCode = null;
      });
      this.client.on("authenticated", () => {
        logger.info("WhatsApp authenticated!");
        this.qrCode = null;
      });
      this.client.on("auth_failure", () => {
        logger.error("WhatsApp authentication failed!");
        this.qrCode = null;
      });
      this.client.on("disconnected", async (reason) => {
        logger.warn("WhatsApp disconnected:", reason);
        await this.restart();
      });
      this.client.on("loading_screen", (percent, msg) => {
        logger.info({ percent: percent, msg }, "LOADING")
      });
      this.client.on("change_state", (s) => logger.info(s, "STATE"));
    } catch (error) {
      logger.error(error, "Error initializing WhatsApp client");
    }

    this.client.initialize();
    logger.info("WhatsApp client initializing...");
  }

  isAuthenticated() {
    return this.qrCode === null;
  }

  async removeSession() {
    try {
      await fsp.rm(`C:\\wwebjs_session\\session-${this.sessionKey}`, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100,
      });
      logger.info("Session data removed");
    } catch (error) {
      logger.error(error.message, "Error removing session data");
    }
  }

  async waitForBrowserClose(timeoutMs = 15000) {
    try {
      const proc = this.client?.pupBrowser?.process?.();
      if (!proc) return;
      await Promise.race([
        new Promise((res) => proc.once("close", res)),
        new Promise((res) => setTimeout(res, timeoutMs)),
      ]);
    } catch (error) {
      logger.error(error.message, "Error waiting for browser close");
    }
  }

  async restart() {
    if (this.restarting) return;
    this.restarting = true;
    try {
      logger.info("Restarting WhatsApp client...");
      await this.client
        ?.destroy()
        .then(() => {
          logger.info("Client destroyed successfully");
        })
        .catch((err) => {
          logger.error(err, "Error during client destroy");
        });
      await this.waitForBrowserClose();
      await this.removeSession();
      setTimeout(() => {
        this._init();
        this.restarting = false;
        this.backoff = 2000;
      }, this.backoff);
    } catch (error) {
      logger.error(error.message, "Restarting error");
      this.restarting = false;
      this.backoff = Math.min(this.backoff * 2, 60000);
      setTimeout(this.restart(), this.backoff);
    }
  }

  async logout() {
    await this.client?.logout();
    await this.restart();
  }

  async isConnected() {
    return (await this.client?.getState()) === "CONNECTED";
  }
}

module.exports = WhatsAppService;
