const { Client, LocalAuth } = require("whatsapp-web.js");

const qrcode = require("qrcode");
const fsp = require("fs/promises");
const logger = require("./../logger");
const os = require("os");
const fs = require("fs");

class WhatsAppService {
  constructor() {
    this.qrCode = null;
    this.sessionKey = "default";
    this.restarting = false;
    this.backoff = 2000;
    this.clientReady = false;

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
        // Auto-detect Chrome path for different OS
        executablePath: this.getChromePath(),
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-web-security",
          "--disable-features=VizDisplayCompositor",
        ],
      },
      takeoverOnConflict: true,
      takeoverTimeoutMs: 5000,
      restartOnAuthFail: true,
    });
    this._init();
  }

  getChromePath() {
    const platform = os.platform();
    const possiblePaths = [];

    if (platform === 'linux') {
      possiblePaths.push(
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/snap/bin/chromium'
      );
    } else if (platform === 'darwin') {
      possiblePaths.push(
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      );
    } else if (platform === 'win32') {
      possiblePaths.push(
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
      );
    }

    // Find the first existing path
    for (const path of possiblePaths) {
      if (fs.existsSync(path)) {
        logger.info(`Using Chrome at: ${path}`);
        return path;
      }
    }

    logger.warn('Chrome executable not found, using default');
    return undefined; // Let puppeteer auto-detect
  }

  _init() {
    try {
      this.client.on("qr", (qr) => {
        logger.info("QR code refreshed");
        qrcode.toDataURL(qr, (err, url) => {
          if (err) {
            logger.error(err, "Error generating QR code");
            return;
          }
          this.qrCode = url;
        });
      });
      this.client.on("ready", () => {
        logger.info("WhatsApp is ready!");
        this.qrCode = null;
        this.clientReady = true;
      });
      this.client.on("authenticated", () => {
        logger.info("WhatsApp authenticated!");
        this.qrCode = null;
      });
      this.client.on("auth_failure", () => {
        logger.error("WhatsApp authentication failed!");
        this.qrCode = null;
        this.clientReady = false;
      });
      this.client.on("disconnected", async (reason) => {
        logger.warn("WhatsApp disconnected:", reason);
        this.clientReady = false;
        await this.restart();
      });
      this.client.on("loading_screen", (percent, msg) => {
        logger.info({ percent: percent, msg }, "LOADING")
      });
      this.client.on("change_state", (s) => logger.info(s, "STATE"));
      
      // Add error handler for the client
      this.client.on("error", (error) => {
        logger.error(error, "WhatsApp client error");
        this.clientReady = false;
      });
    } catch (error) {
      logger.error(error, "Error initializing WhatsApp client");
    }

    this.client.initialize().catch((error) => {
      logger.error(error, "Error during client initialization");
      this.clientReady = false;
    });
    logger.info("WhatsApp client initializing...");
  }

  isAuthenticated() {
    return this.qrCode === null && this.clientReady;
  }

  async removeSession() {
    try {
      const platform = os.platform();
      let sessionPath;
      
      if (platform === 'win32') {
        sessionPath = `C:\\wwebjs_session\\session-${this.sessionKey}`;
      } else {
        sessionPath = `./wwebjs_session/session-${this.sessionKey}`;
      }
      
      await fsp.rm(sessionPath, {
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
    this.clientReady = false;
    
    try {
      logger.info("Restarting WhatsApp client...");
      
      if (this.client) {
        await this.client
          .destroy()
          .then(() => {
            logger.info("Client destroyed successfully");
          })
          .catch((err) => {
            logger.error(err, "Error during client destroy");
          });
      }
      
      await this.waitForBrowserClose();
      await this.removeSession();
      
      setTimeout(() => {
        this._init();
        this.restarting = false;
        this.backoff = 2000;
        this.clientReady = false;
      }, this.backoff);
    } catch (error) {
      logger.error(error.message, "Restarting error");
      this.restarting = false;
      this.clientReady = false;
      this.backoff = Math.min(this.backoff * 2, 60000);
      setTimeout(() => this.restart(), this.backoff);
    }
  }

  async logout() {
    try {
      if (this.client && this.clientReady) {
        await this.client.logout();
      }
    } catch (error) {
      logger.error(error.message, "Error during logout");
    }
    await this.restart();
  }

  async isConnected() {
    try {
      if (!this.client || !this.clientReady) {
        return false;
      }
      const state = await this.client.getState();
      return state === "CONNECTED";
    } catch (error) {
      logger.error(error.message, "Error checking connection state");
      return false;
    }
  }
}

module.exports = WhatsAppService;
