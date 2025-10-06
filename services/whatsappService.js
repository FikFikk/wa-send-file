const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode");
const fsp = require("fs/promises");
const logger = require("./../logger");

class WhatsAppService {
  constructor() {
    console.log("🚀 WhatsApp Service starting...");
    this.qrCode = null;
    this.sessionKey = "default";
    this.restarting = false;
    this.backoff = 2000;
    this.clientReady = false;
    this.isServerEnvironment = process.platform === 'linux';
    this.initAttempts = 0;
    this.maxAttempts = 3;
    
    console.log(`📱 Environment: ${this.isServerEnvironment ? 'Linux Server' : 'Windows Local'}`);
    
    this.createClient();
    this._init();
  }

  createClient() {
    console.log("🔧 Creating WhatsApp client...");
    
    if (this.isServerEnvironment) {
      console.log("🐧 Linux server detected - using optimized config...");
      
      // Set environment variables for Puppeteer
      process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'false';
      
      // Try system Chrome first
      const chromeConfig = this.trySystemChrome();
      if (chromeConfig) {
        try {
          console.log("✅ Attempting with system Chrome...");
          this.client = new Client(chromeConfig);
          console.log("✅ Client created with system Chrome!");
          return;
        } catch (error) {
          console.log("❌ System Chrome failed:", error.message);
        }
      }
      
      // Use bundled Chromium with comprehensive args
      try {
        console.log("🔄 Using bundled Chromium with comprehensive config...");
        
        const serverConfig = {
          authStrategy: new LocalAuth({ 
            clientId: this.sessionKey,
            dataPath: './.wwebjs_auth'
          }),
          webVersionCache: { 
            type: 'remote', 
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html' 
          },
          puppeteer: {
            headless: 'new',
            timeout: 0,
            protocolTimeout: 0,
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
              '--disable-accelerated-2d-canvas',
              '--no-first-run',
              '--no-zygote',
              '--disable-gpu',
              '--disable-web-security',
              '--disable-features=VizDisplayCompositor',
              '--disable-background-timer-throttling',
              '--disable-backgrounding-occluded-windows',
              '--disable-renderer-backgrounding',
              '--disable-ipc-flooding-protection',
              '--memory-pressure-off',
              '--disable-default-apps',
              '--disable-extensions',
              '--disable-plugins',
              '--disable-translate',
              '--disable-sync',
              '--disable-reading-from-canvas',
              '--disable-background-networking',
              '--disable-default-apps',
              '--disable-extensions',
              '--disable-sync',
              '--disable-translate',
              '--hide-scrollbars',
              '--metrics-recording-only',
              '--mute-audio',
              '--no-first-run',
              '--safebrowsing-disable-auto-update',
              '--ignore-gpu-blacklist',
              '--ignore-certificate-errors',
              '--ignore-ssl-errors',
              '--ignore-certificate-errors-spki-list'
            ],
            ignoreHTTPSErrors: true,
            devtools: false
          },
          takeoverOnConflict: true,
          takeoverTimeoutMs: 0,
          restartOnAuthFail: false,
        };
        
        this.client = new Client(serverConfig);
        console.log("✅ Server client created with bundled Chromium!");
        return;
        
      } catch (error) {
        console.log("❌ Server config failed:", error.message);
        throw new Error(`Failed to create WhatsApp client: ${error.message}`);
      }
      
    } else {
      // Windows configuration
      console.log("🟩 Windows environment - using standard config");
      try {
        const windowsConfig = {
          authStrategy: new LocalAuth({ clientId: this.sessionKey }),
          webVersionCache: { 
            type: 'remote', 
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html' 
          },
          puppeteer: {
            headless: true,
            executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
          },
          takeoverOnConflict: true,
          takeoverTimeoutMs: 15000,
          restartOnAuthFail: true,
        };
        
        this.client = new Client(windowsConfig);
        console.log("✅ Windows client created successfully!");
        
      } catch (error) {
        console.log("❌ Windows client creation failed:", error.message);
        throw error;
      }
    }
  }
  
  trySystemChrome() {
    console.log("🔍 Searching for system Chrome/Chromium...");
    
    const fs = require('fs');
    const possiblePaths = [
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/snap/bin/chromium'
    ];
    
    for (const path of possiblePaths) {
      console.log(`🔍 Checking: ${path}`);
      if (fs.existsSync(path)) {
        console.log(`✅ Found Chrome at: ${path}`);
        return {
          authStrategy: new LocalAuth({ 
            clientId: this.sessionKey,
            dataPath: './.wwebjs_auth'
          }),
          webVersionCache: { 
            type: 'remote', 
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html' 
          },
          puppeteer: {
            headless: true,
            executablePath: path,
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
              '--disable-gpu'
            ]
          },
          takeoverOnConflict: true,
          takeoverTimeoutMs: 30000,
          restartOnAuthFail: false,
        };
      }
    }
    
    console.log("❌ No system Chrome found");
    return null;
  }

  _init() {
    console.log("🔧 Initializing WhatsApp client...");
    
    try {
      console.log("📱 Setting up WhatsApp event handlers...");
      this.setupEvents();
      
      // Initialize client with error handling
      this.client.initialize().catch((error) => {
        console.log("❌ Client initialization failed:", error.message);
        logger.error(error, "Failed to initialize WhatsApp client");
        
        this.initAttempts++;
        console.log(`🔄 Initialization attempt ${this.initAttempts}/${this.maxAttempts}`);
        
        if (error.message.includes('Failed to launch the browser process')) {
          console.log("💡 Browser launch failed - missing system libraries");
          console.log("📝 Run this command to fix:");
          console.log("📝 chmod +x fix-deps.sh && sudo ./fix-deps.sh");
        }
        
        if (this.initAttempts < this.maxAttempts) {
          console.log(`⏰ Retrying in ${this.backoff}ms...`);
          setTimeout(() => {
            this.restart();
          }, this.backoff);
        } else {
          console.log("❌ Max attempts reached!");
          console.log("📝 Install dependencies with: sudo ./fix-deps.sh");
          console.log("⚠️ Service will retry every 30 seconds...");
          
          // Keep retrying every 30 seconds
          setTimeout(() => {
            this.initAttempts = 0; // Reset attempts
            this.restart();
          }, 30000);
        }
      });
      
      console.log("⏳ WhatsApp client initialization started...");
      
    } catch (error) {
      console.log("❌ Error in _init:", error.message);
      logger.error(error, "Error initializing WhatsApp client");
    }
  }
  
  setupEvents() {
    console.log("📱 Setting up WhatsApp events...");
    
    this.client.on("qr", (qr) => {
      console.log("📱 REAL QR code received from WhatsApp!");
      console.log(`📱 QR length: ${qr ? qr.length : 'null'}`);
      logger.info("QR code received from WhatsApp");
      
      if (!qr) {
        console.log("❌ QR string is empty!");
        return;
      }
      
      qrcode.toDataURL(qr, { errorCorrectionLevel: 'M' }, (err, url) => {
        if (err) {
          console.log("❌ QR generation error:", err.message);
          logger.error(err, "Error generating QR code");
          return;
        }
        
        if (!url) {
          console.log("❌ QR URL is empty!");
          return;
        }
        
        this.qrCode = url;
        console.log(`✅ REAL WhatsApp QR code generated! Length: ${url.length}`);
        console.log("✅ This QR code can be scanned with WhatsApp mobile app");
        logger.info("Real WhatsApp QR code generated successfully");
      });
    });
    
    this.client.on("ready", () => {
      console.log("🎉 WhatsApp is ready!");
      logger.info("WhatsApp is ready!");
      this.qrCode = null;
      this.clientReady = true;
      this.initAttempts = 0;
    });
    
    this.client.on("authenticated", () => {
      console.log("🔐 WhatsApp authenticated!");
      logger.info("WhatsApp authenticated!");
      this.qrCode = null;
    });
    
    this.client.on("auth_failure", () => {
      console.log("❌ WhatsApp authentication failed!");
      logger.error("WhatsApp authentication failed!");
      this.qrCode = null;
      this.clientReady = false;
    });
    
    this.client.on("disconnected", async (reason) => {
      console.log("📱 WhatsApp disconnected:", reason);
      logger.warn("WhatsApp disconnected:", reason);
      this.clientReady = false;
      if (!this.restarting) {
        await this.restart();
      }
    });
    
    this.client.on("loading_screen", (percent, msg) => {
      console.log(`⏳ Loading: ${percent}% - ${msg}`);
      logger.info({ percent, msg }, "LOADING");
    });
    
    this.client.on("change_state", (state) => {
      console.log(`🔄 State changed: ${state}`);
      logger.info(state, "STATE");
    });
    
    this.client.on("error", (error) => {
      console.log("❌ WhatsApp client error:", error.message);
      logger.error(error, "WhatsApp client error");
    });
  }

  isAuthenticated() {
    const result = this.qrCode === null && this.clientReady;
    console.log(`🔐 Authentication check: ${result} (QR: ${this.qrCode ? 'exists' : 'null'}, Ready: ${this.clientReady})`);
    return result;
  }

  isClientReady() {
    const result = this.clientReady && this.client && !this.restarting;
    console.log(`📱 Client ready check: ${result} (Ready: ${this.clientReady}, Restarting: ${this.restarting})`);
    return result;
  }

  async removeSession() {
    try {
      const sessionPath = this.isServerEnvironment 
        ? `.wwebjs_auth/session-${this.sessionKey}`
        : `C:\\wwebjs_session\\session-${this.sessionKey}`;
      
      console.log(`🗑️ Removing session: ${sessionPath}`);
      await fsp.rm(sessionPath, { recursive: true, force: true });
      console.log("✅ Session removed");
      logger.info("Session removed");
    } catch (error) {
      console.log("❌ Error removing session:", error.message);
      logger.error(error, "Error removing session");
    }
  }

  async restart() {
    if (this.restarting) {
      console.log("🔄 Restart already in progress, skipping...");
      return;
    }
    
    this.restarting = true;
    this.clientReady = false;
    
    try {
      console.log("🔄 Restarting WhatsApp client...");
      
      if (this.client) {
        try {
          await this.client.destroy();
          console.log("✅ Client destroyed");
        } catch (err) {
          console.log("❌ Error destroying client:", err.message);
        }
      }
      
      await this.removeSession();
      
      setTimeout(() => {
        this.createClient();
        this._init();
        this.restarting = false;
        console.log("✅ Restart completed");
      }, this.backoff);
      
    } catch (error) {
      console.log("❌ Restart error:", error.message);
      logger.error(error, "Restart error");
      this.restarting = false;
      
      setTimeout(() => {
        this.restart();
      }, this.backoff * 2);
    }
  }

  async logout() {
    try {
      console.log("🚪 Logging out...");
      this.clientReady = false;
      this.qrCode = null;
      
      if (this.client) {
        await this.client.logout();
      }
      
      await this.removeSession();
      await this.restart();
      
    } catch (error) {
      console.log("❌ Logout error:", error.message);
      logger.error(error, "Logout error");
      await this.restart();
    }
  }

  async isConnected() {
    try {
      if (!this.client || !this.clientReady) {
        console.log("📱 Connection check: false (not ready)");
        return false;
      }
      const state = await this.client.getState();
      const connected = state === "CONNECTED";
      console.log(`📱 Connection check: ${connected} (state: ${state})`);
      return connected;
    } catch (error) {
      console.log("❌ Error checking connection:", error.message);
      logger.error(error, "Error checking connection");
      return false;
    }
  }
}

module.exports = WhatsAppService;