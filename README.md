# WhatsApp Web JS Express Example

## Features
- WhatsApp Web JS integration
- Express server with EJS frontend
- QR code login
- Session stored in `sessions/` folder
- Service structure for WhatsApp logic

## Usage
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
