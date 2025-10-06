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
    this.mockMode = false;
    this.initAttempts = 0;
    this.maxAttempts = 3;
    
    console.log(`📱 Environment: ${this.isServerEnvironment ? 'Linux Server' : 'Windows Local'}`);
    
    this.createClient();
    this._init();
  }

  createClient() {
    console.log("🔧 Creating WhatsApp client...");
    
    if (this.isServerEnvironment) {
      console.log("🐧 Linux server detected - trying multiple configurations...");
      
      // Strategy 1: Try to find system Chrome
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
      
      // Strategy 2: Try bundled Chromium with minimal args
      try {
        console.log("🔄 Trying bundled Chromium with minimal config...");
        const minimalConfig = {
          authStrategy: new LocalAuth({ clientId: this.sessionKey }),
          webVersionCache: { type: "local" },
          puppeteer: {
            headless: true,
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox'
            ]
          },
          takeoverOnConflict: true,
          takeoverTimeoutMs: 30000,
          restartOnAuthFail: false,
        };
        
        this.client = new Client(minimalConfig);
        console.log("✅ Client created with minimal Chromium config!");
        return;
        
      } catch (error) {
        console.log("❌ Minimal Chromium failed:", error.message);
      }
      
      // Strategy 3: Try without puppeteer config
      try {
        console.log("🔄 Trying without puppeteer config...");
        const noPuppeteerConfig = {
          authStrategy: new LocalAuth({ clientId: this.sessionKey }),
          webVersionCache: { type: "local" },
          takeoverOnConflict: true,
          takeoverTimeoutMs: 30000,
          restartOnAuthFail: false,
        };
        
        this.client = new Client(noPuppeteerConfig);
        console.log("✅ Client created without puppeteer config!");
        return;
        
      } catch (error) {
        console.log("❌ No puppeteer config failed:", error.message);
      }
      
      // Strategy 4: Fallback to mock mode
      console.log("⚠️ All strategies failed, creating mock client...");
      this.createMockClient();
      
    } else {
      // Windows configuration
      console.log("🟩 Windows environment - using standard config");
      try {
        const windowsConfig = {
          authStrategy: new LocalAuth({ clientId: this.sessionKey }),
          webVersionCache: { type: "local" },
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
        this.createMockClient();
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
          authStrategy: new LocalAuth({ clientId: this.sessionKey }),
          webVersionCache: { type: "local" },
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
  
  createMockClient() {
    console.log("🎭 Creating mock client for testing...");
    
    this.mockMode = true;
    this.client = {
      initialize: () => {
        console.log("🎭 Mock client initialized");
        
        // Simulate QR code generation after delay
        setTimeout(() => {
          console.log("🎭 Generating mock QR code...");
          if (this.onQRHandler) {
            this.onQRHandler('mock-qr-data-' + Date.now());
          }
        }, 3000);
        
        return Promise.resolve();
      },
      
      on: (event, callback) => {
        console.log(`🎭 Mock event registered: ${event}`);
        if (event === 'qr') {
          this.onQRHandler = callback;
        }
        // Store other event handlers for later use
        this[`on${event.charAt(0).toUpperCase() + event.slice(1)}Handler`] = callback;
      },
      
      destroy: () => {
        console.log("🎭 Mock client destroyed");
        return Promise.resolve();
      },
      
      getState: () => {
        return Promise.resolve('DISCONNECTED');
      },
      
      sendMessage: () => {
        console.log("🎭 Mock client: Cannot send messages (browser unavailable)");
        return Promise.reject(new Error('Mock client - browser unavailable'));
      },
      
      getChats: () => {
        console.log("🎭 Mock client: Returning empty chats");
        return Promise.resolve([]);
      },
      
      logout: () => {
        console.log("🎭 Mock client logout");
        return Promise.resolve();
      }
    };
    
    console.log("🎭 Mock client created - limited functionality available");
  }

  _init() {
    console.log("🔧 Initializing WhatsApp client...");
    
    try {
      if (this.mockMode) {
        console.log("🎭 Setting up mock event handlers...");
        this.setupMockEvents();
      } else {
        console.log("📱 Setting up real WhatsApp event handlers...");
        this.setupRealEvents();
      }
      
      // Initialize client with error handling
      this.client.initialize().catch((error) => {
        console.log("❌ Client initialization failed:", error.message);
        logger.error(error, "Failed to initialize WhatsApp client");
        
        this.initAttempts++;
        console.log(`🔄 Initialization attempt ${this.initAttempts}/${this.maxAttempts}`);
        
        if (error.message.includes('Failed to launch the browser process')) {
          console.log("💡 Browser launch failed - this is expected on servers without Chrome");
        }
        
        if (this.initAttempts < this.maxAttempts && !this.mockMode) {
          console.log(`⏰ Retrying in ${this.backoff}ms...`);
          setTimeout(() => {
            this.restart();
          }, this.backoff);
        } else if (!this.mockMode) {
          console.log("🎭 Max attempts reached, switching to mock mode...");
          this.createMockClient();
          this.setupMockEvents();
          this.client.initialize();
        }
      });
      
      console.log("⏳ WhatsApp client initialization started...");
      
    } catch (error) {
      console.log("❌ Error in _init:", error.message);
      logger.error(error, "Error initializing WhatsApp client");
    }
  }
  
  setupRealEvents() {
    console.log("📱 Setting up real WhatsApp events...");
    
    this.client.on("qr", (qr) => {
      console.log("📱 QR code received from WhatsApp!");
      console.log(`📱 QR length: ${qr ? qr.length : 'null'}`);
      logger.info("QR code received");
      
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
        console.log(`✅ QR code generated! Length: ${url.length}`);
        logger.info("QR code generated successfully");
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
  
  setupMockEvents() {
    console.log("🎭 Setting up mock events...");
    
    // Generate mock QR code after delay
    setTimeout(() => {
      console.log("🎭 Generating mock QR code...");
      const mockQRData = 'mock-whatsapp-qr-' + Date.now();
      
      qrcode.toDataURL(mockQRData, (err, url) => {
        if (!err && url) {
          this.qrCode = url;
          console.log("🎭 Mock QR code generated successfully!");
          logger.info("Mock QR code generated");
        } else {
          console.log("❌ Mock QR generation failed:", err?.message);
        }
      });
    }, 2000);
    
    // Simulate periodic QR refresh
    setInterval(() => {
      if (this.mockMode && !this.clientReady) {
        console.log("🎭 Refreshing mock QR code...");
        const mockQRData = 'mock-whatsapp-qr-' + Date.now();
        
        qrcode.toDataURL(mockQRData, (err, url) => {
          if (!err && url) {
            this.qrCode = url;
            console.log("🎭 Mock QR code refreshed");
          }
        });
      }
    }, 20000); // Refresh every 20 seconds
  }

  isAuthenticated() {
    if (this.mockMode) {
      console.log("🎭 Mock mode: returning false for authentication");
      return false;
    }
    const result = this.qrCode === null && this.clientReady;
    console.log(`🔐 Authentication check: ${result} (QR: ${this.qrCode ? 'exists' : 'null'}, Ready: ${this.clientReady})`);
    return result;
  }

  isClientReady() {
    if (this.mockMode) {
      console.log("🎭 Mock mode: client not ready");
      return false;
    }
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
      
      if (!this.mockMode && this.client) {
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
      
      if (!this.mockMode && this.client) {
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
      if (this.mockMode || !this.client || !this.clientReady) {
        console.log("📱 Connection check: false (mock mode or not ready)");
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
