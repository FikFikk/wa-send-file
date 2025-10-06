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
    this.clientReady = false;
    this.isServerEnvironment = process.platform === 'linux';
    
    this.createClient();
    this._init();
  }

  createClient() {
    const puppeteerConfig = {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-web-security",
        "--disable-features=VizDisplayCompositor",
        "--no-first-run",
        "--no-zygote",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
      ],
    };

    if (this.isServerEnvironment) {
      logger.info("Detected Linux server environment");
      
      // Try to find Chrome executable
      const fs = require('fs');
      const possiblePaths = [
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/snap/bin/chromium'
      ];
      
      let chromeFound = false;
      for (const path of possiblePaths) {
        if (fs.existsSync(path)) {
          puppeteerConfig.executablePath = path;
          logger.info(`Using Chrome at: ${path}`);
          chromeFound = true;
          break;
        }
      }
      
      if (!chromeFound) {
        logger.warn('No system Chrome found, using bundled Chromium');
      }
      
      // Add more aggressive args for server environment
      puppeteerConfig.args.push(
        '--disable-extensions',
        '--disable-plugins',
        '--disable-images',
        '--disable-javascript',
        '--virtual-time-budget=5000'
      );
    } else {
      logger.info("Detected Windows environment");
      puppeteerConfig.executablePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
    }

    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: this.sessionKey,
      }),
      webVersionCache: {
        type: "local",
      },
      puppeteer: puppeteerConfig,
      takeoverOnConflict: true,
      takeoverTimeoutMs: 10000,
      restartOnAuthFail: true,
    });
  }

  _init() {
    try {
      this.client.on("qr", (qr) => {
        logger.info("QR code received from WhatsApp client");
        logger.info(`QR string length: ${qr ? qr.length : 'null'}`);
        
        if (!qr) {
          logger.error("QR string is empty or null");
          return;
        }
        
        qrcode.toDataURL(qr, { errorCorrectionLevel: 'M', margin: 2 }, (err, url) => {
          if (err) {
            logger.error(err, "Error generating QR code data URL");
            return;
          }
          
          if (!url) {
            logger.error("QR code URL is empty");
            return;
          }
          
          this.qrCode = url;
          logger.info("QR code successfully generated and stored");
          logger.info(`QR URL length: ${url.length}`);
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
        if (!this.restarting) {
          await this.restart();
        }
      });
      
      this.client.on("loading_screen", (percent, msg) => {
        logger.info({ percent: percent, msg }, "LOADING")
      });
      
      this.client.on("change_state", (s) => logger.info(s, "STATE"));
      
      // Add error event listener
      this.client.on("error", (error) => {
        logger.error(error, "WhatsApp client error");
        if (error.message.includes('browser')) {
          logger.error("Browser-related error detected. This might be a Chrome/Chromium issue.");
        }
      });
      
    } catch (error) {
      logger.error(error, "Error initializing WhatsApp client");
    }

    // Initialize with better error handling
    this.client.initialize().catch((error) => {
      logger.error(error, "Failed to initialize WhatsApp client");
      
      if (error.message.includes('Failed to launch the browser process')) {
        logger.error("Chrome/Chromium launch failed. Please install Chrome:");
        logger.error("Ubuntu/Debian: sudo apt install google-chrome-stable");
        logger.error("CentOS/RHEL: sudo yum install google-chrome-stable");
      }
      
      // Retry after delay
      setTimeout(() => {
        logger.info("Retrying client initialization...");
        this.restart();
      }, 10000);
    });
    
    logger.info("WhatsApp client initializing...");
  }

  isAuthenticated() {
    return this.qrCode === null && this.clientReady;
  }

  isClientReady() {
    return this.clientReady && this.client && !this.restarting;
  }

  async removeSession() {
    try {
      const sessionPath = this.isServerEnvironment 
        ? `.wwebjs_auth/session-${this.sessionKey}`
        : `C:\\wwebjs_session\\session-${this.sessionKey}`;
      
      logger.info(`Removing session data from: ${sessionPath}`);
      
      await fsp.rm(sessionPath, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100,
      });
      logger.info("Session data removed successfully");
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
    if (this.restarting) {
      logger.info("Restart already in progress, skipping...");
      return;
    }
    
    this.restarting = true;
    this.clientReady = false;
    
    try {
      logger.info("Restarting WhatsApp client...");
      
      if (this.client) {
        try {
          await this.client.destroy();
          logger.info("Client destroyed successfully");
        } catch (err) {
          logger.error(err, "Error during client destroy");
        }
      }
      
      await this.waitForBrowserClose();
      await this.removeSession();
      
      // Wait before recreating client
      await new Promise(resolve => setTimeout(resolve, this.backoff));
      
      this.createClient();
      this._init();
      
      this.restarting = false;
      this.backoff = 2000;
      
    } catch (error) {
      logger.error(error.message, "Restarting error");
      this.restarting = false;
      this.backoff = Math.min(this.backoff * 2, 60000);
      
      // Retry restart after backoff
      setTimeout(() => {
        this.restart();
      }, this.backoff);
    }
  }

  async logout() {
    try {
      this.clientReady = false;
      this.qrCode = null;
      
      if (this.client) {
        logger.info("Logging out WhatsApp client...");
        await this.client.logout();
      }
      
      await this.removeSession();
      await this.restart();
      
    } catch (error) {
      logger.error(error.message, "Logout error");
      // Force restart even if logout fails
      await this.restart();
    }
  }

  async isConnected() {
    try {
      if (!this.client || !this.clientReady) return false;
      const state = await this.client.getState();
      return state === "CONNECTED";
    } catch (error) {
      logger.error(error.message, "Error checking connection state");
      return false;
    }
  }
}

module.exports = WhatsAppService;
