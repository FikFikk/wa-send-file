# WhatsApp Send File Service

A Node.js application for sending files via WhatsApp Web using Express and whatsapp-web.js.

## Features

- WhatsApp Web integration with QR code authentication
- File sending capabilities
- Session management
- Cross-platform support (Windows, Linux, macOS)
- Auto-detection of Chrome/Chromium browser

## Prerequisites

- Node.js (v14 or higher)
- Chrome or Chromium browser installed

## Installation

1. Clone the repository

```bash
git clone <repository-url>
cd wa-send-file-only
```

2. Install dependencies

```bash
npm install
```

## Configuration

### For Linux/Production Deployment

Make sure you have Chrome or Chromium installed:

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y google-chrome-stable

# Or install Chromium
sudo apt install -y chromium-browser

# CentOS/RHEL
sudo yum install -y google-chrome-stable

# Or install Chromium
sudo yum install -y chromium
```

### Environment Variables

Copy `.env.example` to `.env` and configure as needed:

```bash
cp .env.example .env
```

## Running the Application

### Quick Linux Setup (Recommended)

```bash
npm run setup:linux
```

### Development

```bash
npm run dev
```

### Production

```bash
npm start
```

### Using PM2 (Recommended for production)

```bash
# Start with PM2
npm run pm2:start

# Other PM2 commands
npm run pm2:restart  # Restart the app
npm run pm2:stop     # Stop the app
npm run pm2:logs     # View logs
npm run pm2:status   # Check status
```

## API Endpoints

- `GET /` - Main interface (login or dashboard)
- `GET /qr` - Get QR code for authentication
- `GET /status` - Check connection status
- `GET /logout` - Logout and restart session
- `POST /send-file` - Send file to WhatsApp contact
- `GET /conversations` - Get conversation history

## Troubleshooting

### Chrome/Chromium Issues

If you encounter Chrome executable errors:

1. **Linux**: Install Chrome or Chromium:

   ```bash
   # Install Google Chrome
   wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
   sudo sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list'
   sudo apt update
   sudo apt install google-chrome-stable
   ```

2. **Docker/Headless environments**: Install additional dependencies:
   ```bash
   sudo apt-get update
   sudo apt-get install -y \
     wget \
     gnupg \
     ca-certificates \
     procps \
     libxss1 \
     libasound2 \
     libatk-bridge2.0-0 \
     libdrm2 \
     libgtk-3-0 \
     libgbm-dev
   ```

### Common Issues

1. **"Cannot read properties of null"**: This usually means the WhatsApp client isn't properly initialized. Check Chrome installation and logs.

2. **Session issues**: Clear session data by deleting the `wwebjs_session` folder.

3. **PM2 restart loops**: Check PM2 logs with `pm2 logs` to identify the root cause.

## File Structure

```
├── app.js                 # Main application file
├── services/
│   └── whatsappService.js # WhatsApp service handler
├── views/
│   ├── index.ejs         # Dashboard view
│   └── login.ejs         # Login/QR view
├── public/               # Static files
├── logger.js             # Logging configuration
└── package.json          # Dependencies and scripts
```

## License

MIT License

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the server:
   ```bash
   npm start
   ```
3. Open [http://localhost:3000](http://localhost:3000) and scan the QR code with WhatsApp.

## Structure

- `services/whatsappService.js`: WhatsApp logic
- `sessions/`: Session storage
- `views/`: EJS templates
- `public/`: Static files
